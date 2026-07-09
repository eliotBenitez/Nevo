use serde::Serialize;
use serde_json::Value;

use super::{note_context, note_error_context, note_path, NoteDocument};
use crate::commands::folder::load_manifest;
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::{FolderMeta, NoteMeta};
use crate::logging::{LogContext, LogError};

const PREVIEW_LIMIT: usize = 180;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SidebarNotePreview {
    pub note_id: String,
    pub title: String,
    pub icon: String,
    pub folder_path: String,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub preview_text: String,
}

#[tauri::command]
pub async fn list_sidebar_note_previews(
    workspace_path: String,
) -> Result<Vec<SidebarNotePreview>, String> {
    tauri::async_runtime::spawn_blocking(move || list_sidebar_note_previews_impl(workspace_path))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn list_sidebar_note_previews_impl(
    workspace_path: String,
) -> Result<Vec<SidebarNotePreview>, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "list_sidebar_note_previews",
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
    let manifest = load_manifest(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "list_sidebar_note_previews",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let mut entries: Vec<(NoteMeta, String)> = manifest
        .root_notes
        .iter()
        .cloned()
        .map(|note| (note, String::new()))
        .collect();
    collect_folder_notes(&manifest.tree, &mut Vec::new(), &mut entries);

    let mut previews = Vec::with_capacity(entries.len());
    for (meta, folder_path) in entries {
        match read_preview(&workspace_path, &meta, folder_path) {
            Ok(preview) => previews.push(preview),
            Err(message) => {
                let _ = logger.warn(
                    "tauri.note",
                    "list_sidebar_note_previews",
                    "Skipped invalid note while building sidebar preview",
                    false,
                    note_context(&workspace_path)
                        .with_error(LogError {
                            kind: Some("note".to_string()),
                            message,
                            details: None,
                        })
                        .with_payload(serde_json::json!({ "noteId": meta.id })),
                );
            }
        }
    }

    previews.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(previews)
}

fn collect_folder_notes(
    folders: &[FolderMeta],
    parents: &mut Vec<String>,
    entries: &mut Vec<(NoteMeta, String)>,
) {
    for folder in folders {
        parents.push(folder.title.clone());
        let folder_path = parents.join(" / ");
        for note in &folder.notes {
            entries.push((note.clone(), folder_path.clone()));
        }
        collect_folder_notes(&folder.children, parents, entries);
        parents.pop();
    }
}

fn read_preview(
    workspace_path: &str,
    meta: &NoteMeta,
    folder_path: String,
) -> Result<SidebarNotePreview, String> {
    let path = note_path(workspace_path, &meta.id)?;
    let content = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let note: NoteDocument = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    let tags = note
        .properties
        .as_ref()
        .map(|properties| normalize_tags(&properties.tags))
        .unwrap_or_default();

    Ok(SidebarNotePreview {
        note_id: note.id,
        title: note.title,
        icon: note.icon,
        folder_path,
        updated_at: note.updated_at,
        tags,
        preview_text: build_preview_text(&note.content, PREVIEW_LIMIT),
    })
}

fn normalize_tags(tags: &[String]) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::new();
    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if normalized
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(trimmed))
        {
            continue;
        }
        normalized.push(trimmed.to_string());
    }
    normalized
}

fn build_preview_text(content: &Value, max_len: usize) -> String {
    let mut lines = Vec::new();
    collect_preview_lines(content, &mut lines);
    truncate_preview(&lines.join(" · "), max_len)
}

fn collect_preview_lines(node: &Value, lines: &mut Vec<String>) {
    let node_type = node.get("type").and_then(Value::as_str).unwrap_or_default();
    if node_type == "text" {
        return;
    }
    if node_type != "doc" && !is_skipped_block(node_type) {
        let mut chunks = Vec::new();
        collect_text(node, &mut chunks);
        let line = chunks.join(" ");
        let compact = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if !compact.is_empty() {
            lines.push(compact);
        }
    }

    if let Some(children) = node.get("content").and_then(Value::as_array) {
        for child in children {
            collect_preview_lines(child, lines);
        }
    }
}

fn collect_text(node: &Value, chunks: &mut Vec<String>) {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        chunks.push(text.to_string());
    }
    if let Some(children) = node.get("content").and_then(Value::as_array) {
        for child in children {
            collect_text(child, chunks);
        }
    }
}

fn is_skipped_block(node_type: &str) -> bool {
    matches!(
        node_type,
        "image"
            | "video"
            | "audio"
            | "file"
            | "draw_block"
            | "mermaid_block"
            | "vega_block"
            | "math_display"
    )
}

fn truncate_preview(text: &str, max_len: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= max_len {
        return compact;
    }
    let mut out: String = compact.chars().take(max_len.saturating_sub(1)).collect();
    while out.ends_with(char::is_whitespace) {
        out.pop();
    }
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::build_preview_text;

    #[test]
    fn preview_text_skips_empty_and_service_blocks() {
        let doc = serde_json::json!({
            "type": "doc",
            "content": [
                { "type": "paragraph" },
                { "type": "image", "attrs": { "src": "x.png" } },
                { "type": "paragraph", "content": [{ "type": "text", "text": "First line" }] },
                { "type": "heading", "content": [{ "type": "text", "text": "Second line" }] }
            ]
        });

        assert_eq!(build_preview_text(&doc, 180), "First line · Second line");
    }
}
