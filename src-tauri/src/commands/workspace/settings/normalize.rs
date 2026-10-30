mod ai;
mod appearance;
mod editor;
mod general;
mod hotkeys;
mod workspace;

use serde_json::{Map, Value};

use crate::commands::workspace::types::{McpMode, WorkspaceSettings};

fn normalize_view(value: Option<&str>) -> String {
    match value {
        Some("table") => "table".to_string(),
        Some("kanban") => "kanban".to_string(),
        Some("graph") => "graph".to_string(),
        Some("last-note") => "last-note".to_string(),
        Some("specific-note") => "specific-note".to_string(),
        _ => "editor".to_string(),
    }
}

fn clamp_u32(value: Option<u64>, fallback: u32, min: u32, max: u32) -> u32 {
    let raw = value.unwrap_or(fallback as u64);
    raw.max(min as u64).min(max as u64) as u32
}
pub(super) fn normalize_settings_value(raw: Value) -> WorkspaceSettings {
    let mut settings = WorkspaceSettings::default();
    let object = raw.as_object().cloned().unwrap_or_default();

    general::apply_general(&mut settings, &object);
    appearance::apply_appearance(&mut settings, &object);
    editor::apply_editor(&mut settings, &object);
    workspace::apply_workspace(&mut settings, &object);
    ai::apply_ai(&mut settings, &object);
    apply_plugins(&mut settings, &object);
    apply_features(&mut settings, &object);
    apply_mcp(&mut settings, &object);
    hotkeys::apply_hotkeys(&mut settings, &object);
    apply_files(&mut settings, &object);
    apply_advanced(&mut settings, &object);

    settings
}

pub(super) fn apply_plugins(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
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
}

pub(super) fn apply_features(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
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
    settings.features.vega = features
        .get("vega")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.features.markmap = features
        .get("markmap")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
}

pub(super) fn apply_mcp(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
    let mcp = object
        .get("mcp")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.mcp.mode = mcp
        .get("mode")
        .and_then(|value| value.as_str())
        .map(McpMode::parse)
        .unwrap_or_default();
    settings.mcp.auto_snapshot = mcp
        .get("autoSnapshot")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
}

pub(super) fn apply_files(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
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
    settings.files.trash_retention_days = clamp_u32(
        files
            .get("trashRetentionDays")
            .and_then(|value| value.as_u64()),
        30,
        0,
        365,
    );
}

pub(super) fn apply_advanced(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
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
}
