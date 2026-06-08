use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

use super::path_utils::normalize_workspace_path;
use super::workspace::{FolderMeta, NoteMeta, WorkspaceManifest};

pub fn load_manifest(workspace_path: &str) -> Result<WorkspaceManifest, String> {
    let path = Path::new(workspace_path).join(".nevo/workspace.json");
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn save_manifest(workspace_path: &str, manifest: &WorkspaceManifest) -> Result<(), String> {
    let path = Path::new(workspace_path).join(".nevo/workspace.json");
    let content = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

fn insert_folder(
    tree: &mut Vec<FolderMeta>,
    parent_id: &Option<String>,
    folder: FolderMeta,
) -> bool {
    let pid = match parent_id {
        None => {
            tree.push(folder);
            return true;
        }
        Some(p) => p.clone(),
    };
    for node in tree.iter_mut() {
        if node.id == pid {
            node.children.push(folder);
            return true;
        }
        if insert_folder(&mut node.children, parent_id, folder.clone()) {
            return true;
        }
    }
    false
}

fn rename_in_tree(tree: &mut Vec<FolderMeta>, folder_id: &str, title: &str) -> bool {
    for node in tree.iter_mut() {
        if node.id == folder_id {
            node.title = title.to_string();
            return true;
        }
        if rename_in_tree(&mut node.children, folder_id, title) {
            return true;
        }
    }
    false
}

fn remove_from_tree(tree: &mut Vec<FolderMeta>, folder_id: &str) -> Option<FolderMeta> {
    if let Some(pos) = tree.iter().position(|f| f.id == folder_id) {
        return Some(tree.remove(pos));
    }
    for node in tree.iter_mut() {
        if let Some(removed) = remove_from_tree(&mut node.children, folder_id) {
            return Some(removed);
        }
    }
    None
}

#[tauri::command]
pub fn create_folder(
    workspace_path: String,
    parent_id: Option<String>,
    title: String,
    icon: String,
) -> Result<FolderMeta, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let mut manifest = load_manifest(&workspace_path)?;
    let order = manifest.tree.len() as i32;
    let folder = FolderMeta {
        id: Uuid::new_v4().to_string(),
        title,
        icon,
        parent_id: parent_id.clone(),
        order,
        children: vec![],
        notes: vec![],
    };
    let folder_id = folder.id.clone();
    insert_folder(&mut manifest.tree, &parent_id, folder.clone());
    if parent_id.is_none() {
        manifest.root_order.push(folder_id);
    }
    save_manifest(&workspace_path, &manifest)?;
    Ok(folder)
}

#[tauri::command]
pub fn rename_folder(
    workspace_path: String,
    folder_id: String,
    title: String,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let mut manifest = load_manifest(&workspace_path)?;
    rename_in_tree(&mut manifest.tree, &folder_id, &title);
    save_manifest(&workspace_path, &manifest)
}

#[tauri::command]
pub fn delete_folder(
    workspace_path: String,
    folder_id: String,
    recursive: bool,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let mut manifest = load_manifest(&workspace_path)?;

    if let Some(removed) = remove_from_tree(&mut manifest.tree, &folder_id) {
        if recursive {
            // "Notes to Root" behavior: Move all nested notes to trash, but they will be restored to root
            let notes_to_trash = collect_notes_meta(&removed);
            for meta in notes_to_trash {
                manifest.trash.push(super::workspace::TrashedItem {
                    id: meta.id.clone(),
                    item_type: "note".to_string(),
                    title: meta.title.clone(),
                    deleted_at: Utc::now().to_rfc3339(),
                    original_parent_id: None, // Since folder is deleted, restore to root
                });
            }
        }
        manifest.root_order.retain(|id| id != &folder_id);
    }
    save_manifest(&workspace_path, &manifest)
}

fn collect_notes_meta(folder: &FolderMeta) -> Vec<NoteMeta> {
    let mut notes = folder.notes.clone();
    for child in &folder.children {
        notes.extend(collect_notes_meta(child));
    }
    notes
}
