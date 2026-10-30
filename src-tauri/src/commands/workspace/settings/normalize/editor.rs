use serde_json::{Map, Value};

use crate::commands::workspace::types::WorkspaceSettings;

pub(super) fn apply_editor(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
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
        .filter(|value| {
            matches!(
                *value,
                "system"
                    | "steady"
                    | "blink"
                    | "fade"
                    | "smooth"
                    | "sparkle"
                    | "glow"
                    | "comet"
                    | "jelly"
            )
        })
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
    settings.editor.slash_menu_layout = editor
        .get("slashMenuLayout")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "list" | "grid" | "preview"))
        .unwrap_or("list")
        .to_string();
    settings.editor.dictation_language = editor
        .get("dictationLanguage")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "auto" | "ru" | "en" | "de" | "fr" | "es"))
        .unwrap_or("auto")
        .to_string();
    settings.editor.focus_mode = editor
        .get("focusMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "off" | "soft"))
        .unwrap_or("off")
        .to_string();
    settings.editor.typewriter_scrolling = editor
        .get("typewriterScrolling")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.editor.active_block_emphasis = editor
        .get("activeBlockEmphasis")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.editor.paste_behavior = editor
        .get("pasteBehavior")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "smart" | "plain-text"))
        .unwrap_or("smart")
        .to_string();
    settings.editor.slash_menu_hints = editor
        .get("slashMenuHints")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    // Legacy "footer" placement was merged into "corner".
    settings.editor.editor_stats_visibility = match editor
        .get("editorStatsVisibility")
        .and_then(|value| value.as_str())
    {
        Some("corner" | "footer") => "corner",
        _ => "off",
    }
    .to_string();
    settings.editor.typewriter_position = editor
        .get("typewriterPosition")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "upper" | "center" | "lower"))
        .unwrap_or("lower")
        .to_string();
}
