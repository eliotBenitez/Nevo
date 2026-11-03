use super::super::super::plugins::validate_plugin_id;
use super::{commit_asset_bytes, plugin_assets_dir};
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use base64::Engine;
use dashmap::DashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

// Chunked uploads (C.2) lift large binaries past the single-message ceiling. Each
// appended chunk still fits the sandbox message channel; the assembled asset is
// bounded so plugin images stay reasonable and the read-back channel is never the
// bottleneck (large assets are consumed via a renderable URL, not `assets.read`).
pub(super) const MAX_ASSET_CHUNK_BYTES: usize = 512 * 1024;
pub(super) const MAX_ASSET_UPLOAD_BYTES: usize = 8 * 1024 * 1024;
const MAX_CONCURRENT_ASSET_UPLOADS: usize = 8;

// Chunked upload state lives in memory keyed by an opaque upload id. The staging
// path is derived from (workspace, plugin_id, upload_id), never from raw client
// input, so a forged id can only miss the map — it cannot redirect the write.
struct AssetUpload {
    plugin_id: String,
    staging_path: PathBuf,
    bytes_written: usize,
}

static ASSET_UPLOADS: OnceLock<DashMap<String, AssetUpload>> = OnceLock::new();

fn asset_uploads() -> &'static DashMap<String, AssetUpload> {
    ASSET_UPLOADS.get_or_init(DashMap::new)
}

fn validate_upload_id(upload_id: &str) -> Result<(), String> {
    if upload_id.len() != 32 || !upload_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Plugin asset upload id is invalid".to_string());
    }
    Ok(())
}

pub(super) fn upload_staging_path(workspace: &Path, plugin_id: &str, upload_id: &str) -> PathBuf {
    plugin_assets_dir(workspace, plugin_id)
        .join(".uploads")
        .join(format!("{upload_id}.part"))
}

pub(super) fn begin_asset_upload(workspace: &Path, plugin_id: &str) -> Result<String, String> {
    let active = asset_uploads()
        .iter()
        .filter(|entry| entry.value().plugin_id == plugin_id)
        .count();
    if active >= MAX_CONCURRENT_ASSET_UPLOADS {
        return Err("Plugin has too many concurrent asset uploads".to_string());
    }
    let upload_id = uuid::Uuid::new_v4().simple().to_string();
    let staging_path = upload_staging_path(workspace, plugin_id, &upload_id);
    if let Some(parent) = staging_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    // Truncate/create the staging file so a stale `.part` never leaks into a new
    // upload sharing the (astronomically unlikely) same id.
    write_atomic(&staging_path, &[]).map_err(|error| error.to_string())?;
    asset_uploads().insert(
        upload_id.clone(),
        AssetUpload {
            plugin_id: plugin_id.to_string(),
            staging_path,
            bytes_written: 0,
        },
    );
    Ok(upload_id)
}

pub(super) fn append_asset_chunk(
    workspace: &Path,
    plugin_id: &str,
    upload_id: &str,
    chunk: &[u8],
) -> Result<(), String> {
    validate_upload_id(upload_id)?;
    if chunk.is_empty() {
        return Err("Plugin asset chunk is empty".to_string());
    }
    if chunk.len() > MAX_ASSET_CHUNK_BYTES {
        return Err("Plugin asset chunk exceeds 512 KiB".to_string());
    }
    let expected = upload_staging_path(workspace, plugin_id, upload_id);
    let mut upload = asset_uploads()
        .get_mut(upload_id)
        .ok_or_else(|| "Plugin asset upload is unknown or expired".to_string())?;
    if upload.plugin_id != plugin_id || upload.staging_path != expected {
        return Err("Plugin asset upload does not belong to this plugin".to_string());
    }
    let next_total = upload.bytes_written.saturating_add(chunk.len());
    if next_total > MAX_ASSET_UPLOAD_BYTES {
        return Err("Plugin asset upload exceeds 8 MiB".to_string());
    }
    use std::io::Write as _;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&upload.staging_path)
        .map_err(|error| error.to_string())?;
    file.write_all(chunk).map_err(|error| error.to_string())?;
    upload.bytes_written = next_total;
    Ok(())
}

pub(super) fn finish_asset_upload(
    workspace: &Path,
    plugin_id: &str,
    upload_id: &str,
) -> Result<String, String> {
    validate_upload_id(upload_id)?;
    let expected = upload_staging_path(workspace, plugin_id, upload_id);
    let (_, upload) = asset_uploads()
        .remove(upload_id)
        .ok_or_else(|| "Plugin asset upload is unknown or expired".to_string())?;
    let result = (|| {
        if upload.plugin_id != plugin_id || upload.staging_path != expected {
            return Err("Plugin asset upload does not belong to this plugin".to_string());
        }
        let bytes = std::fs::read(&upload.staging_path).map_err(|error| error.to_string())?;
        commit_asset_bytes(workspace, plugin_id, &bytes, MAX_ASSET_UPLOAD_BYTES)
    })();
    // Always clear the staging file, whether the commit succeeded or not.
    let _ = std::fs::remove_file(&upload.staging_path);
    result
}

pub(super) fn abort_asset_upload(
    workspace: &Path,
    plugin_id: &str,
    upload_id: &str,
) -> Result<(), String> {
    validate_upload_id(upload_id)?;
    let expected = upload_staging_path(workspace, plugin_id, upload_id);
    if let Some((_, upload)) = asset_uploads().remove(upload_id) {
        if upload.plugin_id == plugin_id && upload.staging_path == expected {
            let _ = std::fs::remove_file(&upload.staging_path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn plugin_asset_begin_upload(
    workspace_path: String,
    plugin_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        begin_asset_upload(&workspace, &plugin_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_asset_append_chunk(
    workspace_path: String,
    plugin_id: String,
    upload_id: String,
    chunk_base64: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        let chunk = base64::engine::general_purpose::STANDARD
            .decode(chunk_base64.as_bytes())
            .map_err(|error| error.to_string())?;
        append_asset_chunk(&workspace, &plugin_id, &upload_id, &chunk)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_asset_finish_upload(
    workspace_path: String,
    plugin_id: String,
    upload_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        finish_asset_upload(&workspace, &plugin_id, &upload_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn plugin_asset_abort_upload(
    workspace_path: String,
    plugin_id: String,
    upload_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        abort_asset_upload(&workspace, &plugin_id, &upload_id)
    })
    .await
    .map_err(|error| error.to_string())?
}
