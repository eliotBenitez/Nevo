use super::paths::{plugins_dir_path, workspace_context};
use super::plugins::{list_plugins, validate_plugin_id};
use super::settings::is_extended_diagnostics_enabled;
use super::types::PluginManifest;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use crate::logging::{LogContext, LogError};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

const MARKETPLACE_REPO: &str = "eliotBenitez/nevo-marketplace";
const MARKETPLACE_BRANCH: &str = "main";
const MARKETPLACE_TREE_URL: &str =
    "https://api.github.com/repos/eliotBenitez/nevo-marketplace/git/trees/main?recursive=1";
const MARKETPLACE_RAW_BASE: &str =
    "https://raw.githubusercontent.com/eliotBenitez/nevo-marketplace/main";
const MARKETPLACE_META_FILE: &str = ".nevo-marketplace.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCatalog {
    pub repo: String,
    pub branch: String,
    pub updated_at: String,
    pub from_cache: bool,
    pub error: Option<String>,
    pub plugins: Vec<MarketplaceCatalogItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCatalogItem {
    pub plugin_id: String,
    pub plugin_path: String,
    pub tree_sha: String,
    pub status: MarketplacePluginStatus,
    pub manifest: Option<PluginManifest>,
    pub manifest_error: Option<String>,
    pub installed_version: Option<String>,
    pub source_url: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MarketplacePluginStatus {
    NotInstalled,
    Installed,
    UpdateAvailable,
    Disabled,
    Invalid,
    Conflict,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceInstallMetadata {
    pub repo: String,
    pub branch: String,
    pub plugin_path: String,
    pub tree_sha: String,
    pub installed_version: String,
    pub installed_at: String,
    pub files: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubTreeResponse {
    tree: Vec<GitHubTreeEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubTreeEntry {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: String,
}

#[derive(Debug, Clone)]
struct MarketplaceFile {
    relative_path: String,
    sha: String,
}

#[tauri::command]
pub async fn marketplace_list_plugins(
    workspace_path: String,
    force_refresh: bool,
) -> Result<MarketplaceCatalog, String> {
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_list_plugins")?;
    let cache_path = cache_path(&workspace_path);

    if !force_refresh {
        if let Ok(cached) = read_cache(&cache_path) {
            return Ok(with_workspace_statuses(cached, &workspace_path, true, None));
        }
    }

    match fetch_catalog_tree().await {
        Ok(tree) => {
            let catalog = build_catalog_from_remote_tree(&tree, &workspace_path).await?;
            write_cache(&cache_path, &catalog)?;
            Ok(catalog)
        }
        Err(error) => {
            if let Ok(cached) = read_cache(&cache_path) {
                Ok(with_workspace_statuses(
                    cached,
                    &workspace_path,
                    true,
                    Some(error),
                ))
            } else {
                Err(error)
            }
        }
    }
}

#[tauri::command]
pub async fn marketplace_refresh_cache(
    workspace_path: String,
) -> Result<MarketplaceCatalog, String> {
    marketplace_list_plugins(workspace_path, true).await
}

#[tauri::command]
pub async fn marketplace_install_plugin(
    workspace_path: String,
    plugin_id: String,
    version: Option<String>,
) -> Result<PluginManifest, String> {
    install_marketplace_plugin(workspace_path, plugin_id, version, None).await
}

#[tauri::command]
pub async fn marketplace_update_plugin(
    workspace_path: String,
    plugin_id: String,
) -> Result<PluginManifest, String> {
    install_marketplace_plugin(workspace_path, plugin_id, None, Some(true)).await
}

#[tauri::command]
pub fn marketplace_remove_plugin(workspace_path: String, plugin_id: String) -> Result<(), String> {
    validate_plugin_id(&plugin_id)?;
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_remove_plugin")?;
    let target_dir = plugins_dir_path(&workspace_path).join(&plugin_id);
    let manifest = read_installed_manifest(&target_dir)?;

    if !is_marketplace_manifest(&manifest) || !target_dir.join(MARKETPLACE_META_FILE).exists() {
        return Err(
            "Only marketplace plugins can be removed by marketplace_remove_plugin".to_string(),
        );
    }

    std::fs::remove_dir_all(&target_dir).map_err(|error| error.to_string())?;
    log_marketplace_info(
        "marketplace_remove_plugin",
        "Removed marketplace plugin",
        &workspace_path,
        serde_json::json!({ "pluginId": plugin_id }),
    );
    Ok(())
}

async fn install_marketplace_plugin(
    workspace_path: String,
    plugin_id: String,
    version: Option<String>,
    update: Option<bool>,
) -> Result<PluginManifest, String> {
    validate_plugin_id(&plugin_id)?;
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_install_plugin")?;
    let catalog = marketplace_list_plugins(workspace_path.clone(), true).await?;
    let item = catalog
        .plugins
        .into_iter()
        .find(|plugin| plugin.plugin_id == plugin_id)
        .ok_or_else(|| "Marketplace plugin not found".to_string())?;

    if item.status == MarketplacePluginStatus::Invalid {
        return Err(item
            .manifest_error
            .unwrap_or_else(|| "Marketplace plugin manifest is invalid".to_string()));
    }
    if item.status == MarketplacePluginStatus::Conflict {
        return Err("A system or user plugin with this id is already installed".to_string());
    }

    let mut manifest = item
        .manifest
        .clone()
        .ok_or_else(|| "Marketplace plugin manifest is missing".to_string())?;
    if let Some(expected_version) = version {
        if manifest.version != expected_version {
            return Err(
                "Requested marketplace plugin version is not available on the active branch"
                    .to_string(),
            );
        }
    }

    let target_dir = plugins_dir_path(&workspace_path).join(&plugin_id);
    let existing_manifest = read_installed_manifest(&target_dir).ok();
    if let Some(existing) = existing_manifest.as_ref() {
        if !is_marketplace_manifest(existing) {
            return Err("A system or user plugin with this id is already installed".to_string());
        }
        if update.unwrap_or(false) {
            manifest.enabled = existing.enabled;
        }
    }

    let tmp_dir = plugins_dir_path(&workspace_path).join(format!(
        ".tmp-{}-{}",
        plugin_id,
        uuid::Uuid::new_v4()
    ));
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir).map_err(|error| error.to_string())?;
    }
    std::fs::create_dir_all(&tmp_dir).map_err(|error| error.to_string())?;

    if let Err(error) = download_plugin_files(&item, &tmp_dir).await {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(error);
    }

    let manifest_content =
        serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
    std::fs::write(tmp_dir.join("manifest.json"), manifest_content)
        .map_err(|error| error.to_string())?;

    let metadata = MarketplaceInstallMetadata {
        repo: MARKETPLACE_REPO.to_string(),
        branch: MARKETPLACE_BRANCH.to_string(),
        plugin_path: item.plugin_path.clone(),
        tree_sha: item.tree_sha.clone(),
        installed_version: manifest.version.clone(),
        installed_at: Utc::now().to_rfc3339(),
        files: item.files.clone(),
    };
    let metadata_content =
        serde_json::to_string_pretty(&metadata).map_err(|error| error.to_string())?;
    std::fs::write(tmp_dir.join(MARKETPLACE_META_FILE), metadata_content)
        .map_err(|error| error.to_string())?;

    replace_plugin_dir(&target_dir, &tmp_dir)?;
    log_marketplace_info(
        if update.unwrap_or(false) {
            "marketplace_update_plugin"
        } else {
            "marketplace_install_plugin"
        },
        "Installed marketplace plugin",
        &workspace_path,
        serde_json::json!({ "pluginId": plugin_id, "version": manifest.version }),
    );
    Ok(manifest)
}

async fn fetch_catalog_tree() -> Result<Vec<GitHubTreeEntry>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(MARKETPLACE_TREE_URL)
        .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Marketplace request failed with {}",
            response.status()
        ));
    }

    let payload = response
        .json::<GitHubTreeResponse>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(payload.tree)
}

