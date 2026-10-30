use serde_json::{Map, Value};

use crate::commands::workspace::types::{
    default_hotkey_bindings, HotkeyBinding, WorkspaceSettings,
};

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

pub(super) fn apply_hotkeys(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
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
}
