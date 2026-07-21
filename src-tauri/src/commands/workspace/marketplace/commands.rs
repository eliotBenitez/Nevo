use super::super::paths::{plugins_dir_path, workspace_context};
use super::super::plugins::validate_plugin_id;
use super::super::settings::is_extended_diagnostics_enabled;
use super::super::types::PluginManifest;
use super::catalog::{
    is_marketplace_manifest, plugin_permission_fingerprint, read_installed_manifest,
    with_workspace_statuses,
};
use super::repository::{
    build_catalog_from_remote_tree, cache_path, download_plugin_files, fetch_catalog_tree,
    read_cache, write_cache, MARKETPLACE_BRANCH, MARKETPLACE_META_FILE, MARKETPLACE_REPO,
};
use super::transaction::{
    commit_marketplace_files, marketplace_backup_entries, marketplace_lock,
    marketplace_transaction_dir, prepare_migration_files, read_transaction_journal,
    recover_marketplace_transaction, recover_marketplace_transactions, write_transaction_journal,
    MarketplaceTransactionJournal, MarketplaceTransactionStatus,
};
use super::types::{
    MarketplaceCatalog, MarketplaceInstallMetadata, MarketplaceMigrationBundle,
    MarketplacePluginStatus, MarketplacePreparedPlugin,
};
use crate::commands::path_utils::normalize_workspace_path;
use crate::logging::{LogContext, LogError};
use chrono::Utc;
use std::path::Path;

#[tauri::command]
pub async fn marketplace_list_plugins(
    workspace_path: String,
    force_refresh: bool,
) -> Result<MarketplaceCatalog, String> {
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_list_plugins")?;
    {
        let lock = marketplace_lock(Path::new(&workspace_path));
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        recover_marketplace_transactions(Path::new(&workspace_path))?;
    }
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
    permission_fingerprint: String,
) -> Result<PluginManifest, String> {
    let prepared = prepare_marketplace_plugin(
        workspace_path.clone(),
        plugin_id,
        version,
        None,
        permission_fingerprint,
    )
    .await?;
    marketplace_commit_plugin(
        workspace_path,
        prepared.transaction_id,
        prepared.permission_fingerprint,
        None,
    )
    .await
}

#[tauri::command]
pub async fn marketplace_update_plugin(
    workspace_path: String,
    plugin_id: String,
    permission_fingerprint: String,
) -> Result<PluginManifest, String> {
    let prepared = prepare_marketplace_plugin(
        workspace_path.clone(),
        plugin_id,
        None,
        Some(true),
        permission_fingerprint,
    )
    .await?;
    marketplace_commit_plugin(
        workspace_path,
        prepared.transaction_id,
        prepared.permission_fingerprint,
        None,
    )
    .await
}

#[tauri::command]
pub async fn marketplace_prepare_plugin(
    workspace_path: String,
    plugin_id: String,
    version: Option<String>,
    update: bool,
    permission_fingerprint: String,
) -> Result<MarketplacePreparedPlugin, String> {
    prepare_marketplace_plugin(
        workspace_path,
        plugin_id,
        version,
        update.then_some(true),
        permission_fingerprint,
    )
    .await
}

