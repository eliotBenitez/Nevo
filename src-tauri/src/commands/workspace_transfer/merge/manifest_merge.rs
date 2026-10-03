//! Nests the imported manifest tree under a single new "Imported: <name>"
//! root folder appended to the current workspace's manifest.

use crate::commands::folder::{load_manifest, manifest_lock, save_manifest};
use crate::commands::workspace::{FolderMeta, NoteMeta, WorkspaceManifest};

use super::idmap::IdMaps;

const IMPORT_ROOT_ICON: &str = "📁";

fn remap_note_meta(note: &NoteMeta, new_folder_id: Option<String>, maps: &IdMaps) -> NoteMeta {
    NoteMeta {
        id: maps
            .notes
            .get(&note.id)
            .cloned()
            .unwrap_or_else(|| note.id.clone()),
        title: note.title.clone(),
        icon: note.icon.clone(),
        folder_id: new_folder_id,
        updated_at: note.updated_at.clone(),
        extra: note.extra.clone(),
    }
}

fn remap_folder(folder: &FolderMeta, new_parent_id: Option<String>, maps: &IdMaps) -> FolderMeta {
    let new_id = maps
        .folders
        .get(&folder.id)
        .cloned()
        .unwrap_or_else(|| folder.id.clone());
    FolderMeta {
        id: new_id.clone(),
        title: folder.title.clone(),
        icon: folder.icon.clone(),
        parent_id: new_parent_id,
        order: folder.order,
        children: folder
            .children
            .iter()
            .map(|child| remap_folder(child, Some(new_id.clone()), maps))
            .collect(),
        notes: folder
            .notes
            .iter()
            .map(|note| remap_note_meta(note, Some(new_id.clone()), maps))
            .collect(),
        extra: folder.extra.clone(),
    }
}

fn count_folders(folders: &[FolderMeta]) -> u64 {
    folders
        .iter()
        .map(|folder| 1 + count_folders(&folder.children))
        .sum()
}

/// Merges the imported tree into the current workspace's `.nevo/workspace.json`
/// under `manifest_lock`, via the same `load_manifest`/`save_manifest` pair
/// every other mutating command uses for atomicity. `trash` is deliberately
/// never imported. Returns the folder count: every imported folder, plus the
/// new wrapper folder itself.
pub(super) fn merge_manifest_tree(
    current_workspace_path: &str,
    imported: &WorkspaceManifest,
    maps: &IdMaps,
) -> Result<u64, String> {
    let lock = manifest_lock(current_workspace_path);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(current_workspace_path)?;

    let wrapper_id = uuid::Uuid::new_v4().to_string();
    let mut wrapper = FolderMeta {
        id: wrapper_id.clone(),
        title: format!("Imported: {}", imported.name),
        icon: IMPORT_ROOT_ICON.to_string(),
        parent_id: None,
        order: manifest.tree.len() as i32,
        children: Vec::new(),
        notes: Vec::new(),
        extra: Default::default(),
    };

    for folder in &imported.tree {
        wrapper
            .children
            .push(remap_folder(folder, Some(wrapper_id.clone()), maps));
    }
    for note in &imported.root_notes {
        wrapper
            .notes
            .push(remap_note_meta(note, Some(wrapper_id.clone()), maps));
    }

    let imported_folder_count = 1 + count_folders(&imported.tree);

    manifest.root_order.push(wrapper_id);
    manifest.tree.push(wrapper);
    save_manifest(current_workspace_path, &manifest)?;

    Ok(imported_folder_count)
}
