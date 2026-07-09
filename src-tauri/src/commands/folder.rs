use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

use super::path_utils::{normalize_workspace_path, write_atomic};
use super::workspace::{FolderMeta, NoteMeta, WorkspaceManifest};

pub fn load_manifest(workspace_path: &str) -> Result<WorkspaceManifest, String> {
    let path = Path::new(workspace_path).join(".nevo/workspace.json");
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn save_manifest(workspace_path: &str, manifest: &WorkspaceManifest) -> Result<(), String> {
    let path = Path::new(workspace_path).join(".nevo/workspace.json");
    let content = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    write_atomic(&path, content.as_bytes()).map_err(|e| e.to_string())
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

/// Finds a folder in the tree without removing it, so callers can inspect it
/// (e.g. check emptiness) before deciding whether a removal is safe.
fn find_in_tree<'a>(tree: &'a [FolderMeta], folder_id: &str) -> Option<&'a FolderMeta> {
    for node in tree {
        if node.id == folder_id {
            return Some(node);
        }
        if let Some(found) = find_in_tree(&node.children, folder_id) {
            return Some(found);
        }
    }
    None
}

/// A folder is empty only if it has no notes of its own and no child folders
/// at all (an empty child folder still counts as non-empty content here,
/// since deleting it non-recursively would silently orphan that child folder's
/// own manifest entry).
fn folder_is_empty(folder: &FolderMeta) -> bool {
    folder.notes.is_empty() && folder.children.is_empty()
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

    if !recursive {
        if let Some(folder) = find_in_tree(&manifest.tree, &folder_id) {
            if !folder_is_empty(folder) {
                return Err(
                    "Folder is not empty; pass recursive=true to move its contents to trash"
                        .to_string(),
                );
            }
        }
    }

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
                    icon: Some(meta.icon.clone()),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::note::create_note_impl;
    use crate::commands::workspace::create_workspace;
    use uuid::Uuid;

    struct TestWorkspace {
        path: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-folder-{}", Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Folder".to_string(),
                "N".to_string(),
                "violet".to_string(),
            )
            .expect("create workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }

        fn note_file_path(&self, note_id: &str) -> std::path::PathBuf {
            self.path
                .join("notes")
                .join(format!("note-{}.nevo", note_id))
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn delete_folder_non_recursive_rejects_non_empty_folder() {
        let ws = TestWorkspace::new();
        let workspace_path = ws.path_string();

        let folder = create_folder(
            workspace_path.clone(),
            None,
            "Parent".to_string(),
            "📁".to_string(),
        )
        .expect("create folder");
        let note = create_note_impl(
            workspace_path.clone(),
            Some(folder.id.clone()),
            "Nested note".to_string(),
            "📄".to_string(),
        )
        .expect("create note");

        let manifest_before = load_manifest(&workspace_path).expect("load manifest");

        let result = delete_folder(workspace_path.clone(), folder.id.clone(), false);
        assert!(
            result.is_err(),
            "non-recursive delete of a non-empty folder must fail"
        );

        let manifest_after = load_manifest(&workspace_path).expect("load manifest");
        assert_eq!(
            manifest_after.tree.len(),
            manifest_before.tree.len(),
            "manifest tree must be unchanged after a rejected delete"
        );
        assert!(
            find_in_tree(&manifest_after.tree, &folder.id).is_some(),
            "folder must still be present in the manifest"
        );
        assert!(
            ws.note_file_path(&note.id).exists(),
            "nested note file must not be deleted from disk"
        );
    }

    #[test]
    fn delete_folder_non_recursive_removes_empty_folder() {
        let ws = TestWorkspace::new();
        let workspace_path = ws.path_string();

        let folder = create_folder(
            workspace_path.clone(),
            None,
            "Empty".to_string(),
            "📁".to_string(),
        )
        .expect("create folder");

        let result = delete_folder(workspace_path.clone(), folder.id.clone(), false);
        assert!(
            result.is_ok(),
            "non-recursive delete of an empty folder must succeed"
        );

        let manifest_after = load_manifest(&workspace_path).expect("load manifest");
        assert!(find_in_tree(&manifest_after.tree, &folder.id).is_none());
    }
}
