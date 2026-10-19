//! The AI provider API key and the effective privacy mode, resolved in Rust.
//!
//! The key is stored in the OS secret store together with the origin it was saved for
//! and is read only here, so it never crosses IPC to the webview. A request sends it
//! only to that origin. Privacy mode is the stricter of the caller's flag and the
//! active workspace's setting, so a caller cannot opt out of it.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::ai::normalize_base_url;
use super::auth::secure_store::{delete_host_secret, read_host_secret, write_host_secret};
use super::path_utils::active_workspace_root;
use super::workspace::{read_workspace_settings, settings_path};

const SECRET_AI_API_KEY: &str = "nevo:ai.apiKey";

#[derive(Serialize, Deserialize)]
struct BoundKey {
    origin: String,
    key: String,
}

/// `scheme://host[:port]` of an http(s) base URL, as the key is bound to it.
fn endpoint_origin(base_url: &str) -> Option<String> {
    let url = reqwest::Url::parse(&normalize_base_url(base_url)).ok()?;
    let origin = url.origin();
    origin.is_tuple().then(|| origin.ascii_serialization())
}

/// The key for `base_url`, only when the secret was saved for that origin. A bare
/// string from before endpoint binding never matches: its endpoint is unknown.
fn key_for_endpoint(secret: Option<&str>, base_url: &str) -> Option<String> {
    let bound: BoundKey = serde_json::from_str(secret?).ok()?;
    let origin = endpoint_origin(base_url)?;
    (bound.origin == origin).then_some(bound.key)
}

fn bound_secret(base_url: &str, key: &str) -> Result<String, String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("API key must not be empty".to_string());
    }
    let origin = endpoint_origin(base_url).ok_or_else(|| "Invalid AI endpoint URL".to_string())?;
    serde_json::to_string(&BoundKey {
        origin,
        key: key.to_string(),
    })
    .map_err(|error| error.to_string())
}

/// Privacy mode is on when the caller asks for it or the workspace at `root` has it on.
fn effective_privacy(requested: bool, root: Option<&std::path::Path>) -> bool {
    requested
        || root.is_some_and(|root| {
            // An unreadable settings file falls back to the default, which has privacy on.
            read_workspace_settings(&settings_path(&root.to_string_lossy()))
                .map_or(true, |settings| settings.ai.privacy_mode)
        })
}

async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?
}

/// What a request to `base_url` may use: the effective privacy mode and, for the
/// OpenAI-compatible kind, the key bound to that endpoint.
pub(crate) async fn resolve_access(
    app: &AppHandle,
    base_url: &str,
    provider_kind: &str,
    requested_privacy: bool,
) -> Result<(bool, Option<String>), String> {
    let app = app.clone();
    let base_url = base_url.to_string();
    let wants_key = provider_kind == "openai";
    blocking(move || {
        let privacy = effective_privacy(requested_privacy, active_workspace_root().as_deref());
        let key = if wants_key {
            key_for_endpoint(
                read_host_secret(&app, SECRET_AI_API_KEY)?.as_deref(),
                &base_url,
            )
        } else {
            None
        };
        Ok((privacy, key))
    })
    .await
}

#[tauri::command]
pub async fn ai_api_key_save(app: AppHandle, base_url: String, key: String) -> Result<(), String> {
    let secret = bound_secret(&base_url, &key)?;
    blocking(move || write_host_secret(&app, SECRET_AI_API_KEY, &secret)).await
}

/// Whether a key is saved for `base_url`'s endpoint. The key itself is never returned.
#[tauri::command]
pub async fn ai_api_key_status(app: AppHandle, base_url: String) -> Result<bool, String> {
    blocking(move || {
        let secret = read_host_secret(&app, SECRET_AI_API_KEY)?;
        Ok(key_for_endpoint(secret.as_deref(), &base_url).is_some())
    })
    .await
}

#[tauri::command]
pub async fn ai_api_key_delete(app: AppHandle) -> Result<(), String> {
    blocking(move || delete_host_secret(&app, SECRET_AI_API_KEY)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const OPENROUTER: &str = "https://openrouter.ai/api/v1";

    #[test]
    fn a_saved_key_is_used_only_for_its_origin() {
        let secret = bound_secret(OPENROUTER, "  sk-or  ").unwrap();
        assert_eq!(
            key_for_endpoint(Some(&secret), "https://openrouter.ai/api/v2/").as_deref(),
            Some("sk-or")
        );
        assert_eq!(
            key_for_endpoint(Some(&secret), "https://evil.example/v1"),
            None
        );
        assert_eq!(
            key_for_endpoint(Some(&secret), "http://openrouter.ai/api/v1"),
            None
        );
        assert_eq!(
            key_for_endpoint(Some(&secret), "https://openrouter.ai:8443/v1"),
            None
        );
        assert_eq!(key_for_endpoint(None, OPENROUTER), None);
    }

    #[test]
    fn a_legacy_bare_key_or_bad_endpoint_is_never_used() {
        assert_eq!(key_for_endpoint(Some("sk-legacy"), OPENROUTER), None);
        let secret = bound_secret(OPENROUTER, "sk-or").unwrap();
        assert_eq!(key_for_endpoint(Some(&secret), "not a url"), None);
        assert!(bound_secret("not a url", "sk").is_err());
        assert!(bound_secret(OPENROUTER, "   ").is_err());
    }

    #[test]
    fn reads_keys_the_frontend_bound_before_the_move_to_rust() {
        let stored = r#"{"origin":"https://openrouter.ai","key":"sk-or"}"#;
        assert_eq!(
            key_for_endpoint(Some(stored), OPENROUTER).as_deref(),
            Some("sk-or")
        );
    }

    fn workspace_with_privacy(privacy: Option<bool>) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("nevo-ai-privacy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".nevo")).unwrap();
        if let Some(privacy) = privacy {
            let settings = serde_json::json!({ "ai": { "privacyMode": privacy } });
            std::fs::write(root.join(".nevo/settings.json"), settings.to_string()).unwrap();
        }
        root
    }

    #[test]
    fn the_workspace_setting_turns_privacy_on_even_when_the_caller_omits_it() {
        let private = workspace_with_privacy(Some(true));
        assert!(effective_privacy(false, Some(&private)));
        let open = workspace_with_privacy(Some(false));
        assert!(!effective_privacy(false, Some(&open)));
        assert!(
            effective_privacy(true, Some(&open)),
            "a caller's privacy request is kept"
        );
        // No settings file yet: the default, privacy on, applies.
        let fresh = workspace_with_privacy(None);
        assert!(effective_privacy(false, Some(&fresh)));
        assert!(!effective_privacy(false, None));
        for root in [private, open, fresh] {
            let _ = std::fs::remove_dir_all(root);
        }
    }
}
