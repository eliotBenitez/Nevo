use super::super::super::plugins::validate_plugin_id;
use super::upload::MAX_ASSET_UPLOAD_BYTES;
use super::{plugin_assets_dir, validate_asset_id};
use crate::commands::path_utils::normalize_workspace_path;
use dashmap::DashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

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

pub(super) fn asset_url_token_for(plugin_id: &str, root: &Path) -> String {
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
pub(super) fn sniff_image_content_type(bytes: &[u8]) -> Option<&'static str> {
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

pub(super) fn resolve_asset_uri(uri: &str) -> Result<(PathBuf, &'static str), String> {
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
