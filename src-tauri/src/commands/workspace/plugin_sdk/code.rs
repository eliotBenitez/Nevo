use super::super::paths::plugins_dir_path;
use super::super::plugins::validate_plugin_id;
use super::super::types::PluginManifest;
use crate::commands::path_utils::{normalize_workspace_path, validate_id};
use dashmap::DashMap;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

const MAX_PLUGIN_CODE_BYTES: u64 = 5 * 1024 * 1024;

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
}
