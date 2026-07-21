use super::super::paths::plugins_dir_path;
use super::super::plugins::validate_plugin_id;
use super::types::MarketplaceMigrationBundle;
use crate::commands::path_utils::{validate_id, write_atomic};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

const MARKETPLACE_TRANSACTIONS_DIR: &str = ".nevo/marketplace/transactions";
const MARKETPLACE_TRANSACTION_JOURNAL: &str = "journal.json";
const MAX_MIGRATION_COLLAB_BYTES: usize = 100 * 1024 * 1024;
const MAX_MIGRATION_TOTAL_BYTES: usize = 500 * 1024 * 1024;
pub(super) const MAX_MIGRATION_STORAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_MIGRATION_REGISTRY_BYTES: usize = 2 * 1024 * 1024;

static MARKETPLACE_LOCKS: OnceLock<dashmap::DashMap<String, Arc<Mutex<()>>>> = OnceLock::new();

pub(super) fn marketplace_lock(workspace: &Path) -> Arc<Mutex<()>> {
    MARKETPLACE_LOCKS
        .get_or_init(dashmap::DashMap::new)
        .entry(workspace.to_string_lossy().into_owned())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) enum MarketplaceTransactionStatus {
    Prepared,
    Committing,
    Committed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum MarketplaceBackupKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MarketplaceBackupEntry {
    target: String,
    backup: String,
    kind: MarketplaceBackupKind,
    existed: bool,
    backup_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MarketplaceTransactionJournal {
    pub(super) transaction_id: String,
    pub(super) plugin_id: String,
    pub(super) permission_fingerprint: String,
    #[serde(default)]
    pub(super) previous_version: Option<String>,
    pub(super) previous_data_version: Option<u32>,
    pub(super) status: MarketplaceTransactionStatus,
    #[serde(default)]
    pub(super) backups: Vec<MarketplaceBackupEntry>,
}

pub(super) struct PreparedMigrationFiles {
    workspace_storage: Option<Vec<u8>>,
    plugin_registry: Option<Vec<u8>>,
    collab_states: BTreeMap<String, Vec<u8>>,
}
pub(super) fn marketplace_transaction_dir(
    workspace: &Path,
    transaction_id: &str,
) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(transaction_id)
        .map_err(|_| "Marketplace transaction id is invalid".to_string())?;
    Ok(workspace
        .join(MARKETPLACE_TRANSACTIONS_DIR)
        .join(transaction_id))
}

pub(super) fn write_transaction_journal(
    transaction_dir: &Path,
    journal: &MarketplaceTransactionJournal,
) -> Result<(), String> {
    std::fs::create_dir_all(transaction_dir).map_err(|error| error.to_string())?;
    let bytes = serde_json::to_vec_pretty(journal).map_err(|error| error.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("Marketplace transaction journal is too large".to_string());
    }
    write_atomic(
        &transaction_dir.join(MARKETPLACE_TRANSACTION_JOURNAL),
        &bytes,
    )
    .map_err(|error| error.to_string())
}

pub(super) fn read_transaction_journal(
    transaction_dir: &Path,
) -> Result<MarketplaceTransactionJournal, String> {
    let bytes = std::fs::read(transaction_dir.join(MARKETPLACE_TRANSACTION_JOURNAL))
        .map_err(|error| error.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("Marketplace transaction journal is too large".to_string());
    }
    let journal = serde_json::from_slice::<MarketplaceTransactionJournal>(&bytes)
        .map_err(|error| error.to_string())?;
    if transaction_dir.file_name().and_then(|value| value.to_str())
        != Some(journal.transaction_id.as_str())
    {
        return Err("Marketplace transaction journal id mismatch".to_string());
    }
    validate_plugin_id(&journal.plugin_id)?;
    Ok(journal)
}

pub(super) fn prepare_migration_files(
    migration: MarketplaceMigrationBundle,
) -> Result<PreparedMigrationFiles, String> {
    let workspace_storage = migration
        .workspace_storage
        .map(|storage| {
            if !storage.is_object() {
                return Err("Plugin workspace storage migration must be an object".to_string());
            }
            let bytes = serde_json::to_vec_pretty(&storage).map_err(|error| error.to_string())?;
            if bytes.len() > MAX_MIGRATION_STORAGE_BYTES {
                return Err("Plugin workspace storage migration exceeds 5 MiB".to_string());
            }
            Ok(bytes)
        })
        .transpose()?;
    let plugin_registry = migration
        .plugin_registry
        .map(|registry| {
            let valid = registry
                .as_object()
                .and_then(|value| value.get("version"))
                .is_some_and(|value| value == 1)
                && registry
                    .as_object()
                    .and_then(|value| value.get("plugins"))
                    .is_some_and(serde_json::Value::is_object);
            if !valid {
                return Err("Plugin registry migration has an invalid shape".to_string());
            }
            let bytes = serde_json::to_vec_pretty(&registry).map_err(|error| error.to_string())?;
            if bytes.len() > MAX_MIGRATION_REGISTRY_BYTES {
                return Err("Plugin registry migration exceeds 2 MiB".to_string());
            }
            Ok(bytes)
        })
        .transpose()?;
    let mut total_bytes = 0usize;
    let mut collab_states = BTreeMap::new();
    for (note_id, encoded) in migration.collab_states_base64 {
        validate_id(&note_id)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| format!("Plugin migration Y.Doc is not valid base64: {error}"))?;
        total_bytes = total_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| "Plugin migration Y.Doc total size overflowed".to_string())?;
        if bytes.len() > MAX_MIGRATION_COLLAB_BYTES || total_bytes > MAX_MIGRATION_TOTAL_BYTES {
            return Err("Plugin migration Y.Doc payload exceeds its size limit".to_string());
        }
        collab_states.insert(note_id, bytes);
    }
    Ok(PreparedMigrationFiles {
        workspace_storage,
        plugin_registry,
        collab_states,
    })
}

