mod home_favorites;

use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{OnceLock, RwLock};

use self::home_favorites::normalize_home_favorites;
use super::paths::{settings_path, workspace_context, workspace_error_context};
use super::types::{default_hotkey_bindings, HotkeyBinding, WorkspaceSettings};
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

fn normalize_view(value: Option<&str>) -> String {
    match value {
        Some("table") => "table".to_string(),
        Some("kanban") => "kanban".to_string(),
        Some("graph") => "graph".to_string(),
        _ => "editor".to_string(),
    }
}

fn clamp_u32(value: Option<u64>, fallback: u32, min: u32, max: u32) -> u32 {
    let raw = value.unwrap_or(fallback as u64);
    raw.max(min as u64).min(max as u64) as u32
}

fn normalize_hotkey_token(segment: &str) -> Option<String> {
    let value = segment.trim();
    if value.is_empty() {
        return None;
    }

    let lower = value.to_lowercase();
    match lower.as_str() {
        "mod" | "ctrl" | "control" | "cmdorcontrol" | "cmdorctrl" | "commandorcontrol" => {
            Some("Ctrl".to_string())
        }
        "alt" | "option" => Some("Alt".to_string()),
        "shift" => Some("Shift".to_string()),
        "meta" | "cmd" | "command" | "super" => Some("Meta".to_string()),
        "spacebar" | "space" => Some("Space".to_string()),
        "esc" => Some("Escape".to_string()),
        "return" => Some("Enter".to_string()),
        _ if value.len() == 1 => Some(value.to_uppercase()),
        _ => {
            let mut chars = value.chars();
            let first = chars.next()?;
            Some(first.to_uppercase().collect::<String>() + chars.as_str())
        }
    }
}

fn normalize_hotkey_chord(chord: &str) -> Option<String> {
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut meta = false;
    let mut key: Option<String> = None;

    for segment in chord.split('+') {
        let token = match normalize_hotkey_token(segment) {
            Some(token) => token,
            None => continue,
        };

        match token.as_str() {
            "Ctrl" => ctrl = true,
            "Alt" => alt = true,
            "Shift" => shift = true,
            "Meta" => meta = true,
            _ => key = Some(token),
        }
    }

    let key = key?;
    let mut parts = Vec::new();
    if ctrl {
        parts.push("Ctrl".to_string());
    }
    if alt {
        parts.push("Alt".to_string());
    }
    if shift {
        parts.push("Shift".to_string());
    }
    if meta {
        parts.push("Meta".to_string());
    }
    parts.push(key);
    Some(parts.join("+"))
}

fn normalize_hotkey_binding(binding: HotkeyBinding) -> HotkeyBinding {
    HotkeyBinding {
        command_id: binding.command_id,
        label: binding.label,
        default_chord: normalize_hotkey_chord(&binding.default_chord)
            .unwrap_or(binding.default_chord),
        custom_chord: binding
            .custom_chord
            .as_deref()
            .and_then(normalize_hotkey_chord),
        scope: if binding.scope == "app" {
            "app".to_string()
        } else {
            "workspace".to_string()
        },
    }
}

