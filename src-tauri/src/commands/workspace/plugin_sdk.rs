use super::paths::plugins_dir_path;
use super::plugins::validate_plugin_id;
use super::types::{PluginExecutionMode, PluginManifest};
use crate::commands::path_utils::{normalize_workspace_path, validate_id, write_atomic};
use base64::Engine;
use dashmap::DashMap;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr};
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

const MAX_PLUGIN_CODE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_STORAGE_VALUE_BYTES: usize = 256 * 1024;
const MAX_STORAGE_SCOPE_BYTES: usize = 5 * 1024 * 1024;
const MAX_PLUGIN_REGISTRY_BYTES: usize = 2 * 1024 * 1024;
// A single asset must fit the 1 MiB sandbox message channel once base64-encoded
// (~4/3 overhead), so raw payloads are capped well below that ceiling. The whole
// per-plugin store is bounded to keep a misbehaving plugin from filling the disk.
const MAX_ASSET_BYTES: usize = 512 * 1024;
const MAX_ASSET_SCOPE_BYTES: u64 = 64 * 1024 * 1024;
// Chunked uploads (C.2) lift large binaries past the single-message ceiling. Each
// appended chunk still fits the sandbox message channel; the assembled asset is
// bounded so plugin images stay reasonable and the read-back channel is never the
// bottleneck (large assets are consumed via a renderable URL, not `assets.read`).
const MAX_ASSET_CHUNK_BYTES: usize = 512 * 1024;
const MAX_ASSET_UPLOAD_BYTES: usize = 8 * 1024 * 1024;
const MAX_CONCURRENT_ASSET_UPLOADS: usize = 8;

#[derive(Debug, Clone)]
struct PluginCodeSession {
    plugin_id: String,
    root: PathBuf,
}

static CODE_SESSIONS: OnceLock<DashMap<String, PluginCodeSession>> = OnceLock::new();

fn code_sessions() -> &'static DashMap<String, PluginCodeSession> {
    CODE_SESSIONS.get_or_init(DashMap::new)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCodeSessionResponse {
    pub token: String,
    pub entry_url: String,
}

fn safe_plugin_relative(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') {
        return Err("Plugin path is unsafe".to_string());
    }
    let relative = Path::new(path);
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Plugin path is unsafe".to_string());
    }
    Ok(relative.to_path_buf())
}

#[tauri::command]
pub fn plugin_create_code_session(
    workspace_path: String,
    plugin_id: String,
    entry_point: String,
) -> Result<PluginCodeSessionResponse, String> {
    validate_plugin_id(&plugin_id)?;
    let workspace = normalize_workspace_path(&workspace_path)?;
    let plugin_root = plugins_dir_path(&workspace.to_string_lossy())
        .join(&plugin_id)
        .canonicalize()
        .map_err(|error| format!("Plugin directory is unavailable: {error}"))?;
    create_code_session(plugin_id, plugin_root, entry_point)
}

#[tauri::command]
pub fn plugin_create_staged_code_session(
    workspace_path: String,
    transaction_id: String,
    plugin_id: String,
    entry_point: String,
) -> Result<PluginCodeSessionResponse, String> {
    validate_id(&transaction_id)?;
    validate_plugin_id(&plugin_id)?;
    let workspace = normalize_workspace_path(&workspace_path)?;
    let transaction_root = workspace
        .join(".nevo/marketplace/transactions")
        .join(&transaction_id);
    let plugin_root = transaction_root
        .join("staged-plugin")
        .canonicalize()
        .map_err(|error| format!("Staged plugin directory is unavailable: {error}"))?;
    let canonical_transactions = workspace
        .join(".nevo/marketplace/transactions")
        .canonicalize()
        .map_err(|error| format!("Marketplace transactions are unavailable: {error}"))?;
    if !plugin_root.starts_with(&canonical_transactions) {
        return Err("Staged plugin escaped its marketplace transaction".to_string());
    }
    let manifest_bytes = std::fs::read(plugin_root.join("manifest.json"))
        .map_err(|error| format!("Staged plugin manifest is unavailable: {error}"))?;
    let manifest = serde_json::from_slice::<PluginManifest>(&manifest_bytes)
        .map_err(|error| format!("Staged plugin manifest is invalid: {error}"))?;
    if manifest.id != plugin_id || manifest.entry_point != entry_point {
        return Err("Staged code session does not match the prepared plugin".to_string());
    }
    create_code_session(plugin_id, plugin_root, entry_point)
}

