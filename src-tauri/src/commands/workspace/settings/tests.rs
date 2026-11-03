use super::*;
use crate::commands::workspace::create_workspace_sync;
use crate::commands::workspace::types::WorkspaceHomeFavorite;
use serde_json::json;
use uuid::Uuid;

struct TestWorkspace {
    path: std::path::PathBuf,
}

impl TestWorkspace {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("nevo-settings-{}", Uuid::new_v4()));
        create_workspace_sync(
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
    assert_eq!(settings.appearance.accent_preset, "mineral");
}

#[test]
fn keeps_dictation_language_and_defaults_unknown_values_to_auto() {
    assert_eq!(
        normalize_settings_value(json!({}))
            .editor
            .dictation_language,
        "auto"
    );
    let ru = normalize_settings_value(json!({ "editor": { "dictationLanguage": "ru" } }));
    assert_eq!(ru.editor.dictation_language, "ru");
    let bogus = normalize_settings_value(json!({ "editor": { "dictationLanguage": "zz" } }));
    assert_eq!(bogus.editor.dictation_language, "auto");
    let saved = serde_json::to_value(&ru).unwrap();
    assert_eq!(saved["editor"]["dictationLanguage"], "ru");
}

#[test]
fn normalizes_slash_menu_layout() {
    let grid = normalize_settings_value(json!({ "editor": { "slashMenuLayout": "grid" } }));
    assert_eq!(grid.editor.slash_menu_layout, "grid");

    let preview = normalize_settings_value(json!({ "editor": { "slashMenuLayout": "preview" } }));
    assert_eq!(preview.editor.slash_menu_layout, "preview");

    let missing = normalize_settings_value(json!({}));
    assert_eq!(missing.editor.slash_menu_layout, "list");

    let invalid = normalize_settings_value(json!({ "editor": { "slashMenuLayout": "tiles" } }));
    assert_eq!(invalid.editor.slash_menu_layout, "list");
}

#[test]
fn defaults_appearance_to_mineral_and_solid_when_missing() {
    let settings = normalize_settings_value(json!({}));

    assert_eq!(settings.appearance.accent_preset, "mineral");
    assert_eq!(settings.appearance.surface_style, "solid");
}

#[test]
fn falls_back_to_mineral_and_solid_for_invalid_appearance_values() {
    let settings = normalize_settings_value(json!({
        "appearance": {
            "accentPreset": 42,
            "surfaceStyle": "not-a-real-style"
        }
    }));

    assert_eq!(settings.appearance.accent_preset, "mineral");
    assert_eq!(settings.appearance.surface_style, "solid");
}

#[test]
fn keeps_custom_accent_color_and_system_editor_font() {
    let settings = normalize_settings_value(json!({
        "appearance": {
            "accentPreset": "#ff6600",
            "editorFontFamily": "  JetBrains Mono  ",
            "customCssFileName": "   "
        }
    }));
    assert_eq!(settings.appearance.accent_preset, "#ff6600");
    assert_eq!(settings.appearance.editor_font_family, "JetBrains Mono");
    assert_eq!(settings.appearance.custom_css_filename, "custom.css");

    let blank = normalize_settings_value(json!({
        "appearance": { "editorFontFamily": "   " }
    }));
    assert_eq!(blank.appearance.editor_font_family, "ui");
}

#[test]
fn normalizes_startup_view_and_note() {
    let defaults = normalize_settings_value(json!({}));
    assert_eq!(defaults.general.default_startup_view, "editor");
    assert_eq!(defaults.general.startup_note_id, None);

    let specific = normalize_settings_value(json!({
        "general": { "defaultStartupView": "specific-note", "startupNoteId": "note-1" }
    }));
    assert_eq!(specific.general.default_startup_view, "specific-note");
    assert_eq!(specific.general.startup_note_id.as_deref(), Some("note-1"));
    let last = normalize_settings_value(json!({
        "general": { "defaultStartupView": "last-note" }
    }));
    assert_eq!(last.general.default_startup_view, "last-note");

    let invalid = normalize_settings_value(json!({
        "general": { "defaultStartupView": "bogus", "startupNoteId": 7 }
    }));
    assert_eq!(invalid.general.default_startup_view, "editor");
    assert_eq!(invalid.general.startup_note_id, None);
}