fn normalize_settings_value(raw: Value) -> WorkspaceSettings {
    let mut settings = WorkspaceSettings::default();
    let object = raw.as_object().cloned().unwrap_or_default();

    let general = object
        .get("general")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.general.default_startup_view = normalize_view(
        general
            .get("defaultStartupView")
            .and_then(|value| value.as_str())
            .or_else(|| object.get("defaultView").and_then(|value| value.as_str())),
    );
    settings.general.restore_last_context = general
        .get("restoreLastContext")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.general.recent_items_behavior = general
        .get("recentItemsBehavior")
        .and_then(|value| value.as_str())
        .filter(|value| *value == "manual")
        .unwrap_or("remember")
        .to_string();
    settings.general.confirm_before_delete = general
        .get("confirmBeforeDelete")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.general.home_favorites = normalize_home_favorites(general.get("homeFavorites"));
    if let Some(last_context) = general
        .get("lastContext")
        .and_then(|value| value.as_object())
    {
        settings.general.last_context.kind =
            match last_context.get("kind").and_then(|value| value.as_str()) {
                Some("note") => "note".to_string(),
                Some("folder") => "folder".to_string(),
                _ => "workspace".to_string(),
            };
        settings.general.last_context.note_id = last_context
            .get("noteId")
            .and_then(|value| value.as_str())
            .map(String::from);
        settings.general.last_context.folder_id = last_context
            .get("folderId")
            .and_then(|value| value.as_str())
            .map(String::from);
    }

    let appearance = object
        .get("appearance")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.appearance.accent_preset = appearance
        .get("accentPreset")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "violet" | "ember" | "sage" | "ocean" | "rose"))
        .unwrap_or("violet")
        .to_string();
    settings.appearance.background_scene = appearance
        .get("backgroundScene")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "aurora" | "paper" | "studio" | "plain"))
        .unwrap_or("aurora")
        .to_string();
    settings.appearance.surface_style = appearance
        .get("surfaceStyle")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "glass" | "solid" | "tinted"))
        .unwrap_or("glass")
        .to_string();
    settings.appearance.contrast_mode = appearance
        .get("contrastMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "soft" | "balanced" | "high"))
        .unwrap_or("balanced")
        .to_string();
    settings.appearance.sidebar_style = appearance
        .get("sidebarStyle")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "floating" | "solid" | "minimal"))
        .unwrap_or("floating")
        .to_string();
    settings.appearance.editor_font_family = appearance
        .get("editorFontFamily")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "ui" | "serif" | "mono"))
        .unwrap_or("ui")
        .to_string();
    settings.appearance.editor_font_size = clamp_u32(
        appearance
            .get("editorFontSize")
            .and_then(|value| value.as_u64())
            .or_else(|| {
                object
                    .get("editorFontSize")
                    .and_then(|value| value.as_u64())
            }),
        16,
        12,
        22,
    );
    settings.appearance.editor_line_width = appearance
        .get("editorLineWidth")
        .and_then(|value| value.as_str())
        .or_else(|| {
            object
                .get("editorLineWidth")
                .and_then(|value| value.as_str())
        })
        .filter(|value| matches!(*value, "narrow" | "medium" | "wide"))
        .unwrap_or("medium")
        .to_string();
    settings.appearance.custom_css_enabled = appearance
        .get("customCssEnabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.appearance.custom_css_filename = appearance
        .get("customCssFileName")
        .and_then(|value| value.as_str())
        .unwrap_or("custom.css")
        .to_string();

    let editor = object
        .get("editor")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.editor.spell_check = editor
        .get("spellCheck")
        .and_then(|value| value.as_bool())
        .or_else(|| object.get("spellCheck").and_then(|value| value.as_bool()))
        .unwrap_or(false);
    settings.editor.markdown_shortcuts = editor
        .get("markdownShortcuts")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.editor.slash_commands = editor
        .get("slashCommands")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.editor.smooth_scrolling = editor
        .get("smoothScrolling")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.editor.caret_animation = editor
        .get("caretAnimation")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "system" | "steady" | "blink"))
        .unwrap_or("system")
        .to_string();
    settings.editor.tab_key_behavior = editor
        .get("tabKeyBehavior")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "indent" | "focus"))
        .unwrap_or("indent")
        .to_string();
    settings.editor.autosave_policy = editor
        .get("autosavePolicy")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "immediate" | "window-idle"))
        .unwrap_or("immediate")
        .to_string();

    let workspace = object
        .get("workspace")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.workspace.default_landing_view = normalize_view(
        workspace
            .get("defaultLandingView")
            .and_then(|value| value.as_str())
            .or(Some(settings.general.default_startup_view.as_str())),
    );
    settings.workspace.show_backlinks_by_default = workspace
        .get("showBacklinksByDefault")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.show_graph_labels = workspace
        .get("showGraphLabels")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.workspace.folder_create_behavior = "current-folder".to_string();
    settings.workspace.root_notes_visible = workspace
        .get("rootNotesVisible")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.default_sort = "updated-desc".to_string();
    settings.workspace.description = workspace
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    settings.workspace.workspace_type = workspace
        .get("workspaceType")
        .and_then(|value| value.as_str())
        .filter(|value| {
            matches!(
                *value,
                "general" | "research" | "writing" | "product" | "knowledge-base"
            )
        })
        .unwrap_or("general")
        .to_string();
    settings.workspace.status = workspace
        .get("status")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "active" | "archived" | "draft"))
        .unwrap_or("active")
        .to_string();
    settings.workspace.tags = workspace
        .get("tags")
        .and_then(|value| value.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    settings.workspace.open_last_visited_system_view = workspace
        .get("openLastVisitedSystemView")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.remember_expanded_folders = workspace
        .get("rememberExpandedFolders")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.sidebar_default_state = workspace
        .get("sidebarDefaultState")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "expanded" | "collapsed"))
        .unwrap_or("expanded")
        .to_string();
    settings.workspace.new_note_placement = workspace
        .get("newNotePlacement")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "current-folder" | "root"))
        .unwrap_or("current-folder")
        .to_string();
    settings.workspace.new_folder_placement = workspace
        .get("newFolderPlacement")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "current-folder" | "root"))
        .unwrap_or("current-folder")
        .to_string();
    settings.workspace.default_child_sort = workspace
        .get("defaultChildSort")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "manual" | "title-asc" | "updated-desc"))
        .unwrap_or("manual")
        .to_string();
    settings.workspace.show_empty_folders = workspace
        .get("showEmptyFolders")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.default_note_icon = workspace
        .get("defaultNoteIcon")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("📄")
        .to_string();
    settings.workspace.default_note_title_pattern = workspace
        .get("defaultNoteTitlePattern")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "untitled" | "date" | "date-time"))
        .unwrap_or("untitled")
        .to_string();
    settings.workspace.default_folder_icon = workspace
        .get("defaultFolderIcon")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("📁")
        .to_string();
    settings.workspace.new_note_template = workspace
        .get("newNoteTemplate")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("blank")
        .to_string();
    settings.workspace.new_workspace_home_note = workspace
        .get("newWorkspaceHomeNote")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.auto_create_starter_structure = workspace
        .get("autoCreateStarterStructure")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "off" | "light" | "structured"))
        .unwrap_or("light")
        .to_string();
    settings.workspace.sidebar_content_mode = workspace
        .get("sidebarContentMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "tree" | "tag-preview"))
        .unwrap_or("tree")
        .to_string();
    settings.workspace.graph_entry_mode = workspace
        .get("graphEntryMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "global" | "from-current-note"))
        .unwrap_or("global")
        .to_string();
    settings.workspace.graph_scope_default = workspace
        .get("graphScopeDefault")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "workspace" | "current-folder"))
        .unwrap_or("workspace")
        .to_string();
    settings.workspace.search_start_scope = workspace
        .get("searchStartScope")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "workspace" | "current-folder"))
        .unwrap_or("workspace")
        .to_string();
    settings.workspace.history_default_range = workspace
        .get("historyDefaultRange")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "7d" | "30d" | "all"))
        .unwrap_or("30d")
        .to_string();
    settings.workspace.sidebar_sort_mode = workspace
        .get("sidebarSortMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "manual" | "name-asc" | "name-desc" | "updated"))
        .unwrap_or("manual")
        .to_string();

    let ai = object
        .get("ai")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.ai.enabled = ai
        .get("enabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.ai.privacy_mode = ai
        .get("privacyMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.ai.default_provider = ai
        .get("defaultProvider")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "local" | "cloud"))
        .unwrap_or("local")
        .to_string();
    settings.ai.default_model = ai
        .get("defaultModel")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("llama3")
        .to_string();
    settings.ai.slash_commands = ai
        .get("slashCommands")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.ai.contextual_suggestions = ai
        .get("contextualSuggestions")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.ai.streaming_output = ai
        .get("streamingOutput")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.ai.max_tokens_per_request = clamp_u32(
        ai.get("maxTokensPerRequest")
            .and_then(|value| value.as_u64()),
        1024,
        128,
        8192,
    );
    settings.ai.cloud_daily_budget_usd = clamp_u32(
        ai.get("cloudDailyBudgetUsd")
            .and_then(|value| value.as_u64()),
        0,
        0,
        500,
    );
    settings.ai.base_url = ai
        .get("baseUrl")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("http://localhost:11434")
        .to_string();
    settings.ai.api_kind = ai
        .get("apiKind")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "ollama" | "openai"))
        .unwrap_or("ollama")
        .to_string();

    let plugins = object
        .get("plugins")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.plugins.auto_reload_on_launch = plugins
        .get("autoReloadOnLaunch")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.plugins.install_source = "folder-only".to_string();

    if let Some(plugin_settings) = object.get("pluginSettings").and_then(|v| v.as_object()) {
        settings.plugin_settings = plugin_settings
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
    }

    let features = object
        .get("features")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.features.kanban = features
        .get("kanban")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.features.templates = features
        .get("templates")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);

    let hotkeys = object
        .get("hotkeys")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.hotkeys.bindings = hotkeys
        .get("bindings")
        .and_then(|value| serde_json::from_value::<Vec<HotkeyBinding>>(value.clone()).ok())
        .map(|bindings| {
            bindings
                .into_iter()
                .map(normalize_hotkey_binding)
                .collect::<Vec<HotkeyBinding>>()
        })
        .filter(|bindings: &Vec<HotkeyBinding>| !bindings.is_empty())
        .unwrap_or_else(default_hotkey_bindings);

    let files = object
        .get("files")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.files.attachment_import_behavior = "copy-into-workspace".to_string();
    settings.files.snapshot_retention_count = clamp_u32(
        files
            .get("snapshotRetentionCount")
            .and_then(|value| value.as_u64()),
        50,
        1,
        200,
    );
    settings.files.trash_retention_days = files
        .get("trashRetentionDays")
        .and_then(|value| value.as_u64())
        .map(|v| v as u32)
        .unwrap_or(30);

    let advanced = object
        .get("advanced")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.advanced.schema_version = 2;
    settings.advanced.experimental_graph_tools = advanced
        .get("experimentalGraphTools")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.advanced.developer_logging = advanced
        .get("developerLogging")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    settings
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::workspace::create_workspace;
    use crate::commands::workspace::types::WorkspaceHomeFavorite;
    use serde_json::json;
    use uuid::Uuid;

    struct TestWorkspace {
        path: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-settings-{}", Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Settings".to_string(),
                "N".to_string(),
                "violet".to_string(),
            )
            .expect("create workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn migrates_legacy_flat_settings() {
        let settings = normalize_settings_value(json!({
            "defaultView": "graph",
            "editorFontSize": 19,
            "editorLineWidth": "wide",
            "spellCheck": true
        }));

        assert_eq!(settings.general.default_startup_view, "graph");
        assert_eq!(settings.workspace.default_landing_view, "graph");
        assert_eq!(settings.appearance.editor_font_size, 19);
        assert_eq!(settings.appearance.editor_line_width, "wide");
        assert!(settings.editor.spell_check);
        assert_eq!(settings.advanced.schema_version, 2);
    }

    #[test]
    fn preserves_ai_provider_settings_through_normalization() {
        let settings = normalize_settings_value(json!({
            "ai": {
                "enabled": true,
                "apiKind": "openai",
                "baseUrl": "http://localhost:1234/v1",
                "defaultModel": "qwen2.5",
                "streamingOutput": false
            }
        }));

        assert!(settings.ai.enabled);
        assert_eq!(settings.ai.api_kind, "openai");
        assert_eq!(settings.ai.base_url, "http://localhost:1234/v1");
        assert_eq!(settings.ai.default_model, "qwen2.5");
        assert!(!settings.ai.streaming_output);
    }

    #[test]
    fn falls_back_to_default_ai_provider_for_unknown_api_kind() {
        let settings = normalize_settings_value(json!({
            "ai": { "apiKind": "bogus", "baseUrl": "   " }
        }));

        assert_eq!(settings.ai.api_kind, "ollama");
        assert_eq!(settings.ai.base_url, "http://localhost:11434");
    }

    #[test]
    fn preserves_arbitrary_plugin_settings_passthrough() {
        let settings = normalize_settings_value(json!({
            "pluginSettings": {
                "nevo.github-sync": {
                    "repo": "owner/name",
                    "branch": "main",
                    "autoSync": true,
                    "intervalMinutes": 15
                }
            }
        }));

        let github = settings
            .plugin_settings
            .get("nevo.github-sync")
            .expect("github-sync plugin settings preserved");
        assert_eq!(
            github.get("repo").and_then(|v| v.as_str()),
            Some("owner/name")
        );
        assert_eq!(github.get("autoSync").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(
            github.get("intervalMinutes").and_then(|v| v.as_i64()),
            Some(15)
        );
    }

    #[test]
    fn defaults_plugin_settings_to_empty_map_when_absent() {
        let settings = normalize_settings_value(json!({}));
        assert!(settings.plugin_settings.is_empty());
    }

    #[test]
    fn fills_missing_nested_settings_with_defaults() {
        let settings = normalize_settings_value(json!({
            "editor": {
                "slashCommands": false
            },
            "files": {
                "snapshotRetentionCount": 5
            }
        }));

        assert!(!settings.editor.slash_commands);
        assert!(settings.editor.markdown_shortcuts);
        assert_eq!(settings.files.snapshot_retention_count, 5);
        assert_eq!(settings.general.default_startup_view, "editor");
        assert_eq!(settings.appearance.accent_preset, "violet");
    }

    #[test]
    fn preserves_explicit_disabled_markdown_shortcuts() {
        let settings = normalize_settings_value(json!({
            "editor": {
                "markdownShortcuts": false
            }
        }));

        assert!(!settings.editor.markdown_shortcuts);
    }

    #[test]
    fn normalizes_legacy_mod_hotkeys_to_ctrl() {
        let settings = normalize_settings_value(json!({
            "hotkeys": {
                "bindings": [
                    {
                        "commandId": "workspace.new-note",
                        "label": "Create note",
                        "defaultChord": "Mod+N",
                        "customChord": "shift+mod+k",
                        "scope": "workspace"
                    }
                ]
            }
        }));

        assert_eq!(settings.hotkeys.bindings[0].default_chord, "Ctrl+N");
        assert_eq!(
            settings.hotkeys.bindings[0].custom_chord.as_deref(),
            Some("Ctrl+Shift+K")
        );
    }

    #[test]
    fn home_favorites_survive_settings_save_and_reload() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();
        let favorites = vec![
            WorkspaceHomeFavorite::Note {
                id: "note-1".to_string(),
            },
            WorkspaceHomeFavorite::Graph,
            WorkspaceHomeFavorite::PluginView {
                plugin_id: "plugin.alpha".to_string(),
                contribution_id: "dashboard".to_string(),
            },
        ];
        let mut settings = WorkspaceSettings::default();
        settings.general.home_favorites = favorites.clone();

        save_workspace_settings_sync(workspace_path.clone(), settings)
            .expect("save settings with home favorites");
        let reloaded = load_workspace_settings_sync(workspace_path)
            .expect("reload settings with home favorites");

        assert_eq!(reloaded.general.home_favorites, favorites);
    }

    #[test]
    fn is_extended_diagnostics_enabled_reflects_latest_saved_value() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();

        let mut settings = WorkspaceSettings::default();
        settings.advanced.developer_logging = true;
        save_workspace_settings_sync(workspace_path.clone(), settings.clone())
            .expect("save settings with logging enabled");
        assert!(is_extended_diagnostics_enabled(&workspace_path));

        settings.advanced.developer_logging = false;
        save_workspace_settings_sync(workspace_path.clone(), settings)
            .expect("save settings with logging disabled");
        assert!(!is_extended_diagnostics_enabled(&workspace_path));
    }
}
