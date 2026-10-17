//! Trash handlers. Agents can list and restore trashed notes; permanent
//! deletion and emptying the trash are deliberately not exposed.

use serde::Deserialize;
use serde_json::{json, Value};

use super::{parse_params, RpcError};
use crate::commands::folder::load_manifest;
use crate::commands::note::restore_from_trash;
use crate::commands::path_utils::validate_id;

pub fn list_trash(workspace_path: &str) -> Result<Value, RpcError> {
    let manifest = load_manifest(workspace_path).map_err(RpcError::internal)?;
    let items: Vec<Value> = manifest
        .trash
        .iter()
        .map(|item| {
            json!({
                "id": item.id,
                "type": item.item_type,
                "title": item.title,
                "deletedAt": item.deleted_at,
                "originalParentId": item.original_parent_id,
            })
        })
        .collect();
    Ok(json!({ "items": items, "total": items.len() }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreParams {
    pub item_id: String,
}

/// Restores a trashed note to its original folder, or to the root when that
/// folder is gone.
pub fn restore(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: RestoreParams = parse_params(params)?;
    validate_id(&params.item_id)
        .map_err(|error| RpcError::bad_request("invalid_item_id", &error))?;

    // `restore_from_trash` treats an unknown id as a no-op success; an agent
    // needs to hear that nothing happened.
    let manifest = load_manifest(workspace_path).map_err(RpcError::internal)?;
    let Some(item) = manifest.trash.iter().find(|item| item.id == params.item_id) else {
        return Err(RpcError::not_found(&format!(
            "Item {} is not in the trash",
            params.item_id
        )));
    };
    if item.item_type != "note" {
        return Err(RpcError::bad_request(
            "unsupported_item",
            "Only trashed notes can be restored through the bridge.",
        ));
    }

    restore_from_trash(workspace_path.to_string(), params.item_id.clone())
        .map_err(RpcError::internal)?;
    Ok(json!({ "itemId": params.item_id, "restored": true }))
}
