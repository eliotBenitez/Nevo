use serde_json::{Map, Value};

use super::super::home_favorites::normalize_home_favorites;
use super::normalize_view;
use crate::commands::workspace::types::WorkspaceSettings;

pub(super) fn apply_general(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
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
    settings.general.startup_note_id = general
        .get("startupNoteId")
        .and_then(|value| value.as_str())
        .map(String::from);
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
}