pub(super) fn marketplace_backup_entries(
    plugin_id: &str,
    migration: &PreparedMigrationFiles,
) -> Vec<MarketplaceBackupEntry> {
    let mut entries = vec![MarketplaceBackupEntry {
        target: format!(".nevo/plugins/{plugin_id}"),
        backup: "backup/plugin".to_string(),
        kind: MarketplaceBackupKind::Directory,
        existed: false,
        backup_ready: false,
    }];
    if migration.workspace_storage.is_some() {
        entries.push(MarketplaceBackupEntry {
            target: format!(".nevo/plugin-data/{plugin_id}.json"),
            backup: "backup/workspace-storage.json".to_string(),
            kind: MarketplaceBackupKind::File,
            existed: false,
            backup_ready: false,
        });
    }
    if migration.plugin_registry.is_some() {
        entries.push(MarketplaceBackupEntry {
            target: ".nevo/plugin-registry.json".to_string(),
            backup: "backup/plugin-registry.json".to_string(),
            kind: MarketplaceBackupKind::File,
            existed: false,
            backup_ready: false,
        });
    }
    entries.extend(
        migration
            .collab_states
            .keys()
            .map(|note_id| MarketplaceBackupEntry {
                target: format!(".nevo/collab/{note_id}.yjs"),
                backup: format!("backup/collab/{note_id}.yjs"),
                kind: MarketplaceBackupKind::File,
                existed: false,
                backup_ready: false,
            }),
    );
    entries
}

pub(super) fn commit_marketplace_files(
    workspace: &Path,
    transaction_dir: &Path,
    staged_plugin_dir: &Path,
    migration: &PreparedMigrationFiles,
    journal: &mut MarketplaceTransactionJournal,
) -> Result<(), String> {
    for index in 0..journal.backups.len() {
        prepare_transaction_backup(workspace, transaction_dir, journal, index)?;
    }

    let target_plugin = plugins_dir_path(&workspace.to_string_lossy()).join(&journal.plugin_id);
    if target_plugin.exists() {
        std::fs::remove_dir_all(&target_plugin).map_err(|error| error.to_string())?;
    }
    let plugin_parent = target_plugin
        .parent()
        .ok_or_else(|| "Marketplace plugin target has no parent".to_string())?;
    std::fs::create_dir_all(plugin_parent).map_err(|error| error.to_string())?;
    std::fs::rename(staged_plugin_dir, &target_plugin).map_err(|error| error.to_string())?;

    if let Some(bytes) = &migration.workspace_storage {
        write_workspace_file(
            &workspace
                .join(".nevo/plugin-data")
                .join(format!("{}.json", journal.plugin_id)),
            bytes,
        )?;
    }
    if let Some(bytes) = &migration.plugin_registry {
        write_workspace_file(&workspace.join(".nevo/plugin-registry.json"), bytes)?;
    }
    for (note_id, bytes) in &migration.collab_states {
        write_workspace_file(
            &workspace
                .join(".nevo/collab")
                .join(format!("{note_id}.yjs")),
            bytes,
        )?;
    }
    Ok(())
}

