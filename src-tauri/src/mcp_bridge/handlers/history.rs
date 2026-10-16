//! Note history: listing and reading snapshots run in Rust; restoring goes
//! through the webview, because an open note must be flushed, restored, and
//! reloaded into the editor rather than overwritten behind its back (see
//! `noteStore.restoreSnapshot`).

use serde::Deserialize;
use serde_json::{json, Value};

use super::{parse_params, RpcError};
use crate::commands::note::{list_note_snapshots_impl, load_note_snapshot_impl};
use crate::commands::path_utils::validate_id;
use crate::mcp_bridge::webview;

const DEFAULT_LIMIT: usize = 20;
const MAX_LIMIT: usize = 200;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListParams {
    pub note_id: String,
    #[serde(default)]
    pub limit: Option<usize>,
}

pub fn list_snapshots(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: ListParams = parse_params(params)?;
    validate_id(&params.note_id)
        .map_err(|error| RpcError::bad_request("invalid_note_id", &error))?;
    let mut snapshots = list_note_snapshots_impl(workspace_path.to_string(), params.note_id)
        .map_err(RpcError::internal)?;
    // RFC 3339 timestamps in one offset sort lexically; newest first.
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let total = snapshots.len();
    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    snapshots.truncate(limit);
    let snapshots: Vec<Value> = snapshots
        .into_iter()
        .map(|snapshot| json!({ "id": snapshot.id, "createdAt": snapshot.created_at }))
        .collect();
    Ok(json!({ "snapshots": snapshots, "total": total, "truncated": total > limit }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotParams {
    pub note_id: String,
    pub snapshot_id: String,
}

fn validate(params: &SnapshotParams) -> Result<(), RpcError> {
    validate_id(&params.note_id)
        .map_err(|error| RpcError::bad_request("invalid_note_id", &error))?;
    validate_id(&params.snapshot_id)
        .map_err(|error| RpcError::bad_request("invalid_snapshot_id", &error))
}

pub fn read_snapshot(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: SnapshotParams = parse_params(params)?;
    validate(&params)?;
    let note = load_note_snapshot_impl(
        workspace_path.to_string(),
        params.note_id,
        params.snapshot_id.clone(),
    )
    .map_err(|error| RpcError::not_found(&error))?;
    Ok(json!({
        "snapshotId": params.snapshot_id,
        "noteId": note.id,
        "title": note.title,
        "icon": note.icon,
        "updatedAt": note.updated_at,
        "content": note.content,
    }))
}

/// Restores a snapshot. The restore itself first stores a recovery snapshot of
/// the current state, so it is always reversible.
pub async fn restore_snapshot(app: &tauri::AppHandle, params: Value) -> Result<Value, RpcError> {
    let params: SnapshotParams = parse_params(params)?;
    validate(&params)?;
    webview::request(
        app,
        "history.restore",
        json!({ "noteId": params.note_id, "snapshotId": params.snapshot_id }),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_ids_are_validated_before_any_path_is_built() {
        let params = |note: &str, snapshot: &str| SnapshotParams {
            note_id: note.to_string(),
            snapshot_id: snapshot.to_string(),
        };
        assert!(validate(&params("note-1", "20260101-abc")).is_ok());
        assert_eq!(
            validate(&params("../x", "s1")).unwrap_err().code,
            "invalid_note_id"
        );
        assert_eq!(
            validate(&params("note-1", "../../etc")).unwrap_err().code,
            "invalid_snapshot_id"
        );
    }
}
