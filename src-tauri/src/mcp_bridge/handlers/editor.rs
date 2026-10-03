//! Content edits, which have to run in the webview.
//!
//! While a note is open, the live `EditorView`'s in-memory ProseMirror state
//! is ahead of `note.json` until the next autosave flush. Writing the file
//! from Rust would therefore be invisible to the open editor and then
//! clobbered by its next autosave, so every content edit is dispatched as a
//! ProseMirror transaction on the live view instead.

use serde::Deserialize;
use serde_json::{json, Value};

use super::{parse_params, RpcError};
use crate::commands::note::notebook::{validate_note_for_write, DocumentFormat};
use crate::commands::note::{load_note_impl, NoteDocument};
use crate::commands::path_utils::validate_id;
use crate::mcp_bridge::webview;

/// Bounds what one call can carry; mirrors the plugin sandbox's own limit so an
/// agent cannot push a larger transaction than a plugin could.
const MAX_OPERATIONS: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotParams {
    /// Optional guard: fail unless this note is the one currently open.
    #[serde(default)]
    pub note_id: Option<String>,
}

/// Returns the open note's id, current revision, and document JSON. An agent
/// calls this before `notes.applyEdit` to learn the revision to quote.
pub async fn editor_snapshot(app: &tauri::AppHandle, params: Value) -> Result<Value, RpcError> {
    let params: SnapshotParams = parse_params(params)?;
    if let Some(note_id) = params.note_id.as_deref() {
        validate_id(note_id).map_err(|error| RpcError::bad_request("invalid_note_id", &error))?;
    }
    webview::request(app, "editor.snapshot", json!({ "noteId": params.note_id })).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyEditParams {
    pub note_id: String,
    /// Revision from `notes.editorSnapshot`. Operations carrying absolute
    /// positions are refused when it no longer matches.
    pub revision: u32,
    pub operations: Vec<Value>,
}

pub async fn apply_edit(
    app: &tauri::AppHandle,
    workspace_path: &str,
    params: Value,
) -> Result<Value, RpcError> {
    let params: ApplyEditParams = parse_params(params)?;
    validate_id(&params.note_id)
        .map_err(|error| RpcError::bad_request("invalid_note_id", &error))?;

    if params.operations.is_empty() {
        return Err(RpcError::bad_request(
            "invalid_params",
            "operations must not be empty",
        ));
    }
    if params.operations.len() > MAX_OPERATIONS {
        return Err(RpcError::bad_request(
            "invalid_params",
            &format!("at most {MAX_OPERATIONS} operations are allowed per call"),
        ));
    }

    let workspace_path = workspace_path.to_string();
    let note_id = params.note_id.clone();
    let note =
        tauri::async_runtime::spawn_blocking(move || load_note_impl(workspace_path, note_id))
            .await
            .map_err(|error| RpcError::internal(error.to_string()))?
            .map_err(|error| RpcError::not_found(&error))?;
    require_document_editor(&note)?;

    webview::request(
        app,
        "editor.applyEdit",
        json!({
            "noteId": params.note_id,
            "revision": params.revision,
            "operations": params.operations,
        }),
    )
    .await
}

fn require_document_editor(note: &NoteDocument) -> Result<(), RpcError> {
    if validate_note_for_write(note) == Ok(DocumentFormat::Document) {
        Ok(())
    } else {
        Err(RpcError::bad_request(
            "unsupported_editor",
            "ProseMirror edits are not supported for this document format.",
        ))
    }
}

/// Asks the user to approve a pending write. Only used in `ask` mode.
pub async fn confirm(
    app: &tauri::AppHandle,
    method: &str,
    params: &Value,
) -> Result<bool, RpcError> {
    let answer = webview::request(
        app,
        "confirm",
        json!({ "method": method, "params": params }),
    )
    .await?;
    Ok(answer
        .get("approved")
        .and_then(Value::as_bool)
        .unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(value: Value) -> Result<ApplyEditParams, RpcError> {
        parse_params(value)
    }

    #[test]
    fn apply_edit_params_require_note_revision_and_operations() {
        assert!(params(json!({ "noteId": "n1", "revision": 3, "operations": [] })).is_ok());
        assert!(params(json!({ "noteId": "n1", "revision": 3 })).is_err());
        assert!(params(json!({ "noteId": "n1", "operations": [] })).is_err());
    }

    #[test]
    fn snapshot_params_allow_an_absent_note_id() {
        let parsed: SnapshotParams = parse_params(json!({})).expect("parse");
        assert!(parsed.note_id.is_none());
    }

    #[test]
    fn notebook_and_unknown_formats_reject_prosemirror_mutation() {
        let mut note = NoteDocument {
            id: "n1".to_string(),
            title: "Notebook".to_string(),
            icon: "N".to_string(),
            cover: None,
            folder_id: None,
            created_at: "today".to_string(),
            updated_at: "today".to_string(),
            properties: None,
            content: serde_json::json!({ "type": "doc", "content": [] }),
            canvas: None,
            extra: serde_json::Map::new(),
        };
        note.extra
            .insert("documentKind".to_string(), serde_json::json!("notebook"));
        note.extra.insert(
            "notebook".to_string(),
            serde_json::json!({
                "version": 1,
                "pages": [{
                    "id": "p1", "width": 595.28, "height": 841.89,
                    "paper": { "kind": "plain" }, "objects": []
                }]
            }),
        );
        assert_eq!(
            require_document_editor(&note).unwrap_err().code,
            "unsupported_editor"
        );

        note.extra
            .insert("documentKind".to_string(), serde_json::json!("future"));
        assert_eq!(
            require_document_editor(&note).unwrap_err().code,
            "unsupported_editor"
        );
    }
}
