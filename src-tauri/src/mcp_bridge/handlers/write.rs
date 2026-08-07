//! Workspace mutations that Rust can perform on its own: creating, moving, and
//! trashing notes. Editing a note's content is not here — that has to go
//! through the live editor (see `handlers::editor`).

use serde::Deserialize;
use serde_json::{json, Value};

use super::{parse_params, RpcError};
use crate::commands::note::{
    create_note_impl, delete_note_impl, load_note_impl, move_note_impl, store_note_snapshot,
};
use crate::commands::path_utils::validate_id;
use crate::commands::workspace::read_workspace_settings;

const MAX_TITLE_LEN: usize = 512;

/// Stores a snapshot of the note before an agent mutates it, so the change can
/// be rolled back from the note's existing history. Failing to snapshot aborts
/// the mutation: silently editing without a restore point is worse than
/// refusing.
pub fn snapshot_before_mutation(workspace_path: &str, note_id: &str) -> Result<(), RpcError> {
    let settings_path = std::path::Path::new(workspace_path).join(".nevo/settings.json");
    let auto_snapshot = read_workspace_settings(&settings_path)
        .map(|settings| settings.mcp.auto_snapshot)
        .unwrap_or(true);
    if !auto_snapshot {
        return Ok(());
    }

    let note = load_note_impl(workspace_path.to_string(), note_id.to_string())
        .map_err(|error| RpcError::not_found(&error))?;
    store_note_snapshot(workspace_path, &note)
        .map_err(|error| RpcError::internal(format!("Could not snapshot the note: {error}")))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateParams {
    pub title: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

pub fn create_note(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: CreateParams = parse_params(params)?;
    let title = params.title.trim();
    if title.is_empty() {
        return Err(RpcError::bad_request(
            "invalid_params",
            "title must not be empty",
        ));
    }
    if title.len() > MAX_TITLE_LEN {
        return Err(RpcError::bad_request("invalid_params", "title is too long"));
    }
    if let Some(folder_id) = params.folder_id.as_deref() {
        validate_id(folder_id)
            .map_err(|error| RpcError::bad_request("invalid_folder_id", &error))?;
    }

    let note = create_note_impl(
        workspace_path.to_string(),
        params.folder_id,
        title.to_string(),
        params.icon.unwrap_or_default(),
    )
    .map_err(RpcError::internal)?;

    Ok(json!({
        "id": note.id,
        "title": note.title,
        "folderId": note.folder_id,
        "createdAt": note.created_at,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveParams {
    pub note_id: String,
    /// Omit or null to move the note to the workspace root.
    #[serde(default)]
    pub target_folder_id: Option<String>,
}

pub fn move_note(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: MoveParams = parse_params(params)?;
    validate_id(&params.note_id)
        .map_err(|error| RpcError::bad_request("invalid_note_id", &error))?;
    if let Some(folder_id) = params.target_folder_id.as_deref() {
        validate_id(folder_id)
            .map_err(|error| RpcError::bad_request("invalid_folder_id", &error))?;
    }

    move_note_impl(
        workspace_path.to_string(),
        params.note_id.clone(),
        params.target_folder_id.clone(),
    )
    .map_err(RpcError::internal)?;

    Ok(json!({ "noteId": params.note_id, "folderId": params.target_folder_id }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteParams {
    pub note_id: String,
}

/// Moves the note to the workspace trash. There is deliberately no permanent
/// delete on the bridge: an agent should never be able to destroy a note
/// beyond the user's ability to restore it.
pub fn delete_note(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: DeleteParams = parse_params(params)?;
    validate_id(&params.note_id)
        .map_err(|error| RpcError::bad_request("invalid_note_id", &error))?;

    snapshot_before_mutation(workspace_path, &params.note_id)?;
    delete_note_impl(workspace_path.to_string(), params.note_id.clone())
        .map_err(RpcError::internal)?;

    Ok(json!({ "noteId": params.note_id, "movedToTrash": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_rejects_a_blank_title() {
        let error = create_note("/tmp/whatever", json!({ "title": "   " }))
            .expect_err("blank title must be rejected");
        assert_eq!(error.code, "invalid_params");
    }

    #[test]
    fn create_rejects_an_over_long_title() {
        let error = create_note("/tmp/whatever", json!({ "title": "x".repeat(600) }))
            .expect_err("long title must be rejected");
        assert_eq!(error.code, "invalid_params");
    }

    #[test]
    fn create_rejects_a_traversal_folder_id() {
        let error = create_note(
            "/tmp/whatever",
            json!({ "title": "Note", "folderId": "../escape" }),
        )
        .expect_err("traversal folder id must be rejected");
        assert_eq!(error.code, "invalid_folder_id");
    }

    #[test]
    fn move_and_delete_reject_a_traversal_note_id() {
        let moved = move_note("/tmp/whatever", json!({ "noteId": "../../etc/passwd" }))
            .expect_err("traversal note id must be rejected");
        assert_eq!(moved.code, "invalid_note_id");

        let deleted = delete_note("/tmp/whatever", json!({ "noteId": "../../etc/passwd" }))
            .expect_err("traversal note id must be rejected");
        assert_eq!(deleted.code, "invalid_note_id");
    }
}
