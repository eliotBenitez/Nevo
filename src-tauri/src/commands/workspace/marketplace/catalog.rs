use super::super::plugins::{list_plugins, validate_plugin_id};
use super::super::types::{PluginExecutionMode, PluginManifest};
use super::repository::{
    safe_relative_path, split_plugin_tree_path, GitHubTreeEntry, MarketplaceFile,
    MARKETPLACE_BRANCH, MARKETPLACE_REPO,
};
use super::types::{MarketplaceCatalog, MarketplaceCatalogItem, MarketplacePluginStatus};
use chrono::Utc;
use sha2::Digest;
use std::collections::BTreeMap;
use std::path::Path;

pub(super) fn build_catalog_from_tree(
    tree: &[GitHubTreeEntry],
    manifest_contents: &BTreeMap<String, String>,
    workspace_path: &str,
    from_cache: bool,
    error: Option<String>,
) -> MarketplaceCatalog {
    let (grouped, invalid) = group_marketplace_files(tree);
    let installed = installed_plugin_map(workspace_path);
    let mut plugins = Vec::with_capacity(grouped.len() + invalid.len());

    for (plugin_id, files) in grouped {
        let manifest_file = files
            .iter()
            .find(|file| file.relative_path == "manifest.json");
        let plugin_path = format!("plugins/{}", plugin_id);
        let source_url = format!(
            "https://github.com/{}/tree/{}/{}",
            MARKETPLACE_REPO, MARKETPLACE_BRANCH, plugin_path
        );
        let file_names = files
            .iter()
            .map(|file| file.relative_path.clone())
            .collect::<Vec<_>>();
        let tree_sha = files
            .iter()
            .map(|file| file.sha.as_str())
            .collect::<Vec<_>>()
            .join(":");

        let mut manifest_error = invalid.get(&plugin_id).cloned();
        let manifest = if manifest_file.is_none() {
            manifest_error.get_or_insert_with(|| "manifest.json is missing".to_string());
            None
        } else if let Some(content) = manifest_contents.get(&plugin_id) {
            match serde_json::from_str::<PluginManifest>(content) {
                Ok(manifest) => {
                    if let Err(error) =
                        validate_marketplace_manifest(&manifest, &plugin_id, &file_names)
                    {
                        manifest_error.get_or_insert(error);
                        None
                    } else {
                        Some(manifest)
                    }
                }
                Err(error) => {
                    manifest_error.get_or_insert_with(|| error.to_string());
                    None
                }
            }
        } else {
            manifest_error
                .get_or_insert_with(|| "manifest.json could not be downloaded".to_string());
            None
        };

        let permission_fingerprint = manifest
            .as_ref()
            .and_then(|value| plugin_permission_fingerprint(value).ok());
        let item = MarketplaceCatalogItem {
            plugin_id: plugin_id.clone(),
            plugin_path,
            tree_sha,
            status: MarketplacePluginStatus::Invalid,
            manifest,
            manifest_error,
            installed_version: None,
            source_url,
            files: file_names,
            permission_fingerprint,
        };
        plugins.push(apply_workspace_status(item, installed.get(&plugin_id)));
    }

    for (plugin_id, manifest_error) in invalid {
        if grouped_contains(&plugins, &plugin_id) {
            continue;
        }
        let plugin_path = format!("plugins/{}", plugin_id);
        plugins.push(apply_workspace_status(
            MarketplaceCatalogItem {
                plugin_id: plugin_id.clone(),
                plugin_path: plugin_path.clone(),
                tree_sha: String::new(),
                status: MarketplacePluginStatus::Invalid,
                manifest: None,
                manifest_error: Some(manifest_error),
                installed_version: None,
                source_url: format!(
                    "https://github.com/{}/tree/{}/{}",
                    MARKETPLACE_REPO, MARKETPLACE_BRANCH, plugin_path
                ),
                files: vec![],
                permission_fingerprint: None,
            },
            installed.get(&plugin_id),
        ));
    }

    plugins.sort_by(|a, b| a.plugin_id.cmp(&b.plugin_id));
    MarketplaceCatalog {
        repo: MARKETPLACE_REPO.to_string(),
        branch: MARKETPLACE_BRANCH.to_string(),
        updated_at: Utc::now().to_rfc3339(),
        from_cache,
        error,
        plugins,
    }
}

