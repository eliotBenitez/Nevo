use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use std::path::PathBuf;

const MAX_PLUGIN_REGISTRY_BYTES: usize = 2 * 1024 * 1024;

fn plugin_registry_path(workspace_path: &str) -> Result<PathBuf, String> {
    Ok(normalize_workspace_path(workspace_path)?.join(".nevo/plugin-registry.json"))
}

#[tauri::command]
pub async fn plugin_registry_load(workspace_path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || plugin_registry_load_sync(workspace_path))
        .await
        .map_err(|error| error.to_string())?
}

pub fn plugin_registry_load_sync(workspace_path: String) -> Result<serde_json::Value, String> {
    let path = plugin_registry_path(&workspace_path)?;
    if !path.exists() {
        return Ok(serde_json::json!({ "version": 1, "plugins": {} }));
    }
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_PLUGIN_REGISTRY_BYTES {
        return Err("Plugin registry exceeds 2 MiB".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn plugin_registry_save(
    workspace_path: String,
    registry: serde_json::Value,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        plugin_registry_save_sync(workspace_path, registry)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn plugin_registry_save_sync(
    workspace_path: String,
    registry: serde_json::Value,
) -> Result<(), String> {
    let path = plugin_registry_path(&workspace_path)?;
    let bytes = serde_json::to_vec_pretty(&registry).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_PLUGIN_REGISTRY_BYTES {
        return Err("Plugin registry exceeds 2 MiB".to_string());
    }
    if !registry
        .as_object()
        .and_then(|value| value.get("version"))
        .is_some_and(|value| value == 1)
        || !registry
            .as_object()
            .and_then(|value| value.get("plugins"))
            .is_some_and(serde_json::Value::is_object)
    {
        return Err("Plugin registry shape is invalid".to_string());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    write_atomic(&path, &bytes).map_err(|error| error.to_string())
}
