use serde_json::{Map, Value};

use super::clamp_u32;
use crate::commands::workspace::types::WorkspaceSettings;

pub(super) fn apply_appearance(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
    let appearance = object
        .get("appearance")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    // A preset id or a custom accent color picked in workspace settings.
    settings.appearance.accent_preset = appearance
        .get("accentPreset")
        .and_then(|value| value.as_str())
        .unwrap_or("mineral")
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
        .unwrap_or("solid")
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
        .map(str::trim)
        .filter(|value| !value.is_empty())
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
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("custom.css")
        .to_string();
    settings.appearance.accent_colored_headings = appearance
        .get("accentColoredHeadings")
        .and_then(|value| value.as_bool())
        .or_else(|| {
            object
                .get("editor")
                .and_then(|v| v.as_object())
                .and_then(|e| e.get("accentColoredHeadings"))
                .and_then(|value| value.as_bool())
        })
        .or_else(|| {
            object
                .get("accentColoredHeadings")
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(false);
}