pub(super) fn group_marketplace_files(
    tree: &[GitHubTreeEntry],
) -> (
    BTreeMap<String, Vec<MarketplaceFile>>,
    BTreeMap<String, String>,
) {
    let mut grouped: BTreeMap<String, Vec<MarketplaceFile>> = BTreeMap::new();
    let mut invalid: BTreeMap<String, String> = BTreeMap::new();

    for entry in tree {
        if !entry.path.starts_with("plugins/") {
            continue;
        }
        let Some((plugin_id, relative_path)) = split_plugin_tree_path(&entry.path) else {
            continue;
        };
        if let Err(error) = validate_plugin_id(&plugin_id) {
            invalid.insert(plugin_id, error);
            continue;
        }
        if entry.entry_type != "blob" {
            continue;
        }
        if entry.mode == "120000" || safe_relative_path(&relative_path).is_err() {
            invalid.insert(
                plugin_id,
                "Marketplace plugin contains an unsafe path".to_string(),
            );
            continue;
        }
        grouped.entry(plugin_id).or_default().push(MarketplaceFile {
            relative_path,
            sha: entry.sha.clone(),
        });
    }

    (grouped, invalid)
}

pub(super) fn with_workspace_statuses(
    mut catalog: MarketplaceCatalog,
    workspace_path: &str,
    from_cache: bool,
    error: Option<String>,
) -> MarketplaceCatalog {
    let installed = installed_plugin_map(workspace_path);
    catalog.from_cache = from_cache;
    catalog.error = error;
    catalog.plugins = catalog
        .plugins
        .into_iter()
        .map(|item| {
            let installed_plugin = installed.get(&item.plugin_id);
            apply_workspace_status(item, installed_plugin)
        })
        .collect();
    catalog
}

pub(super) fn apply_workspace_status(
    mut item: MarketplaceCatalogItem,
    installed: Option<&PluginManifest>,
) -> MarketplaceCatalogItem {
    if item.manifest.is_none() || item.manifest_error.is_some() {
        item.status = MarketplacePluginStatus::Invalid;
        return item;
    }

    if let Some(installed) = installed {
        item.installed_version = Some(installed.version.clone());
        if !is_marketplace_manifest(installed) {
            item.status = MarketplacePluginStatus::Conflict;
        } else if installed.version
            != item
                .manifest
                .as_ref()
                .map(|manifest| manifest.version.as_str())
                .unwrap_or_default()
        {
            item.status = MarketplacePluginStatus::UpdateAvailable;
        } else if !installed.enabled {
            item.status = MarketplacePluginStatus::Disabled;
        } else {
            item.status = MarketplacePluginStatus::Installed;
        }
        return item;
    }

    item.status = MarketplacePluginStatus::NotInstalled;
    item
}

