use super::paths::{plugins_dir_path, workspace_context, workspace_error_context};
use super::settings::is_extended_diagnostics_enabled;
use super::types::{PluginExecutionMode, PluginManifest};
use crate::commands::path_utils::normalize_workspace_path;
use crate::logging::{LogContext, LogError};

const SYSTEM_PLUGIN_VERSION: &str = "1.0.0";

const KANBAN_INDEX_JS: &str = r#"export default {
  onRegister(ctx) {
    ctx.registerWorkspaceView({
      id: 'nevo.kanban.board',
      title: ctx.i18n.t('settings.plugins.kanban.title'),
      route: '/workspace/plugin/nevo.kanban/:boardId',
      component: 'nevo.kanban.KanbanView',
      icon: 'kanban',
      order: 20
    });
    ctx.registerSidebarItem({
      id: 'nevo.kanban.sidebar',
      title: ctx.i18n.t('workspace.boards.title'),
      route: '/workspace/plugin/nevo.kanban',
      icon: 'kanban',
      order: 20
    });
  }
};
"#;

const TEMPLATES_INDEX_JS: &str = r#"export default {
  onRegister(ctx) {
    ctx.registerModal({
      id: 'nevo.templates.picker',
      component: 'nevo.templates.TemplatePickerModal'
    });
  }
};
"#;

const VEGA_INDEX_JS: &str = r#"function insertBlock(state, dispatch, nodeName, attrs) {
  const nodeType = state.schema.nodes[nodeName];
  if (!nodeType) return;
  const node = nodeType.create(attrs);
  dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
}

export default {
  onRegister(ctx) {
    ctx.registerSlashItem({
      id: 'chart',
      title: 'Chart',
      category: 'media',
      keywords: ['vega', 'vega-lite', 'chart', 'graph', 'visualization', 'plot', 'bar', 'line', 'pie'],
      run: ({ state, dispatch }) => insertBlock(state, dispatch, 'vega_block', { spec: '{}' })
    });
  }
};
"#;

const GITHUB_SYNC_INDEX_JS: &str = "export default {};\n";

const MARKMAP_INDEX_JS: &str = r#"function insertBlock(state, dispatch, nodeName, attrs) {
  const nodeType = state.schema.nodes[nodeName];
  if (!nodeType) return;
  const node = nodeType.create(attrs);
  dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
}

export default {
  onRegister(ctx) {
    ctx.registerSlashItem({
      id: 'markmap',
      title: 'Mind Map',
      category: 'media',
      keywords: ['mindmap', 'markmap', 'map', 'outline', 'tree', 'brainstorm'],
      run: ({ state, dispatch }) => insertBlock(state, dispatch, 'markmap_block', { markdown: '# Topic\n## Idea A\n## Idea B' })
    });
  }
};
"#;

