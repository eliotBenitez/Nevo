use super::super::plugins::validate_plugin_id;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

mod upload;
mod url;

pub use upload::*;
pub use url::*;

// A single asset must fit the 1 MiB sandbox message channel once base64-encoded
// (~4/3 overhead), so raw payloads are capped well below that ceiling. The whole
// per-plugin store is bounded to keep a misbehaving plugin from filling the disk.
const MAX_ASSET_BYTES: usize = 512 * 1024;
const MAX_ASSET_SCOPE_BYTES: u64 = 64 * 1024 * 1024;

// Plugin-scoped binary asset store. Assets are content-addressed by sha256 and
// live under `.nevo/plugin-assets/<plugin_id>/<assetId>`. Both `plugin_id` (via
// validate_plugin_id) and `assetId` (64 hex chars) are validated single path
// components, so no traversal can escape the plugin namespace.
fn validate_asset_id(asset_id: &str) -> Result<(), String> {
    if asset_id.len() != 64 || !asset_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Plugin asset id is invalid".to_string());
    }
    Ok(())
}

fn plugin_assets_dir(workspace: &Path, plugin_id: &str) -> PathBuf {
    workspace.join(".nevo/plugin-assets").join(plugin_id)
}

fn directory_size(dir: &Path) -> Result<u64, String> {
    if !dir.exists() {
        return Ok(0);
    }
    let mut total = 0u64;
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
        {
            total =
                total.saturating_add(entry.metadata().map_err(|error| error.to_string())?.len());
        }
    }
    Ok(total)
}

// Hash, dedupe, quota-check and persist a fully assembled asset. Shared by the
// single-shot `write` path and the chunked upload `finish` path.
fn commit_asset_bytes(
    workspace: &Path,
    plugin_id: &str,
    bytes: &[u8],
    max_bytes: usize,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("Plugin asset is empty".to_string());
    }
    if bytes.len() > max_bytes {
        return Err("Plugin asset exceeds its size limit".to_string());
    }
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let asset_id = format!("{:x}", hasher.finalize());
    let dir = plugin_assets_dir(workspace, plugin_id);
    let path = dir.join(&asset_id);
    // Content-addressed: identical bytes reuse the existing object and do not
    // count against the quota again.
    if path.exists() {
        return Ok(asset_id);
    }
    // directory_size lists only regular files, so in-progress uploads staged in
    // the `.uploads` subdirectory are naturally excluded from the committed quota.
    let existing = directory_size(&dir)?;
    if existing.saturating_add(bytes.len() as u64) > MAX_ASSET_SCOPE_BYTES {
        return Err("Plugin asset store exceeds its 64 MiB quota".to_string());
    }
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    write_atomic(&path, bytes).map_err(|error| error.to_string())?;
    Ok(asset_id)
}

fn write_plugin_asset(workspace: &Path, plugin_id: &str, bytes: &[u8]) -> Result<String, String> {
    commit_asset_bytes(workspace, plugin_id, bytes, MAX_ASSET_BYTES)
}

fn read_plugin_asset(
    workspace: &Path,
    plugin_id: &str,
    asset_id: &str,
) -> Result<Option<Vec<u8>>, String> {
    validate_asset_id(asset_id)?;
    let path = plugin_assets_dir(workspace, plugin_id).join(asset_id);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_ASSET_BYTES {
        return Err("Plugin asset exceeds 512 KiB".to_string());
    }
    Ok(Some(bytes))
}

fn delete_plugin_asset(workspace: &Path, plugin_id: &str, asset_id: &str) -> Result<(), String> {
    validate_asset_id(asset_id)?;
    let path = plugin_assets_dir(workspace, plugin_id).join(asset_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

// Asset commands decode/hash and touch the filesystem, so they run on the
// blocking pool like the storage commands to keep the webview thread free.
#[tauri::command]
pub async fn plugin_asset_write(
    workspace_path: String,
    plugin_id: String,
    data_base64: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64.as_bytes())
            .map_err(|error| error.to_string())?;
        write_plugin_asset(&workspace, &plugin_id, &bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_asset_read(
    workspace_path: String,
    plugin_id: String,
    asset_id: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        Ok(read_plugin_asset(&workspace, &plugin_id, &asset_id)?
            .map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes)))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_asset_delete(
    workspace_path: String,
    plugin_id: String,
    asset_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        delete_plugin_asset(&workspace, &plugin_id, &asset_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests;