#[test]
fn normalizes_caret_animation_modes() {
    assert_eq!(
        normalize_settings_value(json!({})).editor.caret_animation,
        "system"
    );
    for mode in [
        "system", "steady", "blink", "fade", "smooth", "sparkle", "glow", "comet", "jelly",
    ] {
        let settings = normalize_settings_value(json!({ "editor": { "caretAnimation": mode } }));
        assert_eq!(settings.editor.caret_animation, mode);
    }
    let invalid = normalize_settings_value(json!({ "editor": { "caretAnimation": "magic" } }));
    assert_eq!(invalid.editor.caret_animation, "system");
}

#[test]
fn normalizes_editor_writing_aids() {
    let defaults = normalize_settings_value(json!({})).editor;
    assert_eq!(defaults.focus_mode, "off");
    assert!(!defaults.typewriter_scrolling);
    assert_eq!(defaults.typewriter_position, "lower");
    assert!(!defaults.active_block_emphasis);
    assert_eq!(defaults.paste_behavior, "smart");
    assert!(defaults.slash_menu_hints);
    assert_eq!(defaults.editor_stats_visibility, "off");

    let valid = normalize_settings_value(json!({ "editor": {
        "focusMode": "soft",
        "typewriterScrolling": true,
        "typewriterPosition": "center",
        "activeBlockEmphasis": true,
        "pasteBehavior": "plain-text",
        "slashMenuHints": false,
        "editorStatsVisibility": "corner"
    }}))
    .editor;
    assert_eq!(valid.focus_mode, "soft");
    assert!(valid.typewriter_scrolling);
    assert_eq!(valid.typewriter_position, "center");
    assert!(valid.active_block_emphasis);
    assert_eq!(valid.paste_behavior, "plain-text");
    assert!(!valid.slash_menu_hints);
    assert_eq!(valid.editor_stats_visibility, "corner");

    let legacy_footer =
        normalize_settings_value(json!({ "editor": { "editorStatsVisibility": "footer" } }));
    assert_eq!(legacy_footer.editor.editor_stats_visibility, "corner");

    let invalid = normalize_settings_value(json!({ "editor": {
        "focusMode": "hard",
        "typewriterScrolling": "yes",
        "typewriterPosition": "top",
        "activeBlockEmphasis": 1,
        "pasteBehavior": "html",
        "slashMenuHints": null,
        "editorStatsVisibility": "sidebar"
    }}))
    .editor;
    assert_eq!(invalid.focus_mode, "off");
    assert!(!invalid.typewriter_scrolling);
    assert_eq!(invalid.typewriter_position, "lower");
    assert!(!invalid.active_block_emphasis);
    assert_eq!(invalid.paste_behavior, "smart");
    assert!(invalid.slash_menu_hints);
    assert_eq!(invalid.editor_stats_visibility, "off");
}

#[test]
fn normalizes_sidebar_layout() {
    assert_eq!(
        normalize_settings_value(json!({})).workspace.sidebar_layout,
        "docked"
    );
    let floating =
        normalize_settings_value(json!({ "workspace": { "sidebarLayout": "floating" } }));
    assert_eq!(floating.workspace.sidebar_layout, "floating");
    let invalid = normalize_settings_value(json!({ "workspace": { "sidebarLayout": "drawer" } }));
    assert_eq!(invalid.workspace.sidebar_layout, "docked");
}

#[test]
fn normalizes_optional_feature_toggles() {
    let defaults = normalize_settings_value(json!({})).features;
    assert!(defaults.vega && defaults.markmap);

    let disabled =
        normalize_settings_value(json!({ "features": { "vega": false, "markmap": false } }))
            .features;
    assert!(!disabled.vega && !disabled.markmap);

    let invalid =
        normalize_settings_value(json!({ "features": { "vega": "no", "markmap": 0 } })).features;
    assert!(invalid.vega && invalid.markmap);
}

#[test]
fn clamps_trash_retention_days() {
    assert_eq!(
        normalize_settings_value(json!({}))
            .files
            .trash_retention_days,
        30
    );
    let kept = normalize_settings_value(json!({ "files": { "trashRetentionDays": 0 } }));
    assert_eq!(kept.files.trash_retention_days, 0);
    let huge =
        normalize_settings_value(json!({ "files": { "trashRetentionDays": 5_000_000_000u64 } }));
    assert_eq!(huge.files.trash_retention_days, 365);
}