fn bundled_system_plugins() -> Vec<(PluginManifest, &'static str)> {
    vec![
        (
            PluginManifest {
                id: "nevo.kanban".to_string(),
                name: "Kanban Boards".to_string(),
                version: SYSTEM_PLUGIN_VERSION.to_string(),
                description: "Workspace Kanban board view.".to_string(),
                enabled: true,
                kind: "system".to_string(),
                source: "bundled".to_string(),
                entry_point: "index.js".to_string(),
                api_version: "1.0.0".to_string(),
                execution_mode: PluginExecutionMode::TrustedWebview,
                data_version: 1,
                capabilities: None,
                editor_capabilities: vec![],
                ui_capabilities: vec![
                    "workspace.view.register".to_string(),
                    "workspace.navigation".to_string(),
                ],
                workspace_capabilities: vec![
                    "kanban.read".to_string(),
                    "kanban.write".to_string(),
                    "workspace.read".to_string(),
                ],
                network: None,
                nevo_version_range: Some("^1.0.0".to_string()),
                priority: Some(40),
                settings_schema: vec![],
            },
            KANBAN_INDEX_JS,
        ),
        (
            PluginManifest {
                id: "nevo.templates".to_string(),
                name: "Templates".to_string(),
                version: SYSTEM_PLUGIN_VERSION.to_string(),
                description: "Workspace template picker and editor integration.".to_string(),
                enabled: true,
                kind: "system".to_string(),
                source: "bundled".to_string(),
                entry_point: "index.js".to_string(),
                api_version: "1.0.0".to_string(),
                execution_mode: PluginExecutionMode::TrustedWebview,
                data_version: 1,
                capabilities: None,
                editor_capabilities: vec![],
                ui_capabilities: vec!["workspace.view.register".to_string()],
                workspace_capabilities: vec![
                    "template.read".to_string(),
                    "template.write".to_string(),
                    "note.write".to_string(),
                ],
                network: None,
                nevo_version_range: Some("^1.0.0".to_string()),
                priority: Some(30),
                settings_schema: vec![],
            },
            TEMPLATES_INDEX_JS,
        ),
        (
            PluginManifest {
                id: "nevo.vega".to_string(),
                name: "Vega-Lite Charts".to_string(),
                version: SYSTEM_PLUGIN_VERSION.to_string(),
                description: "Vega-Lite chart slash command.".to_string(),
                enabled: true,
                kind: "system".to_string(),
                source: "bundled".to_string(),
                entry_point: "index.js".to_string(),
                api_version: "1.0.0".to_string(),
                execution_mode: PluginExecutionMode::TrustedWebview,
                data_version: 1,
                capabilities: None,
                editor_capabilities: vec!["editor.write".to_string()],
                ui_capabilities: vec![],
                workspace_capabilities: vec![],
                network: None,
                nevo_version_range: Some("^1.0.0".to_string()),
                priority: Some(20),
                settings_schema: vec![],
            },
            VEGA_INDEX_JS,
        ),
        (
            PluginManifest {
                id: "nevo.markmap".to_string(),
                name: "Mind Maps".to_string(),
                version: SYSTEM_PLUGIN_VERSION.to_string(),
                description: "Markmap mind map slash command.".to_string(),
                enabled: true,
                kind: "system".to_string(),
                source: "bundled".to_string(),
                entry_point: "index.js".to_string(),
                api_version: "1.0.0".to_string(),
                execution_mode: PluginExecutionMode::TrustedWebview,
                data_version: 1,
                capabilities: None,
                editor_capabilities: vec!["editor.write".to_string()],
                ui_capabilities: vec![],
                workspace_capabilities: vec![],
                network: None,
                nevo_version_range: Some("^1.0.0".to_string()),
                priority: Some(20),
                settings_schema: vec![],
            },
            MARKMAP_INDEX_JS,
        ),
        (
            PluginManifest {
                id: "nevo.github-sync".to_string(),
                name: "GitHub Sync".to_string(),
                version: SYSTEM_PLUGIN_VERSION.to_string(),
                description: "Back up the workspace to a GitHub repository.".to_string(),
                enabled: false,
                kind: "system".to_string(),
                source: "bundled".to_string(),
                entry_point: "index.js".to_string(),
                api_version: "1.0.0".to_string(),
                execution_mode: PluginExecutionMode::TrustedWebview,
                data_version: 1,
                capabilities: None,
                editor_capabilities: vec![],
                ui_capabilities: vec![],
                workspace_capabilities: vec![],
                network: None,
                nevo_version_range: Some("^1.0.0".to_string()),
                priority: Some(10),
                settings_schema: vec![
                    serde_json::json!({
                        "key": "repo",
                        "type": "text",
                        "label": "settings.plugins.githubSync.fields.repo",
                        "placeholder": "owner/repository",
                    }),
                    serde_json::json!({
                        "key": "branch",
                        "type": "text",
                        "label": "settings.plugins.githubSync.fields.branch",
                        "default": "main",
                        "placeholder": "main",
                    }),
                    serde_json::json!({
                        "key": "token",
                        "type": "password",
                        "secret": true,
                        "label": "settings.plugins.githubSync.fields.token",
                        "description": "settings.plugins.githubSync.fields.tokenHint",
                    }),
                    serde_json::json!({
                        "key": "commitMessage",
                        "type": "text",
                        "label": "settings.plugins.githubSync.fields.commitMessage",
                        "default": "Nevo backup",
                        "placeholder": "Nevo backup",
                    }),
                    serde_json::json!({
                        "key": "autoSync",
                        "type": "checkbox",
                        "label": "settings.plugins.githubSync.fields.autoSync",
                        "default": false,
                    }),
                    serde_json::json!({
                        "key": "intervalMinutes",
                        "type": "number",
                        "label": "settings.plugins.githubSync.fields.intervalMinutes",
                        "default": 15,
                        "min": 1,
                        "max": 1440,
                        "step": 1,
                    }),
                ],
            },
            GITHUB_SYNC_INDEX_JS,
        ),
    ]
}

