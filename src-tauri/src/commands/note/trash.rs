use chrono::Utc;

use super::snapshots::snapshot_dir_path;
use super::{insert_note_in_folder, note_context, note_path, NoteDocument};
use crate::commands::folder::{load_manifest, manifest_lock, save_manifest};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::NoteMeta;

#[tauri::command]
pub fn restore_from_trash(workspace_path: String, item_id: String) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let manifest_lock = manifest_lock(&workspace_path);
    let _manifest_guard = manifest_lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path)?;

    if let Some(pos) = manifest.trash.iter().position(|i| i.id == item_id) {
        let item = manifest.trash.remove(pos);
        let mut meta = NoteMeta {
            id: item.id.clone(),
            title: item.title,
            icon: item.icon.unwrap_or_else(|| "📄".to_string()),
            folder_id: item.original_parent_id.clone(),
            updated_at: Utc::now().to_rfc3339(),
        };

        if let Some(parent_id) = &meta.folder_id {
            if !insert_note_in_folder(&mut manifest.tree, parent_id, meta.clone()) {
                // If folder no longer exists, restore to root
                meta.folder_id = None;
                manifest.root_notes.push(meta.clone());
                manifest.root_order.push(item_id.clone());
            }
        } else {
            manifest.root_notes.push(meta.clone());
            manifest.root_order.push(item_id.clone());
        }

        let path = note_path(&workspace_path, &item_id)?;
        let content = std::fs::read(&path).map_err(|error| error.to_string())?;
        let mut note: NoteDocument =
            serde_json::from_slice(&content).map_err(|error| error.to_string())?;
        note.folder_id = meta.folder_id.clone();
        note.icon = meta.icon.clone();
        let serialized = serde_json::to_vec_pretty(&note).map_err(|error| error.to_string())?;
        crate::commands::path_utils::write_atomic(&path, &serialized)
            .map_err(|error| error.to_string())?;

        if let Err(error) = save_manifest(&workspace_path, &manifest) {
            if let Err(rollback_error) = crate::commands::path_utils::write_atomic(&path, &content)
            {
                return Err(format!(
                    "{error}; failed to roll back restored note document: {rollback_error}"
                ));
            }
            return Err(error);
        }
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
    let manifest_lock = manifest_lock(&workspace_path);
    let _manifest_guard = manifest_lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path)?;

    if let Some(pos) = manifest.trash.iter().position(|i| i.id == item_id) {
        let item = manifest.trash[pos].clone();
        if item.item_type == "note" {
            let path = note_path(&workspace_path, &item.id)?;
            if path.exists() {
                std::fs::remove_file(path).map_err(|error| error.to_string())?;
            }
            // Also remove snapshots
            let snap_dir = snapshot_dir_path(&workspace_path, &item.id)?;
            if snap_dir.exists() {
                std::fs::remove_dir_all(snap_dir).map_err(|error| error.to_string())?;
            }
        }

        manifest.trash.remove(pos);
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
    let manifest_lock = manifest_lock(&workspace_path);
    let _manifest_guard = manifest_lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path)?;

    let mut retained = Vec::new();
    let mut errors = Vec::new();
    for item in manifest.trash.drain(..) {
        if item.item_type == "note" {
            let result = (|| -> Result<(), String> {
                let path = note_path(&workspace_path, &item.id)?;
                if path.exists() {
                    std::fs::remove_file(path).map_err(|error| error.to_string())?;
                }
                let snap_dir = snapshot_dir_path(&workspace_path, &item.id)?;
                if snap_dir.exists() {
                    std::fs::remove_dir_all(snap_dir).map_err(|error| error.to_string())?;
                }
                Ok(())
            })();
            if let Err(error) = result {
                errors.push(format!("{}: {error}", item.id));
                retained.push(item);
            }
        }
    }

    manifest.trash = retained;
    save_manifest(&workspace_path, &manifest)?;

    if !errors.is_empty() {
        return Err(format!(
            "Trash cleanup failed for {} item(s): {}",
            errors.len(),
            errors.join("; ")
        ));
    }

    let _ = logger.info(
        "tauri.note",
        "empty_trash",
        "Emptied trash",
        true,
        note_context(&workspace_path),
    );

    Ok(())
}