#[test]
fn older_ipc_payload_without_new_fields_deserializes_with_defaults() {
    let mut payload = serde_json::to_value(WorkspaceSettings::default()).unwrap();
    for (section, key) in [
        ("general", "startupNoteId"),
        ("editor", "focusMode"),
        ("editor", "typewriterScrolling"),
        ("editor", "activeBlockEmphasis"),
        ("editor", "pasteBehavior"),
        ("editor", "slashMenuHints"),
        ("editor", "editorStatsVisibility"),
        ("editor", "typewriterPosition"),
        ("workspace", "sidebarLayout"),
        ("features", "vega"),
        ("features", "markmap"),
    ] {
        payload[section].as_object_mut().unwrap().remove(key);
    }
    let settings: WorkspaceSettings =
        serde_json::from_value(payload).expect("older payload still deserializes");
    assert!(settings.editor.slash_menu_hints);
    assert_eq!(settings.editor.typewriter_position, "lower");
    assert_eq!(settings.workspace.sidebar_layout, "docked");
    assert!(settings.features.vega && settings.features.markmap);
}

#[test]
fn preserves_mineral_and_azure_accent_presets() {
    let mineral = normalize_settings_value(json!({
        "appearance": { "accentPreset": "mineral" }
    }));
    assert_eq!(mineral.appearance.accent_preset, "mineral");

    let azure = normalize_settings_value(json!({
        "appearance": { "accentPreset": "azure" }
    }));
    assert_eq!(azure.appearance.accent_preset, "azure");
}

#[test]
fn preserves_legacy_surface_style_values() {
    let glass = normalize_settings_value(json!({
        "appearance": { "surfaceStyle": "glass" }
    }));
    assert_eq!(glass.appearance.surface_style, "glass");

    let tinted = normalize_settings_value(json!({
        "appearance": { "surfaceStyle": "tinted" }
    }));
    assert_eq!(tinted.appearance.surface_style, "tinted");
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
    let reloaded =
        load_workspace_settings_sync(workspace_path).expect("reload settings with home favorites");

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

#[test]
fn preserves_accent_colored_headings_setting() {
    let enabled = normalize_settings_value(json!({
        "appearance": { "accentColoredHeadings": true }
    }));
    assert!(enabled.appearance.accent_colored_headings);

    let enabled_from_editor = normalize_settings_value(json!({
        "editor": { "accentColoredHeadings": true }
    }));
    assert!(enabled_from_editor.appearance.accent_colored_headings);

    let disabled = normalize_settings_value(json!({
        "appearance": { "accentColoredHeadings": false }
    }));
    assert!(!disabled.appearance.accent_colored_headings);

    let default_val = normalize_settings_value(json!({}));
    assert!(!default_val.appearance.accent_colored_headings);
}

#[test]
fn accent_colored_headings_survives_settings_save_and_reload() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    let mut settings = WorkspaceSettings::default();
    settings.appearance.accent_colored_headings = true;

    save_workspace_settings_sync(workspace_path.clone(), settings)
        .expect("save settings with accent colored headings");
    let reloaded = load_workspace_settings_sync(workspace_path)
        .expect("reload settings with accent colored headings");

    assert!(reloaded.appearance.accent_colored_headings);
}

/// Shared with `src/utils/workspace-settings.test.ts`: every field of the
/// TS `WorkspaceSettings`, each set to a valid non-default value.
const ROUNDTRIP_FIXTURE: &str =
    include_str!("../../../../../src/utils/workspace-settings/roundtrip.fixture.json");

#[test]
fn every_frontend_setting_survives_save_and_reload() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let expected: Value = serde_json::from_str(ROUNDTRIP_FIXTURE).expect("parse fixture");
    // Deserialize like the Tauri IPC boundary does before saving.
    let settings: WorkspaceSettings =
        serde_json::from_value(expected.clone()).expect("deserialize fixture");

    save_workspace_settings_sync(workspace_path.clone(), settings).expect("save settings");
    let reloaded = load_workspace_settings_sync(workspace_path).expect("reload settings");

    assert_eq!(serde_json::to_value(&reloaded).unwrap(), expected);
}
