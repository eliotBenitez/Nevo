//! Content edits, which have to run in the webview.
//!
//! On a local workspace an open note's content lives in the disk-backed Y.Doc,
//! and `note.content` is a serialized copy that the editor overwrites. Writing
//! the file from Rust would therefore be ignored and then clobbered, so every
//! content edit is dispatched as a ProseMirror transaction on the live view.

use serde::Deserialize;
use serde_json::{json, Value};

use super::{parse_params, RpcError};
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

pub async fn apply_edit(app: &tauri::AppHandle, params: Value) -> Result<Value, RpcError> {
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
}