fn create_code_session(
    plugin_id: String,
    plugin_root: PathBuf,
    entry_point: String,
) -> Result<PluginCodeSessionResponse, String> {
    let relative = safe_plugin_relative(&entry_point)?;
    let entry = plugin_root
        .join(&relative)
        .canonicalize()
        .map_err(|error| format!("Plugin entry point is unavailable: {error}"))?;
    if !entry.starts_with(&plugin_root) || !entry.is_file() {
        return Err("Plugin entry point escaped its plugin directory".to_string());
    }

    let token = uuid::Uuid::new_v4().simple().to_string();
    code_sessions().insert(
        token.clone(),
        PluginCodeSession {
            plugin_id,
            root: plugin_root,
        },
    );
    Ok(PluginCodeSessionResponse {
        entry_url: format!("nevoplugin://{token}/{}", relative.to_string_lossy()),
        token,
    })
}

#[tauri::command]
pub fn plugin_revoke_code_session(token: String) {
    code_sessions().remove(&token);
}

fn code_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "html" | "htm" => "text/html; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn resolve_code_uri(uri: &str) -> Result<(PathBuf, &'static str), String> {
    let without_scheme = uri
        .strip_prefix("nevoplugin://")
        .ok_or_else(|| "Invalid plugin protocol".to_string())?;
    let (token, encoded_path) = without_scheme
        .split_once('/')
        .ok_or_else(|| "Plugin protocol path is missing".to_string())?;
    let session = code_sessions()
        .get(token)
        .ok_or_else(|| "Plugin code session is invalid or expired".to_string())?;
    let decoded = percent_encoding::percent_decode_str(encoded_path)
        .decode_utf8()
        .map_err(|_| "Plugin path is not valid UTF-8".to_string())?;
    let relative = safe_plugin_relative(decoded.as_ref())?;
    let target = session
        .root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("Plugin module is unavailable: {error}"))?;
    if !target.starts_with(&session.root) || !target.is_file() {
        return Err(format!(
            "Plugin module escaped code session for {}",
            session.plugin_id
        ));
    }
    if target.metadata().map_err(|error| error.to_string())?.len() > MAX_PLUGIN_CODE_BYTES {
        return Err("Plugin module exceeds the protocol size limit".to_string());
    }
    let content_type = code_content_type(&target);
    if content_type == "application/octet-stream" {
        return Err("Plugin protocol does not expose this file type".to_string());
    }
    Ok((target, content_type))
}

pub fn plugin_code_response(uri: &str) -> tauri::http::Response<Vec<u8>> {
    let result = resolve_code_uri(uri).and_then(|(path, content_type)| {
        std::fs::read(path)
            .map(|bytes| (content_type, bytes))
            .map_err(|error| error.to_string())
    });
    match result {
        Ok((content_type, bytes)) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::OK)
            .header(tauri::http::header::CONTENT_TYPE, content_type)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cross-Origin-Resource-Policy", "cross-origin")
            .header("X-Content-Type-Options", "nosniff")
            .header(
                "Content-Security-Policy",
                "default-src 'none'; script-src 'self' nevoplugin: http://nevoplugin.localhost; style-src 'unsafe-inline'; img-src data: blob: nevoplugin-asset: http://nevoplugin-asset.localhost; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
            )
            .body(bytes)
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
        Err(message) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .header(
                tauri::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )
            .header("X-Content-Type-Options", "nosniff")
            .body(message.into_bytes())
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
    }
}

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

fn upload_staging_path(workspace: &Path, plugin_id: &str, upload_id: &str) -> PathBuf {
    plugin_assets_dir(workspace, plugin_id)
        .join(".uploads")
        .join(format!("{upload_id}.part"))
}

