use serde_json::Value;

use super::{
    note_context, note_error_context, notes_dir_path, NoteDocument, WorkspaceBlockSearchResult,
};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

fn normalize_search_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn ordered_fuzzy_score(query: &str, text: &str) -> Option<i64> {
    let mut query_chars = query.chars();
    let mut current_query = query_chars.next()?;
    let mut first_match_index: Option<usize> = None;
    let mut matched = 0usize;

    for (text_index, text_char) in text.chars().enumerate() {
        if text_char != current_query {
            continue;
        }

        if first_match_index.is_none() {
            first_match_index = Some(text_index);
        }

        matched += 1;

        match query_chars.next() {
            Some(next_char) => current_query = next_char,
            None => {
                let first = first_match_index.unwrap_or(text_index);
                let last = text_index;
                let span = (last - first + 1) as i64;
                let density_penalty = span - query.chars().count() as i64;
                return Some(1_000 - first as i64 * 6 - density_penalty * 8);
            }
        }
    }

    if matched == query.chars().count() {
        Some(1_000)
    } else {
        None
    }
}

fn text_search_score(query: &str, text: &str) -> Option<i64> {
    let normalized_query = normalize_search_text(query);
    let normalized_text = normalize_search_text(text);

    if normalized_query.is_empty() || normalized_text.is_empty() {
        return None;
    }

    if normalized_text.starts_with(&normalized_query) {
        return Some(3_000 - normalized_text.len() as i64);
    }

    if let Some(index) = normalized_text.find(&normalized_query) {
        return Some(2_000 - index as i64 * 8 - normalized_text.len() as i64);
    }

    ordered_fuzzy_score(&normalized_query, &normalized_text)
}

fn get_attr_str<'a>(map: &'a serde_json::Map<String, Value>, key: &str) -> &'a str {
    map.get("attrs")
        .and_then(|a| a.get(key))
        .and_then(|v| v.as_str())
        .unwrap_or("")
}

fn flatten_block_text(node: &Value) -> String {
    match node {
        Value::Object(map) => match map.get("type").and_then(|value| value.as_str()) {
            Some("text") => map
                .get("text")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string(),
            Some("hard_break") => "\n".to_string(),
            Some("bookmark_embed") => {
                let title = get_attr_str(map, "title");
                let description = get_attr_str(map, "description");
                let url = get_attr_str(map, "url");
                [title, description, url]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" ")
            }
            Some("note_embed") => {
                let title = get_attr_str(map, "title");
                let preview = get_attr_str(map, "previewText");
                [title, preview]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" ")
            }
            Some("properties_block") => {
                let status = get_attr_str(map, "status");
                let tags = get_attr_str(map, "tags");
                let owner = get_attr_str(map, "owner");
                [status, tags, owner]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" ")
            }
            _ => map
                .get("content")
                .and_then(|value| value.as_array())
                .map(|children| {
                    children
                        .iter()
                        .map(flatten_block_text)
                        .collect::<Vec<_>>()
                        .join("")
                })
                .unwrap_or_default(),
        },
        Value::Array(children) => children
            .iter()
            .map(flatten_block_text)
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

fn flatten_note_blocks(content: &Value) -> Vec<String> {
    let blocks = content
        .get("content")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    blocks
        .iter()
        .map(flatten_block_text)
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .collect()
}

fn build_match_snippet(block_text: &str, query: &str) -> String {
    let normalized_query = normalize_search_text(query);
    let normalized_text = normalize_search_text(block_text);
    let text_chars = block_text.chars().collect::<Vec<_>>();

    if let Some(byte_index) = normalized_text.find(&normalized_query) {
        let prefix_chars = normalized_text[..byte_index].chars().count();
        let start = prefix_chars.saturating_sub(28);
        let end = (prefix_chars + normalized_query.chars().count() + 44).min(text_chars.len());
        let snippet = text_chars[start..end].iter().collect::<String>();
        return if start > 0 || end < text_chars.len() {
            format!("…{}…", snippet.trim())
        } else {
            snippet
        };
    }

    if text_chars.len() <= 96 {
        return block_text.to_string();
    }

    format!("{}…", text_chars[..96].iter().collect::<String>().trim())
}

fn collect_block_matches(
    note: &NoteDocument,
    query: &str,
) -> Vec<(i64, WorkspaceBlockSearchResult)> {
    flatten_note_blocks(&note.content)
        .into_iter()
        .enumerate()
        .filter_map(|(block_index, block_text)| {
            let score = text_search_score(query, &block_text)?;
            let snippet = build_match_snippet(&block_text, query);
            let result = WorkspaceBlockSearchResult {
                id: format!("{}:{}", note.id, block_index),
                note_id: note.id.clone(),
                note_title: note.title.clone(),
                folder_id: note.folder_id.clone(),
                block_index,
                snippet,
                block_text,
            };
            Some((score, result))
        })
        .collect()
}

// Offload to a blocking thread: this walks and parses every note file in the
// workspace, which would otherwise freeze the WebKitGTK UI thread on large
// workspaces (see AGENTS.md "Platform Gotchas").
#[tauri::command]
pub async fn search_workspace_blocks(
    workspace_path: String,
    query: String,
) -> Result<Vec<WorkspaceBlockSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || search_workspace_blocks_sync(workspace_path, query))
        .await
        .map_err(|e| e.to_string())?
}

pub(crate) fn search_workspace_blocks_sync(
    workspace_path: String,
    query: String,
) -> Result<Vec<WorkspaceBlockSearchResult>, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "search_workspace_blocks",
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
    let normalized_query = normalize_search_text(&query);
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);

    if normalized_query.is_empty() {
        return Ok(vec![]);
    }

    let notes_dir = notes_dir_path(&workspace_path);
    if !notes_dir.exists() {
        return Ok(vec![]);
    }

    let entries = std::fs::read_dir(notes_dir).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "search_workspace_blocks",
            "Failed to read notes directory",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let mut matches = Vec::<(i64, WorkspaceBlockSearchResult)>::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("nevo") {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        let note = match serde_json::from_str::<NoteDocument>(&content) {
            Ok(note) => note,
            Err(_) => continue,
        };

        matches.extend(collect_block_matches(&note, &normalized_query));
    }

    matches.sort_by(|(left_score, left), (right_score, right)| {
        right_score
            .cmp(left_score)
            .then_with(|| left.note_title.cmp(&right.note_title))
            .then_with(|| left.block_index.cmp(&right.block_index))
    });

    let results = matches
        .into_iter()
        .map(|(_, result)| result)
        .take(24)
        .collect::<Vec<_>>();
    let _ = logger.debug(
        "tauri.note",
        "search_workspace_blocks",
        "Searched workspace blocks",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "queryLength": normalized_query.len(),
            "resultCount": results.len(),
        })),
    );
    Ok(results)
}
