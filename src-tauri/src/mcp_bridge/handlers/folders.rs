//! Folder handlers. Folders live only in the workspace manifest, so these run
//! entirely in Rust through the same functions the sidebar commands use.

use serde::Deserialize;
use serde_json::{json, Value};

use super::{parse_params, RpcError};
use crate::commands::folder::{create_folder_sync, load_manifest, rename_folder_sync};
use crate::commands::path_utils::validate_id;
use crate::commands::workspace::FolderMeta;

const MAX_TITLE_LEN: usize = 512;

pub fn list_folders(workspace_path: &str) -> Result<Value, RpcError> {
    let manifest = load_manifest(workspace_path).map_err(RpcError::internal)?;
    let mut folders = Vec::new();
    collect_folders(&manifest.tree, "", &mut folders);
    Ok(json!({ "folders": folders, "total": folders.len() }))
}

fn collect_folders(tree: &[FolderMeta], prefix: &str, out: &mut Vec<Value>) {
    for folder in tree {
        let path = if prefix.is_empty() {
            folder.title.clone()
        } else {
            format!("{prefix}/{}", folder.title)
        };
        out.push(json!({
            "id": folder.id,
            "title": folder.title,
            "parentId": folder.parent_id,
            "path": path,
            "noteCount": folder.notes.len(),
        }));
        collect_folders(&folder.children, &path, out);
    }
}

fn folder_exists(tree: &[FolderMeta], folder_id: &str) -> bool {
    tree.iter()
        .any(|folder| folder.id == folder_id || folder_exists(&folder.children, folder_id))
}

fn require_folder(workspace_path: &str, folder_id: &str) -> Result<(), RpcError> {
    validate_id(folder_id).map_err(|error| RpcError::bad_request("invalid_folder_id", &error))?;
    let manifest = load_manifest(workspace_path).map_err(RpcError::internal)?;
    if folder_exists(&manifest.tree, folder_id) {
        Ok(())
    } else {
        Err(RpcError::not_found(&format!(
            "Folder {folder_id} not found"
        )))
    }
}

pub(super) fn valid_title(title: &str) -> Result<&str, RpcError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(RpcError::bad_request(
            "invalid_params",
            "title must not be empty",
        ));
    }
    if title.len() > MAX_TITLE_LEN {
        return Err(RpcError::bad_request("invalid_params", "title is too long"));
    }
    Ok(title)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateParams {
    pub title: String,
    /// Omit for a top-level folder.
    #[serde(default)]
    pub parent_id: Option<String>,
}

pub fn create_folder(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: CreateParams = parse_params(params)?;
    let title = valid_title(&params.title)?;
    if let Some(parent_id) = params.parent_id.as_deref() {
        require_folder(workspace_path, parent_id)?;
    }
    let folder = create_folder_sync(
        workspace_path.to_string(),
        params.parent_id,
        title.to_string(),
        String::new(),
    )
    .map_err(RpcError::internal)?;
    Ok(json!({ "id": folder.id, "title": folder.title, "parentId": folder.parent_id }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameParams {
    pub folder_id: String,
    pub title: String,
}

pub fn rename_folder(workspace_path: &str, params: Value) -> Result<Value, RpcError> {
    let params: RenameParams = parse_params(params)?;
    let title = valid_title(&params.title)?;
    require_folder(workspace_path, &params.folder_id)?;
    rename_folder_sync(
        workspace_path.to_string(),
        params.folder_id.clone(),
        title.to_string(),
    )
    .map_err(RpcError::internal)?;
    Ok(json!({ "folderId": params.folder_id, "title": title }))
}