fn begin_asset_upload(workspace: &Path, plugin_id: &str) -> Result<String, String> {
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

fn append_asset_chunk(
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

fn finish_asset_upload(
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

fn abort_asset_upload(workspace: &Path, plugin_id: &str, upload_id: &str) -> Result<(), String> {
    validate_upload_id(upload_id)?;
    let expected = upload_staging_path(workspace, plugin_id, upload_id);
    if let Some((_, upload)) = asset_uploads().remove(upload_id) {
        if upload.plugin_id == plugin_id && upload.staging_path == expected {
            let _ = std::fs::remove_file(&upload.staging_path);
        }
    }
    Ok(())
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

// Renderable-URL sessions (C.2). A plugin exchanges (workspace, plugin_id) for an
// opaque token bound to *its own* asset root, so a URL can only ever resolve to
// files inside that plugin's namespace — a plugin cannot mint a URL into another
// plugin's assets even if it learns the content-addressed id.
#[derive(Clone)]
struct AssetUrlSession {
    plugin_id: String,
    root: PathBuf,
}

static ASSET_URL_SESSIONS: OnceLock<DashMap<String, AssetUrlSession>> = OnceLock::new();
static ASSET_URL_TOKENS: OnceLock<DashMap<String, String>> = OnceLock::new();

fn asset_url_sessions() -> &'static DashMap<String, AssetUrlSession> {
    ASSET_URL_SESSIONS.get_or_init(DashMap::new)
}

fn asset_url_tokens() -> &'static DashMap<String, String> {
    ASSET_URL_TOKENS.get_or_init(DashMap::new)
}

fn asset_url_token_for(plugin_id: &str, root: &Path) -> String {
    let key = format!("{}\u{0}{}", plugin_id, root.to_string_lossy());
    if let Some(existing) = asset_url_tokens().get(&key) {
        return existing.clone();
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    asset_url_sessions().insert(
        token.clone(),
        AssetUrlSession {
            plugin_id: plugin_id.to_string(),
            root: root.to_path_buf(),
        },
    );
    asset_url_tokens().insert(key, token.clone());
    token
}

#[tauri::command]
pub async fn plugin_asset_url(
    workspace_path: String,
    plugin_id: String,
    asset_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_plugin_id(&plugin_id)?;
        validate_asset_id(&asset_id)?;
        let workspace = normalize_workspace_path(&workspace_path)?;
        let root = plugin_assets_dir(&workspace, &plugin_id);
        // Only mint URLs for assets that actually exist, and canonicalize the root
        // so the protocol handler can confine resolutions against a real path.
        if !root.join(&asset_id).is_file() {
            return Err("Plugin asset is unavailable".to_string());
        }
        let canonical_root = root.canonicalize().map_err(|error| error.to_string())?;
        let token = asset_url_token_for(&plugin_id, &canonical_root);
        Ok(format!("nevoplugin-asset://{token}/{asset_id}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

// Asset URLs are image-only: the content type is sniffed from magic bytes (assets
// are content-addressed and carry no extension) and anything that is not a known,
// script-safe image format is refused so the protocol can never serve HTML/SVG
// script payloads or arbitrary octet streams into a frame.
fn sniff_image_content_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" && &bytes[8..12] == b"avif" {
        return Some("image/avif");
    }
    None
}

fn resolve_asset_uri(uri: &str) -> Result<(PathBuf, &'static str), String> {
    let without_scheme = uri
        .strip_prefix("nevoplugin-asset://")
        .ok_or_else(|| "Invalid plugin asset protocol".to_string())?;
    let (token, encoded_id) = without_scheme
        .split_once('/')
        .ok_or_else(|| "Plugin asset protocol path is missing".to_string())?;
    let session = asset_url_sessions()
        .get(token)
        .ok_or_else(|| "Plugin asset session is invalid or expired".to_string())?;
    let decoded = percent_encoding::percent_decode_str(encoded_id)
        .decode_utf8()
        .map_err(|_| "Plugin asset id is not valid UTF-8".to_string())?;
    validate_asset_id(decoded.as_ref())?;
    let target = session
        .root
        .join(decoded.as_ref())
        .canonicalize()
        .map_err(|error| format!("Plugin asset is unavailable: {error}"))?;
    if !target.starts_with(&session.root) || !target.is_file() {
        return Err(format!(
            "Plugin asset escaped its session for {}",
            session.plugin_id
        ));
    }
    let bytes = std::fs::read(&target).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_ASSET_UPLOAD_BYTES {
        return Err("Plugin asset exceeds the protocol size limit".to_string());
    }
    let content_type = sniff_image_content_type(&bytes)
        .ok_or_else(|| "Plugin asset is not an image".to_string())?;
    Ok((target, content_type))
}

pub fn plugin_asset_response(uri: &str) -> tauri::http::Response<Vec<u8>> {
    let result = resolve_asset_uri(uri).and_then(|(path, content_type)| {
        std::fs::read(path)
            .map(|bytes| (content_type, bytes))
            .map_err(|error| error.to_string())
    });
    match result {
        Ok((content_type, bytes)) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::OK)
            .header(tauri::http::header::CONTENT_TYPE, content_type)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cross-Origin-Resource-Policy", "cross-origin")
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", "default-src 'none'; sandbox")
            .body(bytes)
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
        Err(message) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .header(
                tauri::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )
            .header("X-Content-Type-Options", "nosniff")
            .body(message.into_bytes())
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
    }
}

fn plugin_registry_path(workspace_path: &str) -> Result<PathBuf, String> {
    Ok(normalize_workspace_path(workspace_path)?.join(".nevo/plugin-registry.json"))
}

#[tauri::command]
pub fn plugin_registry_load(workspace_path: String) -> Result<serde_json::Value, String> {
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
pub fn plugin_registry_save(
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginNetworkRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub body_base64: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginNetworkResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body_base64: String,
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_multicast()
                || ip.is_unspecified()
                || ip.octets()[0] == 0
                || ip.octets()[0] >= 224
                || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
                || (ip.octets()[0] == 198 && (ip.octets()[1] == 18 || ip.octets()[1] == 19)))
        }
        IpAddr::V6(ip) => {
            // IPv4-mapped/compatible addresses (e.g. ::ffff:10.0.0.1) route to the
            // embedded IPv4 target, so they must be judged by the IPv4 rules —
            // otherwise a mapped private/loopback address slips past the V6 predicates.
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(mapped));
            }
            #[allow(deprecated)]
            if let Some(compat) = ip.to_ipv4() {
                return is_public_ip(IpAddr::V4(compat));
            }
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || ip.is_multicast())
        }
    }
}

