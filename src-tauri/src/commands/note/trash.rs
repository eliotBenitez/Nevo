use chrono::Utc;

use super::snapshots::snapshot_dir_path;
use super::{insert_note_in_folder, note_context, note_path};
use crate::commands::folder::{load_manifest, save_manifest};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::NoteMeta;

#[tauri::command]
pub fn restore_from_trash(workspace_path: String, item_id: String) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let mut manifest = load_manifest(&workspace_path)?;

    if let Some(pos) = manifest.trash.iter().position(|i| i.id == item_id) {
        let item = manifest.trash.remove(pos);
        let meta = NoteMeta {
            id: item.id.clone(),
            title: item.title,
            icon: "📄".to_string(), // Default icon on restore
            folder_id: item.original_parent_id.clone(),
            updated_at: Utc::now().to_rfc3339(),
        };

        if let Some(parent_id) = &meta.folder_id {
            if !insert_note_in_folder(&mut manifest.tree, parent_id, meta.clone()) {
                // If folder no longer exists, restore to root
                manifest.root_notes.push(meta);
                manifest.root_order.push(item_id.clone());
            }
        } else {
            manifest.root_notes.push(meta);
            manifest.root_order.push(item_id.clone());
        }

        save_manifest(&workspace_path, &manifest)?;
        let _ = logger.info(
            "tauri.note",
            "restore_from_trash",
            "Restored item from trash",
            true,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "itemId": item_id,
            })),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn permanently_delete_from_trash(
    workspace_path: String,
    item_id: String,
) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let mut manifest = load_manifest(&workspace_path)?;

    if let Some(pos) = manifest.trash.iter().position(|i| i.id == item_id) {
        let item = manifest.trash.remove(pos);
        if item.item_type == "note" {
            let path = note_path(&workspace_path, &item.id);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
            // Also remove snapshots
            let snap_dir = snapshot_dir_path(&workspace_path, &item.id);
            if snap_dir.exists() {
                let _ = std::fs::remove_dir_all(snap_dir);
            }
        }

        save_manifest(&workspace_path, &manifest)?;
        let _ = logger.info(
            "tauri.note",
            "permanently_delete_from_trash",
            "Permanently deleted item from trash",
            true,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "itemId": item_id,
            })),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn empty_trash(workspace_path: String) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let mut manifest = load_manifest(&workspace_path)?;

    for item in &manifest.trash {
        if item.item_type == "note" {
            let path = note_path(&workspace_path, &item.id);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
            let snap_dir = snapshot_dir_path(&workspace_path, &item.id);
            if snap_dir.exists() {
                let _ = std::fs::remove_dir_all(snap_dir);
            }
        }
    }

    manifest.trash.clear();
    save_manifest(&workspace_path, &manifest)?;

    let _ = logger.info(
        "tauri.note",
        "empty_trash",
        "Emptied trash",
        true,
        note_context(&workspace_path),
    );

    Ok(())
}
