use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use super::path_utils::normalize_workspace_path;

fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty()
        || plugin_id.len() > 128
        || !plugin_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        || plugin_id == "."
        || plugin_id == ".."
    {
        return Err("Invalid plugin identifier".to_string());
    }
    Ok(())
}

fn canonical_workspace_root(workspace_path: &str) -> Result<PathBuf, String> {
    let root = normalize_workspace_path(workspace_path)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !root.join(".nevo/workspace.json").is_file() {
        return Err("Workspace manifest is missing".to_string());
    }
    Ok(root)
}

fn resolve_workspace_location(
    workspace_path: &str,
    location: &str,
    plugin_id: Option<&str>,
) -> Result<PathBuf, String> {
    let root = canonical_workspace_root(workspace_path)?;
    let target = match location {
        "root" => root.clone(),
        "notes" => root.join("notes"),
        "assets" => root.join(".nevo/assets"),
        "metadata" => root.join(".nevo"),
        "settings" => root.join(".nevo/settings.json"),
        "plugins" => {
            let plugins = root.join(".nevo/plugins");
            if let Some(plugin_id) = plugin_id {
                validate_plugin_id(plugin_id)?;
                plugins.join(plugin_id)
            } else {
                plugins
            }
        }
        _ => return Err("Unsupported workspace location".to_string()),
    };
    let canonical = target.canonicalize().map_err(|error| error.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("Workspace location escaped the active workspace".to_string());
    }
    Ok(canonical)
}

fn open_or_reveal(app: &AppHandle, path: &Path, reveal: bool) -> Result<(), String> {
    #[cfg(desktop)]
    if reveal {
        return app
            .opener()
            .reveal_item_in_dir(path)
            .map_err(|error| error.to_string());
    }

    let _ = reveal;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_workspace_location(
    app: AppHandle,
    workspace_path: String,
    location: String,
    plugin_id: Option<String>,
    reveal: bool,
) -> Result<(), String> {
    let path = tauri::async_runtime::spawn_blocking(move || {
        resolve_workspace_location(&workspace_path, &location, plugin_id.as_deref())
    })
    .await
    .map_err(|error| format!("Path resolution task failed: {error}"))??;
    open_or_reveal(&app, &path, reveal)
}

fn resolve_app_location(app: &AppHandle, location: &str) -> Result<PathBuf, String> {
    match location {
        "config" => Ok(app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("config.json")),
        "appData" => app.path().app_data_dir().map_err(|error| error.to_string()),
        "logs" => crate::logging::resolve_logs_dir(app),
        _ => Err("Unsupported application location".to_string()),
    }
}

#[tauri::command]
pub async fn open_app_location(
    app: AppHandle,
    location: String,
    reveal: bool,
) -> Result<(), String> {
    let path = resolve_app_location(&app, &location)?;
    open_or_reveal(&app, &path, reveal)
}

#[tauri::command]
pub async fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    let value = url.trim();
    if value.is_empty() || value.len() > 2048 {
        return Err("External URL is invalid".to_string());
    }
    let parsed = reqwest::Url::parse(value).map_err(|_| "External URL is invalid".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("External URL must be an HTTP(S) URL without credentials".to_string());
    }
    app.opener()
        .open_url(parsed.to_string(), None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn pick_workspace_directory(app: AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |selection| {
        let _ = sender.send(selection);
    });
    receiver
        .await
        .map_err(|_| "Workspace picker was closed unexpectedly".to_string())?
        .map(|selection| {
            selection
                .into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| error.to_string())
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::{resolve_workspace_location, validate_plugin_id};

    #[test]
    fn workspace_locations_are_confined_to_known_directories() {
        let root = std::env::temp_dir().join(format!("nevo_open_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("notes")).unwrap();
        std::fs::create_dir_all(root.join(".nevo/assets")).unwrap();
        std::fs::create_dir_all(root.join(".nevo/plugins/example.plugin")).unwrap();
        std::fs::write(root.join(".nevo/workspace.json"), "{}").unwrap();

        assert!(resolve_workspace_location(&root.to_string_lossy(), "root", None).is_ok());
        assert!(resolve_workspace_location(&root.to_string_lossy(), "assets", None).is_ok());
        assert!(resolve_workspace_location(
            &root.to_string_lossy(),
            "plugins",
            Some("example.plugin")
        )
        .is_ok());
        assert!(resolve_workspace_location(&root.to_string_lossy(), "unknown", None).is_err());
        assert!(validate_plugin_id("../../escape").is_err());

        std::fs::remove_dir_all(root).ok();
    }
}