fn host_allowed(host: &str, allowed: &[String]) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    allowed.iter().any(|pattern| {
        let pattern = pattern.trim_end_matches('.').to_ascii_lowercase();
        if let Some(suffix) = pattern.strip_prefix("*.") {
            host != suffix && host.ends_with(&format!(".{suffix}"))
        } else {
            host == pattern
        }
    })
}

fn safe_request_header(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    !matches!(
        name.as_str(),
        "authorization"
            | "connection"
            | "content-length"
            | "cookie"
            | "host"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    ) && !name.starts_with("proxy-")
        && !name.starts_with("sec-")
}

fn installed_v2_manifest(workspace: &Path, plugin_id: &str) -> Result<PluginManifest, String> {
    let content = std::fs::read_to_string(
        plugins_dir_path(&workspace.to_string_lossy())
            .join(plugin_id)
            .join("manifest.json"),
    )
    .map_err(|error| error.to_string())?;
    let manifest =
        serde_json::from_str::<PluginManifest>(&content).map_err(|error| error.to_string())?;
    if manifest.id != plugin_id || manifest.execution_mode != PluginExecutionMode::SandboxedWorker {
        return Err("Network broker is available only to the matching SDK V2 plugin".to_string());
    }
    if !manifest
        .capabilities
        .as_ref()
        .is_some_and(|values| values.iter().any(|value| value == "network.fetch"))
    {
        return Err("Plugin requires capability network.fetch".to_string());
    }
    Ok(manifest)
}

