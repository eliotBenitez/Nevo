use super::paths::{plugins_dir_path, workspace_context, workspace_error_context};
use super::settings::is_extended_diagnostics_enabled;
use super::types::PluginManifest;
use crate::commands::path_utils::normalize_workspace_path;
use crate::logging::{LogContext, LogError};

#[tauri::command]
pub fn list_plugins(workspace_path: String) -> Result<Vec<PluginManifest>, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "list_plugins",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_path);
    let plugins_dir = plugins_dir_path(&workspace_path);
    if !plugins_dir.exists() {
        let _ = logger.debug(
            "tauri.workspace",
            "list_plugins",
            "Plugins directory missing",
            diagnostics_enabled,
            workspace_context(&workspace_path),
        );
        return Ok(vec![]);
    }

    let mut plugins = vec![];
    let entries = std::fs::read_dir(&plugins_dir).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "list_plugins",
            "Failed to read plugins directory",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    for entry in entries.flatten() {
        let manifest_path = entry.path().join("manifest.json");
        if manifest_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                if let Ok(plugin) = serde_json::from_str::<PluginManifest>(&content) {
                    plugins.push(plugin);
                }
            }
        }
    }
    let _ = logger.debug(
        "tauri.workspace",
        "list_plugins",
        "Listed workspace plugins",
        diagnostics_enabled,
        workspace_context(&workspace_path).with_payload(serde_json::json!({
            "count": plugins.len(),
        })),
    );
    Ok(plugins)
}

/// Reject plugin ids that could escape the plugins directory via path
/// separators or traversal segments. Plugin ids are folder names, so only a
/// conservative `[A-Za-z0-9._-]` set is allowed and `..`/empty is forbidden.
fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty()
        || plugin_id == "."
        || plugin_id == ".."
        || !plugin_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err("Invalid plugin id".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn validate_plugin_manifest(
    workspace_path: String,
    plugin_id: String,
) -> Result<PluginManifest, String> {
    validate_plugin_id(&plugin_id)?;
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "validate_plugin_manifest",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_path);
    let manifest_path = plugins_dir_path(&workspace_path)
        .join(plugin_id)
        .join("manifest.json");
    let content = std::fs::read_to_string(&manifest_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "validate_plugin_manifest",
            "Failed to read plugin manifest",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let manifest = serde_json::from_str::<PluginManifest>(&content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "validate_plugin_manifest",
            "Failed to parse plugin manifest",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    let _ = logger.debug(
        "tauri.workspace",
        "validate_plugin_manifest",
        "Validated plugin manifest",
        diagnostics_enabled,
        workspace_context(&workspace_path).with_payload(serde_json::json!({
            "pluginId": manifest.id,
        })),
    );
    Ok(manifest)
}

#[tauri::command]
pub fn set_plugin_enabled(
    workspace_path: String,
    plugin_id: String,
    enabled: bool,
) -> Result<(), String> {
    validate_plugin_id(&plugin_id)?;
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "set_plugin_enabled",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_path);
    let manifest_path = plugins_dir_path(&workspace_path)
        .join(plugin_id)
        .join("manifest.json");
    let content = std::fs::read_to_string(&manifest_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "set_plugin_enabled",
            "Failed to read plugin manifest",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let mut manifest = serde_json::from_str::<PluginManifest>(&content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "set_plugin_enabled",
            "Failed to parse plugin manifest",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    manifest.enabled = enabled;
    let next_content = serde_json::to_string_pretty(&manifest).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "set_plugin_enabled",
            "Failed to serialize plugin manifest",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    std::fs::write(manifest_path, next_content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "set_plugin_enabled",
            "Failed to write plugin manifest",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let _ = logger.info(
        "tauri.workspace",
        "set_plugin_enabled",
        "Updated plugin enabled state",
        diagnostics_enabled,
        workspace_context(&workspace_path).with_payload(serde_json::json!({
            "pluginId": manifest.id,
            "enabled": manifest.enabled,
        })),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_plugin_id;

    #[test]
    fn accepts_plain_plugin_ids() {
        assert!(validate_plugin_id("my-plugin_1.2").is_ok());
        assert!(validate_plugin_id("plugin").is_ok());
    }

    #[test]
    fn rejects_traversal_and_separators() {
        assert!(validate_plugin_id("").is_err());
        assert!(validate_plugin_id("..").is_err());
        assert!(validate_plugin_id(".").is_err());
        assert!(validate_plugin_id("../etc").is_err());
        assert!(validate_plugin_id("a/b").is_err());
        assert!(validate_plugin_id("a\\b").is_err());
        assert!(validate_plugin_id("a b").is_err());
    }
}