async fn build_catalog_from_remote_tree(
    tree: &[GitHubTreeEntry],
    workspace_path: &str,
) -> Result<MarketplaceCatalog, String> {
    let grouped = group_marketplace_files(tree).0;
    let client = reqwest::Client::new();
    let mut manifests = BTreeMap::new();

    for (plugin_id, files) in &grouped {
        if !files
            .iter()
            .any(|file| file.relative_path == "manifest.json")
        {
            continue;
        }
        let manifest_url = format!(
            "{}/{}",
            MARKETPLACE_RAW_BASE,
            encode_raw_path(&format!("plugins/{}/manifest.json", plugin_id))
        );
        let response = client
            .get(manifest_url)
            .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            continue;
        }
        let content = response.text().await.map_err(|error| error.to_string())?;
        manifests.insert(plugin_id.clone(), content);
    }

    Ok(build_catalog_from_tree(
        tree,
        &manifests,
        workspace_path,
        false,
        None,
    ))
}

async fn download_plugin_files(
    item: &MarketplaceCatalogItem,
    tmp_dir: &Path,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    for file in &item.files {
        let safe_path = safe_relative_path(file)?;
        let url = format!(
            "{}/{}",
            MARKETPLACE_RAW_BASE,
            encode_raw_path(&format!("{}/{}", item.plugin_path, file))
        );
        let response = client
            .get(url)
            .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to download marketplace file {}", file));
        }
        let bytes = response.bytes().await.map_err(|error| error.to_string())?;
        let target = tmp_dir.join(&safe_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(target, bytes).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn build_catalog_from_tree(
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

fn group_marketplace_files(
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

fn with_workspace_statuses(
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

fn apply_workspace_status(
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

fn validate_marketplace_manifest(
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
    if manifest.entry_point.trim().is_empty() {
        return Err("entryPoint is required".to_string());
    }
    safe_relative_path(&manifest.entry_point)?;
    if !files.iter().any(|file| file == &manifest.entry_point) {
        return Err("entryPoint file is missing".to_string());
    }
    Ok(())
}

fn grouped_contains(items: &[MarketplaceCatalogItem], plugin_id: &str) -> bool {
    items.iter().any(|item| item.plugin_id == plugin_id)
}

fn installed_plugin_map(workspace_path: &str) -> BTreeMap<String, PluginManifest> {
    list_plugins(workspace_path.to_string())
        .unwrap_or_default()
        .into_iter()
        .map(|plugin| (plugin.id.clone(), plugin))
        .collect()
}

fn is_marketplace_manifest(manifest: &PluginManifest) -> bool {
    manifest.kind == "marketplace" && manifest.source == "marketplace"
}

fn read_installed_manifest(plugin_dir: &Path) -> Result<PluginManifest, String> {
    let content = std::fs::read_to_string(plugin_dir.join("manifest.json"))
        .map_err(|error| error.to_string())?;
    serde_json::from_str::<PluginManifest>(&content).map_err(|error| error.to_string())
}

fn replace_plugin_dir(target_dir: &Path, tmp_dir: &Path) -> Result<(), String> {
    let parent = target_dir
        .parent()
        .ok_or_else(|| "Invalid plugin target directory".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let backup_dir = parent.join(format!(
        ".bak-{}-{}",
        target_dir
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("plugin"),
        uuid::Uuid::new_v4()
    ));

    let had_existing = target_dir.exists();
    if had_existing {
        std::fs::rename(target_dir, &backup_dir).map_err(|error| error.to_string())?;
    }
    if let Err(error) = std::fs::rename(tmp_dir, target_dir) {
        if had_existing {
            let _ = std::fs::rename(&backup_dir, target_dir);
        }
        return Err(error.to_string());
    }
    if had_existing {
        let _ = std::fs::remove_dir_all(backup_dir);
    }
    Ok(())
}

fn read_cache(cache_path: &Path) -> Result<MarketplaceCatalog, String> {
    let content = std::fs::read_to_string(cache_path).map_err(|error| error.to_string())?;
    serde_json::from_str::<MarketplaceCatalog>(&content).map_err(|error| error.to_string())
}

fn write_cache(cache_path: &Path, catalog: &MarketplaceCatalog) -> Result<(), String> {
    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(catalog).map_err(|error| error.to_string())?;
    write_atomic(cache_path, content.as_bytes()).map_err(|error| error.to_string())
}

fn cache_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/marketplace/cache.json")
}

fn normalize_workspace(workspace_path: &str, event: &str) -> Result<String, String> {
    let logger = crate::logging::logger();
    normalize_workspace_path(workspace_path)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|message| {
            let _ = logger.error(
                "tauri.workspace",
                event,
                "Failed to normalize workspace path",
                LogContext::default().with_error(LogError {
                    kind: Some("path".to_string()),
                    message: message.clone(),
                    details: None,
                }),
            );
            message
        })
}

fn split_plugin_tree_path(path: &str) -> Option<(String, String)> {
    let mut parts = path.splitn(3, '/');
    if parts.next()? != "plugins" {
        return None;
    }
    let plugin_id = parts.next()?.to_string();
    let relative_path = parts.next()?.to_string();
    Some((plugin_id, relative_path))
}

fn safe_relative_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') {
        return Err("Unsafe marketplace path".to_string());
    }
    let candidate = Path::new(path);
    if candidate
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Unsafe marketplace path".to_string());
    }
    Ok(candidate.to_path_buf())
}

fn encode_raw_path(path: &str) -> String {
    path.split('/')
        .map(|segment| segment.replace(' ', "%20"))
        .collect::<Vec<_>>()
        .join("/")
}

fn log_marketplace_info(
    event: &str,
    message: &str,
    workspace_path: &str,
    payload: serde_json::Value,
) {
    let diagnostics_enabled = is_extended_diagnostics_enabled(workspace_path);
    let _ = crate::logging::logger().info(
        "tauri.workspace",
        event,
        message,
        diagnostics_enabled,
        workspace_context(workspace_path).with_payload(payload),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "nevo-marketplace-test-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(path.join(".nevo/plugins")).expect("workspace");
        path
    }

    fn manifest(
        id: &str,
        version: &str,
        enabled: bool,
        kind: &str,
        source: &str,
    ) -> PluginManifest {
        PluginManifest {
            id: id.to_string(),
            name: "Plugin".to_string(),
            version: version.to_string(),
            description: "Plugin".to_string(),
            enabled,
            kind: kind.to_string(),
            source: source.to_string(),
            entry_point: "index.js".to_string(),
            api_version: "1.0.0".to_string(),
            editor_capabilities: vec!["editor.read".to_string()],
            ui_capabilities: vec![],
            workspace_capabilities: vec![],
            nevo_version_range: None,
            priority: None,
            settings_schema: vec![],
        }
    }

    fn write_plugin(workspace: &Path, plugin: &PluginManifest) {
        let dir = plugins_dir_path(&workspace.to_string_lossy()).join(&plugin.id);
        std::fs::create_dir_all(&dir).expect("plugin dir");
        std::fs::write(
            dir.join("manifest.json"),
            serde_json::to_string_pretty(plugin).expect("manifest"),
        )
        .expect("write manifest");
    }

    #[test]
    fn rejects_unsafe_relative_paths() {
        assert!(safe_relative_path("index.js").is_ok());
        assert!(safe_relative_path("assets/icon.svg").is_ok());
        assert!(safe_relative_path("../secret").is_err());
        assert!(safe_relative_path("/tmp/file").is_err());
        assert!(safe_relative_path("a\\b").is_err());
    }

    #[test]
    fn marketplace_remove_only_deletes_marketplace_plugins() {
        let workspace = workspace("remove");
        let marketplace = manifest("plugin.market", "1.0.0", true, "marketplace", "marketplace");
        write_plugin(&workspace, &marketplace);
        let marketplace_dir = plugins_dir_path(&workspace.to_string_lossy()).join("plugin.market");
        std::fs::write(marketplace_dir.join(MARKETPLACE_META_FILE), "{}").expect("metadata");

        marketplace_remove_plugin(
            workspace.to_string_lossy().into_owned(),
            "plugin.market".to_string(),
        )
        .expect("remove marketplace");
        assert!(!marketplace_dir.exists());

        let user = manifest("plugin.user", "1.0.0", true, "user", "folder");
        write_plugin(&workspace, &user);
        let err = marketplace_remove_plugin(
            workspace.to_string_lossy().into_owned(),
            "plugin.user".to_string(),
        )
        .expect_err("must reject user plugin");
        assert!(err.contains("Only marketplace"));
        assert!(plugins_dir_path(&workspace.to_string_lossy())
            .join("plugin.user")
            .exists());

        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn statuses_detect_disabled_updates_and_conflicts() {
        let workspace = workspace("statuses");
        write_plugin(
            &workspace,
            &manifest(
                "plugin.disabled",
                "1.0.0",
                false,
                "marketplace",
                "marketplace",
            ),
        );
        write_plugin(
            &workspace,
            &manifest("plugin.update", "0.9.0", true, "marketplace", "marketplace"),
        );
        write_plugin(
            &workspace,
            &manifest("plugin.conflict", "1.0.0", true, "user", "folder"),
        );

        let mut items = vec![
            MarketplaceCatalogItem {
                plugin_id: "plugin.disabled".to_string(),
                plugin_path: "plugins/plugin.disabled".to_string(),
                tree_sha: "sha".to_string(),
                status: MarketplacePluginStatus::Invalid,
                manifest: Some(manifest(
                    "plugin.disabled",
                    "1.0.0",
                    true,
                    "marketplace",
                    "marketplace",
                )),
                manifest_error: None,
                installed_version: None,
                source_url: String::new(),
                files: vec!["manifest.json".to_string(), "index.js".to_string()],
            },
            MarketplaceCatalogItem {
                plugin_id: "plugin.update".to_string(),
                plugin_path: "plugins/plugin.update".to_string(),
                tree_sha: "sha".to_string(),
                status: MarketplacePluginStatus::Invalid,
                manifest: Some(manifest(
                    "plugin.update",
                    "1.0.0",
                    true,
                    "marketplace",
                    "marketplace",
                )),
                manifest_error: None,
                installed_version: None,
                source_url: String::new(),
                files: vec!["manifest.json".to_string(), "index.js".to_string()],
            },
            MarketplaceCatalogItem {
                plugin_id: "plugin.conflict".to_string(),
                plugin_path: "plugins/plugin.conflict".to_string(),
                tree_sha: "sha".to_string(),
                status: MarketplacePluginStatus::Invalid,
                manifest: Some(manifest(
                    "plugin.conflict",
                    "1.0.0",
                    true,
                    "marketplace",
                    "marketplace",
                )),
                manifest_error: None,
                installed_version: None,
                source_url: String::new(),
                files: vec!["manifest.json".to_string(), "index.js".to_string()],
            },
        ];
        let installed = installed_plugin_map(&workspace.to_string_lossy());
        items = items
            .into_iter()
            .map(|item| {
                let installed_plugin = installed.get(&item.plugin_id);
                apply_workspace_status(item, installed_plugin)
            })
            .collect();

        assert_eq!(items[0].status, MarketplacePluginStatus::Disabled);
        assert_eq!(items[1].status, MarketplacePluginStatus::UpdateAvailable);
        assert_eq!(items[2].status, MarketplacePluginStatus::Conflict);
        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn validate_marketplace_manifest_requires_marketplace_source_and_entry() {
        let files = vec!["manifest.json".to_string(), "index.js".to_string()];
        assert!(validate_marketplace_manifest(
            &manifest("plugin.ok", "1.0.0", true, "marketplace", "marketplace"),
            "plugin.ok",
            &files,
        )
        .is_ok());
        assert!(validate_marketplace_manifest(
            &manifest("plugin.ok", "1.0.0", true, "user", "folder"),
            "plugin.ok",
            &files,
        )
        .is_err());
    }

    #[test]
    fn builds_catalog_from_github_tree_and_manifest_content() {
        let workspace = workspace("catalog");
        let tree = vec![
            GitHubTreeEntry {
                path: "plugins/plugin.ok/manifest.json".to_string(),
                mode: "100644".to_string(),
                entry_type: "blob".to_string(),
                sha: "manifest-sha".to_string(),
            },
            GitHubTreeEntry {
                path: "plugins/plugin.ok/index.js".to_string(),
                mode: "100644".to_string(),
                entry_type: "blob".to_string(),
                sha: "index-sha".to_string(),
            },
        ];
        let mut manifests = BTreeMap::new();
        manifests.insert(
            "plugin.ok".to_string(),
            serde_json::to_string(&manifest(
                "plugin.ok",
                "1.0.0",
                true,
                "marketplace",
                "marketplace",
            ))
            .expect("manifest json"),
        );

        let catalog =
            build_catalog_from_tree(&tree, &manifests, &workspace.to_string_lossy(), false, None);

        assert_eq!(catalog.plugins.len(), 1);
        assert_eq!(catalog.plugins[0].plugin_id, "plugin.ok");
        assert_eq!(
            catalog.plugins[0].status,
            MarketplacePluginStatus::NotInstalled
        );
        assert_eq!(catalog.plugins[0].files, vec!["manifest.json", "index.js"]);
        std::fs::remove_dir_all(workspace).expect("cleanup");
    }
}
