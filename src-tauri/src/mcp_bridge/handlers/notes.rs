//! Read-only workspace handlers.
//!
//! Every handler delegates to the same functions the Tauri commands use, so
//! the bridge never re-implements manifest, index, or note-file semantics.

use serde::Deserialize;
use serde_json::{json, Value};

use super::{parse_params, RpcError};
use crate::commands::folder::load_manifest;
use crate::commands::note::{load_note_impl, search_workspace_blocks_sync};
use crate::commands::path_utils::validate_id;
use crate::commands::workspace::{FolderMeta, NoteMeta};

/// Caps every list-shaped response. An agent that asks for "all notes" in a
/// large vault would otherwise blow through its own context window.
const DEFAULT_LIMIT: usize = 100;
const MAX_LIMIT: usize = 500;

fn clamp_limit(requested: Option<usize>) -> usize {
    requested.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

pub fn workspace_info(workspace_path: &str) -> Result<Value, RpcError> {
    let manifest = load_manifest(workspace_path).map_err(RpcError::internal)?;
    let mut notes = Vec::new();
    collect_notes(&manifest.tree, "", &mut notes);

    Ok(json!({
        "workspacePath": workspace_path,
        "name": manifest.name,
        "noteCount": notes.len() + manifest.root_notes.len(),
        "folderCount": count_folders(&manifest.tree),
        "trashCount": manifest.trash.len(),
    }))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ListParams {
    pub folder_id: Option<String>,
    pub limit: Option<usize>,
}

pub fn list_notes(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: ListParams = parse_params(params)?;
    let manifest = load_manifest(workspace_path).map_err(RpcError::internal)?;

    let mut notes: Vec<Value> = manifest
        .root_notes
        .iter()
        .map(|note| note_entry(note, ""))
        .collect();
    let mut nested = Vec::new();
    collect_notes(&manifest.tree, "", &mut nested);
    notes.extend(nested);

    if let Some(folder_id) = params.folder_id.as_deref() {
        validate_id(folder_id)
            .map_err(|error| RpcError::bad_request("invalid_folder_id", &error))?;
        notes.retain(|note| note.get("folderId").and_then(Value::as_str) == Some(folder_id));
    }

    let total = notes.len();
    let limit = clamp_limit(params.limit);
    notes.truncate(limit);

    Ok(json!({ "notes": notes, "total": total, "truncated": total > limit }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: String,
    #[serde(default)]
    pub limit: Option<usize>,
}

pub fn search_notes(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: SearchParams = parse_params(params)?;
    if params.query.trim().is_empty() {
        return Err(RpcError::bad_request(
            "invalid_params",
            "query must not be empty",
        ));
    }

    let results = search_workspace_blocks_sync(workspace_path.to_string(), params.query)
        .map_err(RpcError::internal)?;

    let total = results.len();
    let limit = clamp_limit(params.limit);
    let matches: Vec<Value> = results
        .into_iter()
        .take(limit)
        .map(|result| {
            json!({
                "noteId": result.note_id,
                "noteTitle": result.note_title,
                "folderId": result.folder_id,
                "blockIndex": result.block_index,
                "snippet": result.snippet,
            })
        })
        .collect();

    Ok(json!({ "matches": matches, "total": total, "truncated": total > limit }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadParams {
    pub note_id: String,
}

pub fn read_note(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: ReadParams = parse_params(params)?;
    validate_id(&params.note_id)
        .map_err(|error| RpcError::bad_request("invalid_note_id", &error))?;

    let note = load_note_impl(workspace_path.to_string(), params.note_id.clone())
        .map_err(|error| RpcError::not_found(&error))?;
    let document_kind = note
        .extra
        .get("documentKind")
        .cloned()
        .unwrap_or_else(|| json!("document"));

    // `content` is `note.json`'s serialized copy, which is a note's source of
    // truth. While a note is open in the editor, in-memory keystrokes are
    // debounced before they reach this file, so agents that need byte-exact
    // current-editor state should read through the editor bridge instead.
    Ok(json!({
        "id": note.id,
        "title": note.title,
        "icon": note.icon,
        "folderId": note.folder_id,
        "updatedAt": note.updated_at,
        "content": note.content,
        "format": document_kind,
        "notebook": note.extra.get("notebook"),
        "contentSource": "persisted",
    }))
}

fn note_entry(note: &NoteMeta, folder_path: &str) -> Value {
    json!({
        "id": note.id,
        "title": note.title,
        "icon": note.icon,
        "folderId": note.folder_id,
        "folderPath": folder_path,
        "updatedAt": note.updated_at,
    })
}

fn collect_notes(folders: &[FolderMeta], prefix: &str, out: &mut Vec<Value>) {
    for folder in folders {
        let path = if prefix.is_empty() {
            folder.title.clone()
        } else {
            format!("{prefix}/{}", folder.title)
        };
        out.extend(folder.notes.iter().map(|note| note_entry(note, &path)));
        collect_notes(&folder.children, &path, out);
    }
}

fn count_folders(folders: &[FolderMeta]) -> usize {
    folders
        .iter()
        .map(|folder| 1 + count_folders(&folder.children))
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limit_is_clamped_to_a_sane_range() {
        assert_eq!(clamp_limit(None), DEFAULT_LIMIT);
        assert_eq!(clamp_limit(Some(0)), 1);
        assert_eq!(clamp_limit(Some(10)), 10);
        assert_eq!(clamp_limit(Some(100_000)), MAX_LIMIT);
    }

    fn folder(title: &str, notes: Vec<NoteMeta>, children: Vec<FolderMeta>) -> FolderMeta {
        FolderMeta {
            id: format!("folder-{title}"),
            title: title.to_string(),
            icon: String::new(),
            parent_id: None,
            order: 0,
            children,
            notes,
            extra: Default::default(),
        }
    }

    fn note(id: &str) -> NoteMeta {
        NoteMeta {
            id: id.to_string(),
            title: format!("Note {id}"),
            icon: String::new(),
            folder_id: None,
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            extra: Default::default(),
        }
    }

    #[test]
    fn collect_notes_builds_nested_folder_paths() {
        let tree = vec![folder(
            "Projects",
            vec![note("a")],
            vec![folder("Nevo", vec![note("b")], vec![])],
        )];

        let mut out = Vec::new();
        collect_notes(&tree, "", &mut out);

        let paths: Vec<&str> = out
            .iter()
            .map(|entry| {
                entry
                    .get("folderPath")
                    .and_then(Value::as_str)
                    .unwrap_or("")
            })
            .collect();
        assert_eq!(paths, vec!["Projects", "Projects/Nevo"]);
    }

    #[test]
    fn count_folders_includes_descendants() {
        let tree = vec![folder(
            "Projects",
            vec![],
            vec![folder("Nevo", vec![], vec![folder("Deep", vec![], vec![])])],
        )];
        assert_eq!(count_folders(&tree), 3);
    }

    #[test]
    fn read_note_rejects_a_traversal_style_id() {
        let error = read_note(
            "/tmp/does-not-matter",
            json!({ "noteId": "../../etc/passwd" }),
        )
        .expect_err("traversal id must be rejected");
        assert_eq!(error.code, "invalid_note_id");
    }

    #[test]
    fn search_rejects_an_empty_query() {
        let error = search_notes("/tmp/does-not-matter", json!({ "query": "   " }))
            .expect_err("empty query must be rejected");
        assert_eq!(error.code, "invalid_params");
    }
}
