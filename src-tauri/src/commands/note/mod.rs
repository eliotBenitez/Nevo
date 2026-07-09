use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

use crate::commands::workspace::{FolderMeta, NoteMeta};
use crate::logging::{LogContext, LogError};

mod assets;
mod collab;
mod crud;
mod export;
mod search;
mod sidebar;
mod snapshots;
mod trash;

#[cfg(test)]
mod tests;

// Glob re-exports so each command's `#[tauri::command]`-generated helper items
// (e.g. `__cmd__create_note`) are re-exported alongside the function — Tauri's
// `generate_handler!` in lib.rs resolves them as siblings of `note::<command>`.
pub use assets::*;
pub use collab::*;
pub use crud::*;
pub use export::*;
pub use search::*;
pub use sidebar::*;
pub use snapshots::*;
pub use trash::*;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteDocument {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub cover: Option<String>,
    #[serde(rename = "folderId")]
    pub folder_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub properties: Option<NoteProperties>,
    pub content: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteProperties {
    #[serde(rename = "type")]
    pub note_type: Option<NoteType>,
    pub tags: Vec<String>,
    pub date: Option<String>,
    pub status: Option<NoteStatus>,
}

impl NoteProperties {
    pub fn empty() -> Self {
        Self {
            note_type: None,
            tags: Vec::new(),
            date: None,
            status: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum NoteType {
    Note,
    Task,
    Idea,
    Meeting,
    Project,
    Research,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum NoteStatus {
    None,
    Draft,
    Active,
    Waiting,
    Done,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteSnapshotMeta {
    pub id: String,
    #[serde(rename = "noteId")]
    pub note_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportedImageAsset {
    pub src: String,
    pub hash: String,
    pub deduplicated: bool,
    pub bytes: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBlockSearchResult {
    pub id: String,
    pub note_id: String,
    pub note_title: String,
    pub folder_id: Option<String>,
    pub block_index: usize,
    pub snippet: String,
    pub block_text: String,
}

fn empty_doc() -> Value {
    serde_json::json!({ "type": "doc", "content": [] })
}

fn note_path(workspace_path: &str, note_id: &str) -> Result<std::path::PathBuf, String> {
    crate::commands::path_utils::validate_id(note_id)?;
    Ok(Path::new(workspace_path)
        .join("notes")
        .join(format!("note-{}.nevo", note_id)))
}

fn assets_dir_path(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path).join(".nevo").join("assets")
}

fn notes_dir_path(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path).join("notes")
}

fn note_context(workspace_path: &str) -> LogContext {
    LogContext::workspace(workspace_path.to_string())
}

fn note_error_context(workspace_path: &str, kind: &str, message: String) -> LogContext {
    note_context(workspace_path).with_error(LogError {
        kind: Some(kind.to_string()),
        message,
        details: None,
    })
}

fn insert_note_in_folder(tree: &mut Vec<FolderMeta>, folder_id: &str, note: NoteMeta) -> bool {
    for node in tree.iter_mut() {
        if node.id == folder_id {
            node.notes.push(note);
            return true;
        }
        if insert_note_in_folder(&mut node.children, folder_id, note.clone()) {
            return true;
        }
    }
    false
}

fn extract_note_from_tree(tree: &mut Vec<FolderMeta>, note_id: &str) -> Option<NoteMeta> {
    for node in tree.iter_mut() {
        if let Some(pos) = node.notes.iter().position(|n| n.id == note_id) {
            return Some(node.notes.remove(pos));
        }
        if let Some(meta) = extract_note_from_tree(&mut node.children, note_id) {
            return Some(meta);
        }
    }
    None
}

fn update_note_meta_in_tree(
    tree: &mut Vec<FolderMeta>,
    note_id: &str,
    title: &str,
    icon: &str,
    updated_at: &str,
) {
    for node in tree.iter_mut() {
        for note in node.notes.iter_mut() {
            if note.id == note_id {
                note.title = title.to_string();
                note.icon = icon.to_string();
                note.updated_at = updated_at.to_string();
                return;
            }
        }
        update_note_meta_in_tree(&mut node.children, note_id, title, icon, updated_at);
    }
}