pub(super) fn validate_marketplace_manifest(
    manifest: &PluginManifest,
    plugin_id: &str,
    files: &[String],
) -> Result<(), String> {
    validate_plugin_id(&manifest.id)?;
    if manifest.id != plugin_id {
        return Err("manifest id does not match marketplace folder".to_string());
    }
    if manifest.kind != "marketplace" || manifest.source != "marketplace" {
        return Err("marketplace manifest must use kind/source marketplace".to_string());
    }
    if manifest.api_version.trim().is_empty() {
        return Err("apiVersion is required".to_string());
    }
    if manifest.execution_mode != PluginExecutionMode::SandboxedWorker {
        return Err("new marketplace publications must use sandboxed-worker".to_string());
    }
    if manifest.api_version.split('.').next() != Some("2") {
        return Err("sandboxed-worker requires apiVersion 2.x".to_string());
    }
    if manifest.data_version == 0 {
        return Err("dataVersion must be a positive integer".to_string());
    }
    let capabilities = manifest
        .capabilities
        .as_ref()
        .ok_or_else(|| "SDK V2 manifest requires capabilities".to_string())?;
    let allowed_capabilities = [
        "editor.read",
        "editor.write",
        "editor.write.self",
        "editor.schema",
        "ui.contributions",
        "ui.iframe",
        "ui.blockFrame",
        "ui.navigation",
        "workspace.read",
        "workspace.write",
        "note.read",
        "note.write",
        "template.read",
        "template.write",
        "kanban.read",
        "kanban.write",
        "settings.read",
        "settings.write",
        "secrets.read",
        "storage.local",
        "storage.workspace",
        "assets.read",
        "assets.write",
        "runtime.events",
        "runtime.scheduling",
        "network.fetch",
    ];
    let mut unique = std::collections::BTreeSet::new();
    for capability in capabilities {
        if !allowed_capabilities.contains(&capability.as_str()) {
            return Err(format!("unknown plugin capability: {capability}"));
        }
        if !unique.insert(capability) {
            return Err(format!("duplicate plugin capability: {capability}"));
        }
    }
    // Split capability arrays may be populated by legacy serde defaults, but
    // are deliberately ignored for SDK V2. Only `capabilities` is authorized.
    if let Some(network) = &manifest.network {
        if !capabilities.iter().any(|value| value == "network.fetch") {
            return Err("network policy requires capability network.fetch".to_string());
        }
        let allowed_methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
        for method in &network.methods {
            if !allowed_methods.contains(&method.as_str()) {
                return Err(format!("network method is not allowed: {method}"));
            }
        }
        for host in &network.hosts {
            let bare = host.strip_prefix("*.").unwrap_or(host);
            if bare.is_empty()
                || bare.starts_with('.')
                || bare.ends_with('.')
                || bare.contains("..")
                || !bare.chars().all(|character| {
                    character.is_ascii_alphanumeric() || character == '.' || character == '-'
                })
            {
                return Err(format!("network host is invalid: {host}"));
            }
        }
    }
    if manifest.entry_point.trim().is_empty() {
        return Err("entryPoint is required".to_string());
    }
    safe_relative_path(&manifest.entry_point)?;
    if !files.iter().any(|file| file == &manifest.entry_point) {
        return Err("entryPoint file is missing".to_string());
    }
    Ok(())
}

pub(super) fn plugin_permission_fingerprint(manifest: &PluginManifest) -> Result<String, String> {
    let capabilities = manifest
        .capabilities
        .clone()
        .unwrap_or_default()
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>();
    let network = manifest.network.as_ref().map(|policy| {
        serde_json::json!({
            "hosts": policy.hosts.iter().cloned().collect::<std::collections::BTreeSet<_>>(),
            "methods": policy.methods.iter().cloned().collect::<std::collections::BTreeSet<_>>(),
        })
    });
    let canonical = serde_json::to_vec(&serde_json::json!({
        "executionMode": manifest.execution_mode,
        "capabilities": capabilities,
        "network": network,
    }))
    .map_err(|error| error.to_string())?;
    let mut hasher = sha2::Sha256::new();
    hasher.update(canonical);
    Ok(format!("{:x}", hasher.finalize()))
}

fn grouped_contains(items: &[MarketplaceCatalogItem], plugin_id: &str) -> bool {
    items.iter().any(|item| item.plugin_id == plugin_id)
}

pub(super) fn installed_plugin_map(workspace_path: &str) -> BTreeMap<String, PluginManifest> {
    list_plugins(workspace_path.to_string())
        .unwrap_or_default()
        .into_iter()
        .map(|plugin| (plugin.id.clone(), plugin))
        .collect()
}

pub(super) fn is_marketplace_manifest(manifest: &PluginManifest) -> bool {
    manifest.kind == "marketplace" && manifest.source == "marketplace"
}

pub(super) fn read_installed_manifest(plugin_dir: &Path) -> Result<PluginManifest, String> {
    let content = std::fs::read_to_string(plugin_dir.join("manifest.json"))
        .map_err(|error| error.to_string())?;
    serde_json::from_str::<PluginManifest>(&content).map_err(|error| error.to_string())
}
