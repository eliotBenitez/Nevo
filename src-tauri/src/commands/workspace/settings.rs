mod home_favorites;
mod normalize;

#[cfg(test)]
mod tests;

use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{OnceLock, RwLock};

use self::normalize::normalize_settings_value;
use super::paths::{settings_path, workspace_context, workspace_error_context};
use super::types::WorkspaceSettings;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use crate::logging::{LogContext, LogError};

/// Caches `advanced.developer_logging` per workspace so hot-path commands (e.g.
/// `save_note`) don't re-read and re-parse `settings.json` from disk on every
/// call just to decide whether to log at debug/info level. Invalidated by
/// `save_workspace_settings` whenever the setting changes.
static DIAGNOSTICS_CACHE: OnceLock<RwLock<HashMap<String, bool>>> = OnceLock::new();

fn diagnostics_cache() -> &'static RwLock<HashMap<String, bool>> {
    DIAGNOSTICS_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

pub(crate) fn read_workspace_settings(path: &Path) -> Result<WorkspaceSettings, String> {
    if !path.exists() {
        return Ok(WorkspaceSettings::default());
    }

    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let raw = serde_json::from_str::<Value>(&content).map_err(|e| e.to_string())?;
    Ok(normalize_settings_value(raw))
}

pub fn is_extended_diagnostics_enabled(workspace_path: &str) -> bool {
    if let Some(cached) = diagnostics_cache()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(workspace_path)
    {
        return *cached;
    }

    let enabled = read_workspace_settings(&settings_path(workspace_path))
        .map(|settings| settings.advanced.developer_logging)
        .unwrap_or(false);

    diagnostics_cache()
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(workspace_path.to_string(), enabled);

    enabled
}

#[tauri::command]
pub async fn load_workspace_settings(workspace_path: String) -> Result<WorkspaceSettings, String> {
    tauri::async_runtime::spawn_blocking(move || load_workspace_settings_sync(workspace_path))
        .await
        .map_err(|error| error.to_string())?
}

fn load_workspace_settings_sync(workspace_path: String) -> Result<WorkspaceSettings, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "load_workspace_settings",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let settings =
        read_workspace_settings(&settings_path(&workspace_path)).inspect_err(|message| {
            let _ = logger.error(
                "tauri.workspace",
                "load_workspace_settings",
                "Failed to load workspace settings",
                workspace_error_context(&workspace_path, "io", message.clone()),
            );
        })?;
    let _ = logger.debug(
        "tauri.workspace",
        "load_workspace_settings",
        "Loaded workspace settings",
        settings.advanced.developer_logging,
        workspace_context(&workspace_path),
    );
    Ok(settings)
}

#[tauri::command]
pub async fn save_workspace_settings(
    workspace_path: String,
    settings: WorkspaceSettings,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_workspace_settings_sync(workspace_path, settings)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn save_workspace_settings_sync(
    workspace_path: String,
    settings: WorkspaceSettings,
) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "save_workspace_settings",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let normalized = normalize_settings_value(serde_json::to_value(settings).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "save_workspace_settings",
            "Failed to serialize workspace settings",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?);
    let diagnostics_enabled = normalized.advanced.developer_logging;
    let content = serde_json::to_string_pretty(&normalized).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "save_workspace_settings",
            "Failed to render workspace settings",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    write_atomic(&settings_path(&workspace_path), content.as_bytes()).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "save_workspace_settings",
            "Failed to write workspace settings",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    diagnostics_cache()
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(
            workspace_path.clone(),
            normalized.advanced.developer_logging,
        );
    let _ = logger.info(
        "tauri.workspace",
        "save_workspace_settings",
        "Saved workspace settings",
        diagnostics_enabled,
        workspace_context(&workspace_path).with_payload(serde_json::json!({
            "developerLogging": diagnostics_enabled,
            "schemaVersion": normalized.advanced.schema_version,
        })),
    );
    Ok(())
}

#[tauri::command]
pub async fn load_custom_css(workspace_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || load_custom_css_sync(workspace_path))
        .await
        .map_err(|error| error.to_string())?
}

fn load_custom_css_sync(workspace_path: String) -> Result<String, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "load_custom_css",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let css_path = super::paths::custom_css_path(&workspace_path);
    if !css_path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&css_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "load_custom_css",
            "Failed to read custom CSS file",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })
}

#[tauri::command]
pub async fn save_custom_css(workspace_path: String, css: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || save_custom_css_sync(workspace_path, css))
        .await
        .map_err(|error| error.to_string())?
}

fn save_custom_css_sync(workspace_path: String, css: String) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "save_custom_css",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let css_path = super::paths::custom_css_path(&workspace_path);

    if let Some(parent) = css_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.workspace",
                "save_custom_css",
                "Failed to create workspace directory",
                workspace_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?;
    }

    std::fs::write(&css_path, css).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "save_custom_css",
            "Failed to write custom CSS file",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    Ok(())
}
