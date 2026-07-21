use super::super::paths::plugins_dir_path;
use super::super::types::{PluginExecutionMode, PluginManifest};
use super::catalog::*;
use super::commands::*;
use super::repository::*;
use super::transaction::*;
use super::types::*;
use base64::Engine;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

fn workspace(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "nevo-marketplace-test-{}-{}",
        name,
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(path.join(".nevo/plugins")).expect("workspace");
    path
}

fn manifest(id: &str, version: &str, enabled: bool, kind: &str, source: &str) -> PluginManifest {
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
        execution_mode: PluginExecutionMode::TrustedWebview,
        data_version: 1,
        capabilities: None,
        editor_capabilities: vec!["editor.read".to_string()],
        ui_capabilities: vec![],
        workspace_capabilities: vec![],
        network: None,
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

    remove_marketplace_plugin_blocking(
        workspace.to_string_lossy().into_owned(),
        "plugin.market".to_string(),
    )
    .expect("remove marketplace");
    assert!(!marketplace_dir.exists());

    let user = manifest("plugin.user", "1.0.0", true, "user", "folder");
    write_plugin(&workspace, &user);
    let err = remove_marketplace_plugin_blocking(
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
            permission_fingerprint: None,
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
            permission_fingerprint: None,
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
            permission_fingerprint: None,
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
    .is_err());
    assert!(validate_marketplace_manifest(
        &manifest("plugin.ok", "1.0.0", true, "user", "folder"),
        "plugin.ok",
        &files,
    )
    .is_err());

    let mut sandboxed = manifest("plugin.v2", "1.0.0", true, "marketplace", "marketplace");
    sandboxed.execution_mode = PluginExecutionMode::SandboxedWorker;
    assert!(validate_marketplace_manifest(&sandboxed, "plugin.v2", &files).is_err());
    sandboxed.api_version = "2.0.0".to_string();
    sandboxed.capabilities = Some(vec!["editor.write".to_string()]);
    sandboxed.editor_capabilities.clear();
    assert!(validate_marketplace_manifest(&sandboxed, "plugin.v2", &files).is_ok());
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
    let mut marketplace_manifest =
        manifest("plugin.ok", "1.0.0", true, "marketplace", "marketplace");
    marketplace_manifest.api_version = "2.0.0".to_string();
    marketplace_manifest.execution_mode = PluginExecutionMode::SandboxedWorker;
    marketplace_manifest.capabilities = Some(vec!["editor.write".to_string()]);
    marketplace_manifest.editor_capabilities.clear();
    manifests.insert(
        "plugin.ok".to_string(),
        serde_json::to_string(&marketplace_manifest).expect("manifest json"),
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

#[test]
fn git_blob_hash_matches_git_object_format() {
    assert_eq!(
        git_blob_sha(b""),
        "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
    );
}

#[test]
fn crash_recovery_restores_plugin_storage_registry_and_y_doc() {
    let workspace = workspace("transaction-recovery");
    let plugin_id = "plugin.market";
    let target_plugin = plugins_dir_path(&workspace.to_string_lossy()).join(plugin_id);
    std::fs::create_dir_all(&target_plugin).expect("old plugin");
    std::fs::write(target_plugin.join("marker.txt"), b"old plugin").expect("old plugin marker");
    let storage_path = workspace.join(".nevo/plugin-data/plugin.market.json");
    let registry_path = workspace.join(".nevo/plugin-registry.json");
    let collab_path = workspace.join(".nevo/collab/note_1.yjs");
    write_workspace_file(&storage_path, br#"{"value":"old storage"}"#).expect("old storage");
    write_workspace_file(
            &registry_path,
            br#"{"version":1,"plugins":{"plugin.market":{"version":"1.0.0","dataVersion":1,"contributions":[]}}}"#,
        )
        .expect("old registry");
    write_workspace_file(&collab_path, b"old ydoc").expect("old ydoc");

    let transaction_id = uuid::Uuid::new_v4().to_string();
    let transaction_dir =
        marketplace_transaction_dir(&workspace, &transaction_id).expect("transaction path");
    let staged_plugin = transaction_dir.join("staged-plugin");
    std::fs::create_dir_all(&staged_plugin).expect("staged plugin");
    std::fs::write(staged_plugin.join("marker.txt"), b"new plugin").expect("new plugin marker");
    let migration = prepare_migration_files(MarketplaceMigrationBundle {
        workspace_storage: Some(serde_json::json!({ "value": "new storage" })),
        plugin_registry: Some(serde_json::json!({
            "version": 1,
            "plugins": {
                "plugin.market": {
                    "version": "2.0.0",
                    "dataVersion": 2,
                    "contributions": [],
                },
            },
        })),
        collab_states_base64: BTreeMap::from([(
            "note_1".to_string(),
            base64::engine::general_purpose::STANDARD.encode(b"new ydoc"),
        )]),
    })
    .expect("migration payload");
    let mut journal = MarketplaceTransactionJournal {
        transaction_id,
        plugin_id: plugin_id.to_string(),
        permission_fingerprint: "fingerprint".to_string(),
        previous_version: Some("1.0.0".to_string()),
        previous_data_version: Some(1),
        status: MarketplaceTransactionStatus::Committing,
        backups: marketplace_backup_entries(plugin_id, &migration),
    };
    write_transaction_journal(&transaction_dir, &journal).expect("journal");

    commit_marketplace_files(
        &workspace,
        &transaction_dir,
        &staged_plugin,
        &migration,
        &mut journal,
    )
    .expect("commit files");
    assert_eq!(
        std::fs::read(target_plugin.join("marker.txt")).expect("new plugin"),
        b"new plugin"
    );
    assert_eq!(std::fs::read(&collab_path).expect("new ydoc"), b"new ydoc");

    recover_marketplace_transaction(&workspace, &transaction_dir, &journal)
        .expect("crash recovery");
    assert_eq!(
        std::fs::read(target_plugin.join("marker.txt")).expect("restored plugin"),
        b"old plugin"
    );
    assert_eq!(
        std::fs::read(storage_path).expect("restored storage"),
        br#"{"value":"old storage"}"#
    );
    assert_eq!(
        std::fs::read(collab_path).expect("restored ydoc"),
        b"old ydoc"
    );
    assert!(!transaction_dir.exists());
    std::fs::remove_dir_all(workspace).expect("cleanup");
}

#[test]
fn migration_payload_validation_rejects_unsafe_notes_and_oversized_storage() {
    let unsafe_notes = MarketplaceMigrationBundle {
        collab_states_base64: BTreeMap::from([(
            "../other".to_string(),
            base64::engine::general_purpose::STANDARD.encode(b"state"),
        )]),
        ..MarketplaceMigrationBundle::default()
    };
    assert!(prepare_migration_files(unsafe_notes).is_err());

    let oversized = MarketplaceMigrationBundle {
        workspace_storage: Some(serde_json::json!({
            "value": "x".repeat(MAX_MIGRATION_STORAGE_BYTES),
        })),
        ..MarketplaceMigrationBundle::default()
    };
    assert!(prepare_migration_files(oversized).is_err());
}

#[test]
fn permission_fingerprint_changes_with_grants_or_network_policy() {
    let mut plugin = manifest("plugin.v2", "1.0.0", true, "marketplace", "marketplace");
    plugin.api_version = "2.0.0".to_string();
    plugin.execution_mode = PluginExecutionMode::SandboxedWorker;
    plugin.editor_capabilities.clear();
    plugin.capabilities = Some(vec!["editor.write".to_string()]);
    let baseline = plugin_permission_fingerprint(&plugin).expect("fingerprint");
    assert_eq!(
        baseline,
        plugin_permission_fingerprint(&plugin).expect("stable fingerprint")
    );

    plugin
        .capabilities
        .as_mut()
        .expect("capabilities")
        .push("network.fetch".to_string());
    plugin.network = Some(super::super::types::PluginNetworkPolicy {
        hosts: vec!["api.example.com".to_string()],
        methods: vec!["GET".to_string()],
    });
    assert_ne!(
        baseline,
        plugin_permission_fingerprint(&plugin).expect("expanded fingerprint")
    );
}

#[test]
fn commit_rejects_permission_fingerprint_mismatch_before_switching_files() {
    let workspace = workspace("permission-mismatch");
    let mut plugin = manifest("plugin.v2", "1.0.0", true, "marketplace", "marketplace");
    plugin.api_version = "2.0.0".to_string();
    plugin.execution_mode = PluginExecutionMode::SandboxedWorker;
    plugin.editor_capabilities.clear();
    plugin.capabilities = Some(vec!["editor.write".to_string()]);
    let expected_fingerprint =
        plugin_permission_fingerprint(&plugin).expect("permission fingerprint");

    let transaction_id = uuid::Uuid::new_v4().to_string();
    let transaction_dir =
        marketplace_transaction_dir(&workspace, &transaction_id).expect("transaction path");
    let staged_plugin = transaction_dir.join("staged-plugin");
    std::fs::create_dir_all(&staged_plugin).expect("staged plugin");
    std::fs::write(
        staged_plugin.join("manifest.json"),
        serde_json::to_vec_pretty(&plugin).expect("manifest json"),
    )
    .expect("staged manifest");
    write_transaction_journal(
        &transaction_dir,
        &MarketplaceTransactionJournal {
            transaction_id: transaction_id.clone(),
            plugin_id: plugin.id.clone(),
            permission_fingerprint: expected_fingerprint,
            previous_version: None,
            previous_data_version: None,
            status: MarketplaceTransactionStatus::Prepared,
            backups: vec![],
        },
    )
    .expect("journal");

    let error = commit_marketplace_plugin_blocking(
        workspace.to_string_lossy().into_owned(),
        transaction_id,
        "unconfirmed-fingerprint".to_string(),
        None,
    )
    .expect_err("mismatched permission fingerprint must fail");

    assert!(error.contains("permissions changed"));
    assert!(!plugins_dir_path(&workspace.to_string_lossy())
        .join("plugin.v2")
        .exists());
    assert!(staged_plugin.exists());
    std::fs::remove_dir_all(workspace).expect("cleanup");
}