pub(crate) fn ensure_bundled_system_plugins(workspace_path: &str) -> Result<(), String> {
    let plugins_dir = plugins_dir_path(workspace_path);
    std::fs::create_dir_all(&plugins_dir).map_err(|error| error.to_string())?;

    for (mut manifest, index_js) in bundled_system_plugins() {
        let plugin_dir = plugins_dir.join(&manifest.id);
        let manifest_path = plugin_dir.join("manifest.json");
        let mut should_write = true;

        if manifest_path.exists() {
            let existing_content =
                std::fs::read_to_string(&manifest_path).map_err(|error| error.to_string())?;
            if let Ok(existing) = serde_json::from_str::<PluginManifest>(&existing_content) {
                if existing.kind != "system" || existing.source != "bundled" {
                    should_write = false;
                } else {
                    manifest.enabled = existing.enabled;
                }
            }
        }

        if !should_write {
            continue;
        }

        std::fs::create_dir_all(&plugin_dir).map_err(|error| error.to_string())?;
        let content = serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
        std::fs::write(&manifest_path, content).map_err(|error| error.to_string())?;
        std::fs::write(plugin_dir.join("index.js"), index_js).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_plugins(workspace_path: String) -> Result<Vec<PluginManifest>, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    plugins.sort_by(|a, b| a.id.cmp(&b.id));
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
pub(super) fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
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
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    use super::{ensure_bundled_system_plugins, validate_plugin_id};
    use crate::commands::workspace::paths::plugins_dir_path;
    use crate::commands::workspace::types::{PluginExecutionMode, PluginManifest};
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "nevo-plugin-test-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&path).expect("create temp workspace");
        path
    }

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

    #[test]
    fn legacy_manifests_default_to_trusted_webview_execution() {
        let manifest: PluginManifest = serde_json::from_str(
            r#"{
  "id": "plugin.legacy",
  "name": "Legacy",
  "version": "1.0.0",
  "enabled": true,
  "entryPoint": "index.js",
  "apiVersion": "1.0.0"
}"#,
        )
        .expect("parse legacy manifest");

        assert_eq!(manifest.execution_mode, PluginExecutionMode::TrustedWebview);
        let serialized = serde_json::to_value(manifest).expect("serialize manifest");
        assert_eq!(serialized["executionMode"], "trusted-webview");
    }

    #[test]
    fn installs_missing_bundled_system_plugins() {
        let workspace = temp_workspace("install");
        let workspace_path = workspace.to_string_lossy().into_owned();

        ensure_bundled_system_plugins(&workspace_path).expect("install bundled plugins");

        for plugin_id in ["nevo.kanban", "nevo.templates", "nevo.vega", "nevo.markmap"] {
            let plugin_dir = plugins_dir_path(&workspace_path).join(plugin_id);
            assert!(plugin_dir.join("manifest.json").exists());
            assert!(plugin_dir.join("index.js").exists());
            let content =
                std::fs::read_to_string(plugin_dir.join("manifest.json")).expect("manifest");
            let manifest: PluginManifest = serde_json::from_str(&content).expect("parse manifest");
            assert_eq!(manifest.kind, "system");
            assert_eq!(manifest.source, "bundled");
            assert!(manifest.enabled);
        }

        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn preserves_enabled_state_when_updating_bundled_plugin() {
        let workspace = temp_workspace("enabled");
        let workspace_path = workspace.to_string_lossy().into_owned();
        ensure_bundled_system_plugins(&workspace_path).expect("install bundled plugins");

        let manifest_path = plugins_dir_path(&workspace_path)
            .join("nevo.vega")
            .join("manifest.json");
        let content = std::fs::read_to_string(&manifest_path).expect("manifest");
        let mut manifest: PluginManifest = serde_json::from_str(&content).expect("parse manifest");
        manifest.enabled = false;
        std::fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).expect("serialize manifest"),
        )
        .expect("write manifest");

        ensure_bundled_system_plugins(&workspace_path).expect("update bundled plugins");

        let updated: PluginManifest =
            serde_json::from_str(&std::fs::read_to_string(&manifest_path).expect("manifest"))
                .expect("parse manifest");
        assert!(!updated.enabled);

        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn does_not_overwrite_user_plugin_with_system_id() {
        let workspace = temp_workspace("user");
        let workspace_path = workspace.to_string_lossy().into_owned();
        let plugin_dir = plugins_dir_path(&workspace_path).join("nevo.kanban");
        std::fs::create_dir_all(&plugin_dir).expect("create user plugin");
        std::fs::write(
            plugin_dir.join("manifest.json"),
            r#"{
  "id": "nevo.kanban",
  "name": "Custom Kanban",
  "version": "9.9.9",
  "description": "User plugin",
  "enabled": false,
  "kind": "user",
  "source": "folder",
  "entryPoint": "custom.js",
  "apiVersion": "1.0.0",
  "editorCapabilities": []
}"#,
        )
        .expect("write user manifest");

        ensure_bundled_system_plugins(&workspace_path).expect("install bundled plugins");

        let content = std::fs::read_to_string(plugin_dir.join("manifest.json")).expect("manifest");
        assert!(content.contains("Custom Kanban"));
        assert!(!plugin_dir.join("index.js").exists());

        std::fs::remove_dir_all(workspace).expect("cleanup");
    }
}