#[tauri::command]
pub async fn marketplace_remove_plugin(
    workspace_path: String,
    plugin_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        remove_marketplace_plugin_blocking(workspace_path, plugin_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) fn remove_marketplace_plugin_blocking(
    workspace_path: String,
    plugin_id: String,
) -> Result<(), String> {
    validate_plugin_id(&plugin_id)?;
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_remove_plugin")?;
    let lock = marketplace_lock(Path::new(&workspace_path));
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    recover_marketplace_transactions(Path::new(&workspace_path))?;
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

async fn prepare_marketplace_plugin(
    workspace_path: String,
    plugin_id: String,
    version: Option<String>,
    update: Option<bool>,
    permission_fingerprint: String,
) -> Result<MarketplacePreparedPlugin, String> {
    validate_plugin_id(&plugin_id)?;
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_install_plugin")?;
    {
        let lock = marketplace_lock(Path::new(&workspace_path));
        let _guard = lock.lock().map_err(|error| error.to_string())?;
        recover_marketplace_transactions(Path::new(&workspace_path))?;
    }
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
    let confirmed_fingerprint = plugin_permission_fingerprint(&manifest)?;
    if permission_fingerprint != confirmed_fingerprint
        || item.permission_fingerprint.as_deref() != Some(confirmed_fingerprint.as_str())
    {
        return Err(
            "Plugin permissions changed before installation; review them again".to_string(),
        );
    }
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

    let transaction_id = uuid::Uuid::new_v4().to_string();
    let transaction_dir = marketplace_transaction_dir(Path::new(&workspace_path), &transaction_id)?;
    let staged_plugin_dir = transaction_dir.join("staged-plugin");
    std::fs::create_dir_all(&staged_plugin_dir).map_err(|error| error.to_string())?;

    if let Err(error) = download_plugin_files(&item, &staged_plugin_dir).await {
        let _ = std::fs::remove_dir_all(&transaction_dir);
        return Err(error);
    }

    let manifest_content =
        serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
    std::fs::write(staged_plugin_dir.join("manifest.json"), manifest_content)
        .map_err(|error| error.to_string())?;

    let metadata = MarketplaceInstallMetadata {
        repo: MARKETPLACE_REPO.to_string(),
        branch: MARKETPLACE_BRANCH.to_string(),
        plugin_path: item.plugin_path.clone(),
        tree_sha: item.tree_sha.clone(),
        installed_version: manifest.version.clone(),
        installed_at: Utc::now().to_rfc3339(),
        files: item.files.clone(),
        permission_fingerprint: confirmed_fingerprint.clone(),
    };
    let metadata_content =
        serde_json::to_string_pretty(&metadata).map_err(|error| error.to_string())?;
    std::fs::write(
        staged_plugin_dir.join(MARKETPLACE_META_FILE),
        metadata_content,
    )
    .map_err(|error| error.to_string())?;

    let previous_data_version = existing_manifest.as_ref().map(|value| value.data_version);
    let previous_version = existing_manifest
        .as_ref()
        .map(|value| value.version.clone());
    let journal = MarketplaceTransactionJournal {
        transaction_id: transaction_id.clone(),
        plugin_id: plugin_id.clone(),
        permission_fingerprint: confirmed_fingerprint.clone(),
        previous_version,
        previous_data_version,
        status: MarketplaceTransactionStatus::Prepared,
        backups: vec![],
    };
    write_transaction_journal(&transaction_dir, &journal)?;
    log_marketplace_info(
        if update.unwrap_or(false) {
            "marketplace_prepare_update"
        } else {
            "marketplace_prepare_install"
        },
        "Prepared marketplace plugin transaction",
        &workspace_path,
        serde_json::json!({ "pluginId": plugin_id, "version": manifest.version }),
    );
    Ok(MarketplacePreparedPlugin {
        transaction_id,
        manifest,
        previous_data_version,
        permission_fingerprint: confirmed_fingerprint,
    })
}

#[tauri::command]
pub async fn marketplace_commit_plugin(
    workspace_path: String,
    transaction_id: String,
    permission_fingerprint: String,
    migration: Option<MarketplaceMigrationBundle>,
) -> Result<PluginManifest, String> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_marketplace_plugin_blocking(
            workspace_path,
            transaction_id,
            permission_fingerprint,
            migration,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) fn commit_marketplace_plugin_blocking(
    workspace_path: String,
    transaction_id: String,
    permission_fingerprint: String,
    migration: Option<MarketplaceMigrationBundle>,
) -> Result<PluginManifest, String> {
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_commit_plugin")?;
    let workspace = Path::new(&workspace_path);
    let lock = marketplace_lock(workspace);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    recover_marketplace_transactions(workspace)?;
    let transaction_dir = marketplace_transaction_dir(workspace, &transaction_id)?;
    let mut journal = read_transaction_journal(&transaction_dir)?;
    if journal.status != MarketplaceTransactionStatus::Prepared {
        return Err("Marketplace transaction is not prepared".to_string());
    }
    let staged_plugin_dir = transaction_dir.join("staged-plugin");
    let manifest = read_installed_manifest(&staged_plugin_dir)?;
    if manifest.id != journal.plugin_id {
        return Err("Staged plugin does not match its marketplace transaction".to_string());
    }
    let current_manifest =
        read_installed_manifest(&plugins_dir_path(&workspace_path).join(&journal.plugin_id)).ok();
    if current_manifest
        .as_ref()
        .map(|value| value.version.as_str())
        != journal.previous_version.as_deref()
    {
        return Err(
            "Installed plugin changed while the marketplace transaction was staged".to_string(),
        );
    }
    let staged_fingerprint = plugin_permission_fingerprint(&manifest)?;
    if permission_fingerprint != staged_fingerprint
        || journal.permission_fingerprint != staged_fingerprint
    {
        return Err("Plugin permissions changed before commit; review them again".to_string());
    }
    if journal
        .previous_data_version
        .is_some_and(|previous| previous != manifest.data_version)
        && migration.is_none()
    {
        return Err("Plugin data migration must be validated before commit".to_string());
    }

    let migration_files = prepare_migration_files(migration.unwrap_or_default())?;
    journal.backups = marketplace_backup_entries(&journal.plugin_id, &migration_files);
    journal.status = MarketplaceTransactionStatus::Committing;
    write_transaction_journal(&transaction_dir, &journal)?;

    let commit_result = commit_marketplace_files(
        workspace,
        &transaction_dir,
        &staged_plugin_dir,
        &migration_files,
        &mut journal,
    );
    if let Err(error) = commit_result {
        let recovery = recover_marketplace_transaction(workspace, &transaction_dir, &journal);
        return match recovery {
            Ok(()) => Err(error),
            Err(recovery_error) => Err(format!(
                "{error}; marketplace rollback also failed: {recovery_error}"
            )),
        };
    }

    journal.status = MarketplaceTransactionStatus::Committed;
    write_transaction_journal(&transaction_dir, &journal)?;
    let _ = std::fs::remove_dir_all(&transaction_dir);
    log_marketplace_info(
        "marketplace_commit_plugin",
        "Committed marketplace plugin transaction",
        &workspace_path,
        serde_json::json!({
            "pluginId": manifest.id,
            "version": manifest.version,
            "transactionId": transaction_id,
        }),
    );
    Ok(manifest)
}

#[tauri::command]
pub async fn marketplace_abort_plugin(
    workspace_path: String,
    transaction_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        abort_marketplace_plugin_blocking(workspace_path, transaction_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn abort_marketplace_plugin_blocking(
    workspace_path: String,
    transaction_id: String,
) -> Result<(), String> {
    let workspace_path = normalize_workspace(&workspace_path, "marketplace_abort_plugin")?;
    let workspace = Path::new(&workspace_path);
    let lock = marketplace_lock(workspace);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let transaction_dir = marketplace_transaction_dir(workspace, &transaction_id)?;
    if !transaction_dir.exists() {
        return Ok(());
    }
    let journal = read_transaction_journal(&transaction_dir)?;
    match journal.status {
        MarketplaceTransactionStatus::Prepared | MarketplaceTransactionStatus::Committed => {
            std::fs::remove_dir_all(transaction_dir).map_err(|error| error.to_string())
        }
        MarketplaceTransactionStatus::Committing => {
            recover_marketplace_transaction(workspace, &transaction_dir, &journal)
        }
    }
}

fn normalize_workspace(workspace_path: &str, event: &str) -> Result<String, String> {
    let logger = crate::logging::logger();
    normalize_workspace_path(workspace_path)
        .map(|path| path.to_string_lossy().into_owned())
        .inspect_err(|message| {
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
        })
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