fn prepare_transaction_backup(
    workspace: &Path,
    transaction_dir: &Path,
    journal: &mut MarketplaceTransactionJournal,
    index: usize,
) -> Result<(), String> {
    let entry = journal
        .backups
        .get_mut(index)
        .ok_or_else(|| "Marketplace backup index is invalid".to_string())?;
    let target = workspace.join(&entry.target);
    let backup = transaction_dir.join(&entry.backup);
    entry.existed = target.exists();
    if entry.existed {
        if let Some(parent) = backup.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        match entry.kind {
            MarketplaceBackupKind::Directory => copy_directory(&target, &backup)?,
            MarketplaceBackupKind::File => {
                let bytes = std::fs::read(&target).map_err(|error| error.to_string())?;
                write_atomic(&backup, &bytes).map_err(|error| error.to_string())?;
            }
        }
    }
    entry.backup_ready = true;
    write_transaction_journal(transaction_dir, journal)
}

pub(super) fn write_workspace_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    write_atomic(path, bytes).map_err(|error| error.to_string())
}

fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        std::fs::remove_dir_all(target).map_err(|error| error.to_string())?;
    }
    std::fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for item in std::fs::read_dir(source).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        let file_type = item.file_type().map_err(|error| error.to_string())?;
        let destination = target.join(item.file_name());
        if file_type.is_symlink() {
            return Err("Marketplace transaction cannot back up symbolic links".to_string());
        }
        if file_type.is_dir() {
            copy_directory(&item.path(), &destination)?;
        } else if file_type.is_file() {
            let bytes = std::fs::read(item.path()).map_err(|error| error.to_string())?;
            write_atomic(&destination, &bytes).map_err(|error| error.to_string())?;
        } else {
            return Err("Marketplace transaction encountered an unsupported file".to_string());
        }
    }
    Ok(())
}

fn remove_path(path: &Path, kind: &MarketplaceBackupKind) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    match kind {
        MarketplaceBackupKind::Directory => {
            std::fs::remove_dir_all(path).map_err(|error| error.to_string())
        }
        MarketplaceBackupKind::File => {
            std::fs::remove_file(path).map_err(|error| error.to_string())
        }
    }
}

pub(super) fn recover_marketplace_transaction(
    workspace: &Path,
    transaction_dir: &Path,
    journal: &MarketplaceTransactionJournal,
) -> Result<(), String> {
    for entry in journal
        .backups
        .iter()
        .rev()
        .filter(|entry| entry.backup_ready)
    {
        let target = workspace.join(&entry.target);
        let backup = transaction_dir.join(&entry.backup);
        if entry.existed {
            if !backup.exists() {
                return Err(format!(
                    "Marketplace rollback backup is missing for {}",
                    entry.target
                ));
            }
            remove_path(&target, &entry.kind)?;
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            match entry.kind {
                MarketplaceBackupKind::Directory => copy_directory(&backup, &target)?,
                MarketplaceBackupKind::File => {
                    let bytes = std::fs::read(&backup).map_err(|error| error.to_string())?;
                    write_atomic(&target, &bytes).map_err(|error| error.to_string())?;
                }
            }
        } else {
            remove_path(&target, &entry.kind)?;
        }
    }
    std::fs::remove_dir_all(transaction_dir).map_err(|error| error.to_string())
}

pub(super) fn recover_marketplace_transactions(workspace: &Path) -> Result<(), String> {
    let transactions_dir = workspace.join(MARKETPLACE_TRANSACTIONS_DIR);
    if !transactions_dir.exists() {
        return Ok(());
    }
    for item in std::fs::read_dir(&transactions_dir).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        if !item
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        let transaction_dir = item.path();
        let journal_path = transaction_dir.join(MARKETPLACE_TRANSACTION_JOURNAL);
        if !journal_path.exists() {
            continue;
        }
        let journal = read_transaction_journal(&transaction_dir)?;
        match journal.status {
            MarketplaceTransactionStatus::Prepared => {}
            MarketplaceTransactionStatus::Committing => {
                recover_marketplace_transaction(workspace, &transaction_dir, &journal)?;
            }
            MarketplaceTransactionStatus::Committed => {
                std::fs::remove_dir_all(transaction_dir).map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}