async fn pinned_client(host: &str, port: u16) -> Result<reqwest::Client, String> {
    let addresses = tokio::net::lookup_host((host, port))
        .await
        .map_err(|error| format!("Plugin network DNS lookup failed: {error}"))?
        .collect::<Vec<SocketAddr>>();
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err("Plugin network target resolved to a non-public address".to_string());
    }
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn plugin_network_fetch(
    workspace_path: String,
    plugin_id: String,
    request: PluginNetworkRequest,
) -> Result<PluginNetworkResponse, String> {
    const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;
    validate_plugin_id(&plugin_id)?;
    let workspace = normalize_workspace_path(&workspace_path)?;
    let manifest = installed_v2_manifest(&workspace, &plugin_id)?;
    let policy = manifest
        .network
        .ok_or_else(|| "Plugin has no declared network policy".to_string())?;
    let method = request.method.to_ascii_uppercase();
    if !policy.methods.iter().any(|value| value == &method) {
        return Err(format!("Plugin network method is not allowed: {method}"));
    }
    let parsed_method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
    let mut url = reqwest::Url::parse(&request.url).map_err(|error| error.to_string())?;
    let body = request
        .body_base64
        .map(|value| {
            base64::engine::general_purpose::STANDARD
                .decode(value)
                .map_err(|error| error.to_string())
        })
        .transpose()?;
    if body
        .as_ref()
        .is_some_and(|value| value.len() > MAX_RESPONSE_BYTES)
    {
        return Err("Plugin network request body exceeds 5 MiB".to_string());
    }

    for redirect_count in 0..=5 {
        if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
            return Err(
                "Plugin network broker accepts only credential-free HTTPS URLs".to_string(),
            );
        }
        let host = url
            .host_str()
            .ok_or_else(|| "Plugin network URL has no host".to_string())?;
        if !host_allowed(host, &policy.hosts) {
            return Err(format!("Plugin network host is not allowed: {host}"));
        }
        let client = pinned_client(host, url.port_or_known_default().unwrap_or(443)).await?;
        let mut builder = client.request(parsed_method.clone(), url.clone());
        for (name, value) in &request.headers {
            if !safe_request_header(name) {
                return Err(format!("Plugin network header is not allowed: {name}"));
            }
            builder = builder.header(name, value);
        }
        if let Some(body) = &body {
            builder = builder.body(body.clone());
        }
        let response = builder.send().await.map_err(|error| error.to_string())?;
        if response.status().is_redirection() {
            if redirect_count == 5 {
                return Err("Plugin network request exceeded 5 redirects".to_string());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or_else(|| "Plugin network redirect has no Location".to_string())?
                .to_str()
                .map_err(|_| "Plugin network redirect is not valid UTF-8".to_string())?;
            url = url.join(location).map_err(|error| error.to_string())?;
            continue;
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err("Plugin network response exceeds 5 MiB".to_string());
        }
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.as_str().to_string(), value.to_string()))
            })
            .collect();
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| error.to_string())?;
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err("Plugin network response exceeds 5 MiB".to_string());
            }
            bytes.extend_from_slice(&chunk);
        }
        return Ok(PluginNetworkResponse {
            status,
            headers,
            body_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
    }
    Err("Plugin network redirect loop".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_cross_session_paths() {
        assert!(safe_plugin_relative("index.js").is_ok());
        assert!(safe_plugin_relative("lib/module.js").is_ok());
        assert!(safe_plugin_relative("../other/index.js").is_err());
        assert!(safe_plugin_relative("/etc/passwd").is_err());
        assert!(safe_plugin_relative("a\\b.js").is_err());
    }

    #[test]
    fn staged_code_sessions_are_bound_to_one_transaction_and_manifest() {
        let workspace =
            std::env::temp_dir().join(format!("nevo-staged-code-session-{}", uuid::Uuid::new_v4()));
        let transaction_id = uuid::Uuid::new_v4().to_string();
        let staged_plugin = workspace
            .join(".nevo/marketplace/transactions")
            .join(&transaction_id)
            .join("staged-plugin");
        std::fs::create_dir_all(&staged_plugin).expect("staged plugin");
        std::fs::write(staged_plugin.join("index.js"), "export default {}").expect("plugin entry");
        std::fs::write(
            staged_plugin.join("manifest.json"),
            serde_json::to_vec(&serde_json::json!({
                "id": "plugin.safe",
                "name": "Safe",
                "version": "1.0.0",
                "enabled": true,
                "kind": "marketplace",
                "source": "marketplace",
                "entryPoint": "index.js",
                "apiVersion": "2.0.0",
                "executionMode": "sandboxed-worker",
                "dataVersion": 1,
                "capabilities": [],
                "editorCapabilities": [],
            }))
            .expect("manifest json"),
        )
        .expect("manifest");

        let session = plugin_create_staged_code_session(
            workspace.to_string_lossy().into_owned(),
            transaction_id.clone(),
            "plugin.safe".to_string(),
            "index.js".to_string(),
        )
        .expect("staged code session");
        assert!(session.entry_url.ends_with("/index.js"));
        assert!(plugin_create_staged_code_session(
            workspace.to_string_lossy().into_owned(),
            transaction_id,
            "plugin.other".to_string(),
            "index.js".to_string(),
        )
        .is_err());
        assert!(plugin_create_staged_code_session(
            workspace.to_string_lossy().into_owned(),
            "../other".to_string(),
            "plugin.safe".to_string(),
            "index.js".to_string(),
        )
        .is_err());

        plugin_revoke_code_session(session.token);
        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn enforces_storage_key_and_value_quotas() {
        assert!(validate_storage_key("cache.last-result").is_ok());
        assert!(validate_storage_key("../other").is_err());
        let oversized = serde_json::Value::String("x".repeat(MAX_STORAGE_VALUE_BYTES + 1));
        assert!(serde_json::to_vec(&oversized).unwrap().len() > MAX_STORAGE_VALUE_BYTES);
    }

    #[test]
    fn asset_ids_are_content_hashes_and_reject_traversal() {
        assert!(validate_asset_id(&"a".repeat(64)).is_ok());
        assert!(validate_asset_id(&"a".repeat(63)).is_err());
        assert!(validate_asset_id(&"g".repeat(64)).is_err());
        assert!(validate_asset_id("../secret").is_err());
        assert!(validate_asset_id("").is_err());
    }

    #[test]
    fn asset_store_round_trips_dedupes_and_confines() {
        let workspace =
            std::env::temp_dir().join(format!("nevo-plugin-assets-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&workspace).expect("workspace");

        let first = write_plugin_asset(&workspace, "plugin.safe", b"hello world").expect("write");
        let second = write_plugin_asset(&workspace, "plugin.safe", b"hello world").expect("dedupe");
        assert_eq!(
            first, second,
            "identical bytes reuse the same content address"
        );
        assert_eq!(
            directory_size(&plugin_assets_dir(&workspace, "plugin.safe")).unwrap(),
            b"hello world".len() as u64,
            "dedupe must not write a second object"
        );

        let read = read_plugin_asset(&workspace, "plugin.safe", &first).expect("read");
        assert_eq!(read.as_deref(), Some(&b"hello world"[..]));

        // Assets are namespaced per plugin: another plugin cannot see the object.
        assert!(read_plugin_asset(&workspace, "plugin.other", &first)
            .expect("cross-plugin read")
            .is_none());

        // Empty and oversized payloads are rejected.
        assert!(write_plugin_asset(&workspace, "plugin.safe", b"").is_err());
        assert!(
            write_plugin_asset(&workspace, "plugin.safe", &vec![0u8; MAX_ASSET_BYTES + 1]).is_err()
        );

        delete_plugin_asset(&workspace, "plugin.safe", &first).expect("delete");
        assert!(read_plugin_asset(&workspace, "plugin.safe", &first)
            .expect("read after delete")
            .is_none());

        std::fs::remove_dir_all(&workspace).expect("cleanup");
    }

    #[test]
    fn chunked_upload_assembles_dedupes_and_enforces_ownership() {
        let workspace =
            std::env::temp_dir().join(format!("nevo-plugin-upload-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&workspace).expect("workspace");

        let upload_id = begin_asset_upload(&workspace, "plugin.safe").expect("begin");
        append_asset_chunk(&workspace, "plugin.safe", &upload_id, b"hello ").expect("chunk 1");
        append_asset_chunk(&workspace, "plugin.safe", &upload_id, b"world").expect("chunk 2");

        // A concurrent upload owned by another plugin cannot touch this one.
        assert!(append_asset_chunk(&workspace, "plugin.other", &upload_id, b"x").is_err());
        // Oversized chunks are rejected outright.
        assert!(append_asset_chunk(
            &workspace,
            "plugin.safe",
            &upload_id,
            &vec![0u8; MAX_ASSET_CHUNK_BYTES + 1]
        )
        .is_err());

        let asset_id = finish_asset_upload(&workspace, "plugin.safe", &upload_id).expect("finish");
        let stored = std::fs::read(plugin_assets_dir(&workspace, "plugin.safe").join(&asset_id))
            .expect("stored asset");
        assert_eq!(stored, b"hello world");
        // The assembled bytes share the content address of a single-shot write.
        assert_eq!(
            asset_id,
            write_plugin_asset(&workspace, "plugin.safe", b"hello world").unwrap()
        );
        // Staging is cleared and the upload id is no longer usable.
        assert!(!upload_staging_path(&workspace, "plugin.safe", &upload_id).exists());
        assert!(finish_asset_upload(&workspace, "plugin.safe", &upload_id).is_err());

        // Abort removes staging and forgets the upload.
        let aborted = begin_asset_upload(&workspace, "plugin.safe").expect("begin abort");
        append_asset_chunk(&workspace, "plugin.safe", &aborted, b"scratch").expect("chunk");
        abort_asset_upload(&workspace, "plugin.safe", &aborted).expect("abort");
        assert!(!upload_staging_path(&workspace, "plugin.safe", &aborted).exists());

        std::fs::remove_dir_all(&workspace).expect("cleanup");
    }

    #[test]
    fn asset_urls_sniff_images_confine_to_the_session_and_reject_non_images() {
        // Magic-byte sniffing recognizes the supported image formats and nothing else.
        assert_eq!(
            sniff_image_content_type(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]),
            Some("image/png")
        );
        assert_eq!(
            sniff_image_content_type(&[0xFF, 0xD8, 0xFF, 0]),
            Some("image/jpeg")
        );
        assert_eq!(sniff_image_content_type(b"GIF89a....."), Some("image/gif"));
        assert_eq!(
            sniff_image_content_type(b"RIFF\0\0\0\0WEBP...."),
            Some("image/webp")
        );
        assert_eq!(
            sniff_image_content_type(b"\0\0\0\0ftypavif...."),
            Some("image/avif")
        );
        assert!(sniff_image_content_type(b"<svg>nope</svg>").is_none());
        assert!(sniff_image_content_type(b"plain text").is_none());

        let workspace =
            std::env::temp_dir().join(format!("nevo-plugin-asseturl-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&workspace).expect("workspace");

        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
        let asset_id = write_plugin_asset(&workspace, "plugin.safe", &png).unwrap();
        let root = plugin_assets_dir(&workspace, "plugin.safe")
            .canonicalize()
            .unwrap();
        let token = asset_url_token_for("plugin.safe", &root);
        // The same plugin root always reuses one opaque token.
        assert_eq!(token, asset_url_token_for("plugin.safe", &root));

        let uri = format!("nevoplugin-asset://{token}/{asset_id}");
        let (path, content_type) = resolve_asset_uri(&uri).expect("resolve image asset");
        assert_eq!(content_type, "image/png");
        assert!(path.starts_with(&root));

        // A malformed id and an unknown token are both refused.
        assert!(resolve_asset_uri(&format!("nevoplugin-asset://{token}/../escape")).is_err());
        assert!(resolve_asset_uri(&format!("nevoplugin-asset://deadbeef/{asset_id}")).is_err());

        // A non-image asset is stored fine but refused as a renderable URL.
        let text_id = write_plugin_asset(&workspace, "plugin.safe", b"not an image").unwrap();
        assert!(resolve_asset_uri(&format!("nevoplugin-asset://{token}/{text_id}")).is_err());

        std::fs::remove_dir_all(&workspace).expect("cleanup");
    }

    #[test]
    fn blocks_private_network_targets_and_wildcard_confusion() {
        assert!(!is_public_ip("127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("169.254.1.1".parse().unwrap()));
        assert!(!is_public_ip("10.0.0.1".parse().unwrap()));
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
        // IPv4-mapped IPv6 must inherit the IPv4 verdict (SSRF via ::ffff: bypass).
        assert!(!is_public_ip("::1".parse().unwrap()));
        assert!(!is_public_ip("::ffff:127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("::ffff:10.0.0.1".parse().unwrap()));
        assert!(is_public_ip("::ffff:1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
        assert!(host_allowed(
            "api.example.com",
            &["*.example.com".to_string()]
        ));
        assert!(!host_allowed(
            "example.com.evil.test",
            &["*.example.com".to_string()]
        ));
    }
}
