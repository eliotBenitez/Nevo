use super::super::plugins::validate_plugin_id;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_STORAGE_VALUE_BYTES: usize = 256 * 1024;
const MAX_STORAGE_SCOPE_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PluginStorageScope {
    Workspace,
    Local,
}

fn validate_storage_key(key: &str) -> Result<(), String> {
    if key.is_empty()
        || key.len() > 160
        || !key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
    {
        return Err("Plugin storage key is invalid".to_string());
    }
    Ok(())
}

fn workspace_fingerprint(workspace: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(workspace.to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn storage_path(
    app: &tauri::AppHandle,
    workspace: &Path,
    plugin_id: &str,
    scope: &PluginStorageScope,
) -> Result<PathBuf, String> {
    match scope {
        PluginStorageScope::Workspace => Ok(workspace
            .join(".nevo/plugin-data")
            .join(format!("{plugin_id}.json"))),
        PluginStorageScope::Local => Ok(app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("plugin-data")
            .join(workspace_fingerprint(workspace))
            .join(format!("{plugin_id}.json"))),
    }
}

fn read_storage(path: &Path) -> Result<BTreeMap<String, serde_json::Value>, String> {
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let content = std::fs::read(path).map_err(|error| error.to_string())?;
    if content.len() > MAX_STORAGE_SCOPE_BYTES {
        return Err("Plugin storage exceeds its quota".to_string());
    }
    serde_json::from_slice(&content).map_err(|error| error.to_string())
}

fn write_storage(path: &Path, storage: &BTreeMap<String, serde_json::Value>) -> Result<(), String> {
    let content = serde_json::to_vec_pretty(storage).map_err(|error| error.to_string())?;
    if content.len() > MAX_STORAGE_SCOPE_BYTES {
        return Err("Plugin storage exceeds its 5 MiB quota".to_string());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    write_atomic(path, &content).map_err(|error| error.to_string())
}

fn checked_storage_path(
    app: &tauri::AppHandle,
    workspace_path: &str,
    plugin_id: &str,
    scope: &PluginStorageScope,
) -> Result<PathBuf, String> {
    validate_plugin_id(plugin_id)?;
    let workspace = normalize_workspace_path(workspace_path)?;
    storage_path(app, &workspace, plugin_id, scope)
}

// Storage commands parse/rewrite the whole per-plugin JSON file, so they run on a
// blocking thread pool instead of the webview main thread to avoid UI jank on
// chatty plugins (Tauri v2 sync commands execute on the main thread).
#[tauri::command]
pub async fn plugin_storage_get(
    app: tauri::AppHandle,
    workspace_path: String,
    plugin_id: String,
    scope: PluginStorageScope,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_storage_key(&key)?;
        let path = checked_storage_path(&app, &workspace_path, &plugin_id, &scope)?;
        Ok(read_storage(&path)?.remove(&key))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_storage_set(
    app: tauri::AppHandle,
    workspace_path: String,
    plugin_id: String,
    scope: PluginStorageScope,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_storage_key(&key)?;
        let value_bytes = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
        if value_bytes.len() > MAX_STORAGE_VALUE_BYTES {
            return Err("Plugin storage value exceeds 256 KiB".to_string());
        }
        let path = checked_storage_path(&app, &workspace_path, &plugin_id, &scope)?;
        let mut storage = read_storage(&path)?;
        storage.insert(key, value);
        write_storage(&path, &storage)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_storage_delete(
    app: tauri::AppHandle,
    workspace_path: String,
    plugin_id: String,
    scope: PluginStorageScope,
    key: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_storage_key(&key)?;
        let path = checked_storage_path(&app, &workspace_path, &plugin_id, &scope)?;
        let mut storage = read_storage(&path)?;
        storage.remove(&key);
        write_storage(&path, &storage)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_storage_snapshot(
    app: tauri::AppHandle,
    workspace_path: String,
    plugin_id: String,
    scope: PluginStorageScope,
) -> Result<BTreeMap<String, serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = checked_storage_path(&app, &workspace_path, &plugin_id, &scope)?;
        read_storage(&path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enforces_storage_key_and_value_quotas() {
        assert!(validate_storage_key("cache.last-result").is_ok());
        assert!(validate_storage_key("../other").is_err());
        let oversized = serde_json::Value::String("x".repeat(MAX_STORAGE_VALUE_BYTES + 1));
        assert!(serde_json::to_vec(&oversized).unwrap().len() > MAX_STORAGE_VALUE_BYTES);
    }
}
