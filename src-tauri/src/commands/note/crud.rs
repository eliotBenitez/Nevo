use chrono::Utc;
use uuid::Uuid;

use super::snapshots::store_note_snapshot;
use super::{
    empty_doc, extract_note_from_tree, insert_note_in_folder, note_context, note_error_context,
    note_path, update_note_meta_in_tree, NoteDocument,
};
use crate::commands::folder::{load_manifest, save_manifest};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::{self, NoteMeta};
use crate::logging::{LogContext, LogError};

#[tauri::command]
pub fn create_note(
    workspace_path: String,
    folder_id: Option<String>,
    title: String,
    icon: String,
) -> Result<NoteDocument, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "create_note",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let now = Utc::now().to_rfc3339();
    let note = NoteDocument {
        id: Uuid::new_v4().to_string(),
        title: title.clone(),
        icon: icon.clone(),
        cover: None,
        folder_id: folder_id.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
        content: empty_doc(),
    };

    let path = note_path(&workspace_path, &note.id)?;
    let content = serde_json::to_string_pretty(&note).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "create_note",
            "Failed to serialize note",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    crate::commands::path_utils::write_atomic(&path, content.as_bytes()).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "create_note",
            "Failed to write note file",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let meta = NoteMeta {
        id: note.id.clone(),
        title,
        icon,
        folder_id: folder_id.clone(),
        updated_at: now,
    };

    let mut manifest = load_manifest(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "create_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    if let Some(fid) = &folder_id {
        insert_note_in_folder(&mut manifest.tree, fid, meta);
    } else {
        manifest.root_order.push(note.id.clone());
        manifest.root_notes.push(meta);
    }
    save_manifest(&workspace_path, &manifest).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "create_note",
            "Failed to save workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let _ = logger.info(
        "tauri.note",
        "create_note",
        "Created note",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "noteId": note.id,
            "folderId": folder_id,
        })),
    );

    Ok(note)
}

#[tauri::command]
pub fn load_note(workspace_path: String, note_id: String) -> Result<NoteDocument, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "load_note",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let path = note_path(&workspace_path, &note_id)?;
    let content = std::fs::read_to_string(&path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "load_note",
            "Failed to read note file",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let note = serde_json::from_str(&content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "load_note",
            "Failed to parse note file",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    let _ = logger.debug(
        "tauri.note",
        "load_note",
        "Loaded note",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "noteId": note_id,
        })),
    );
    Ok(note)
}

#[tauri::command]
pub fn save_note(workspace_path: String, note: NoteDocument) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let path = note_path(&workspace_path, &note.id)?;
    let content = serde_json::to_string(&note).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to serialize note",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    crate::commands::path_utils::write_atomic(&path, content.as_bytes()).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to write note file",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    store_note_snapshot(&workspace_path, &note).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to store note snapshot",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let mut manifest = load_manifest(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let updated_at = note.updated_at.clone();
    if note.folder_id.is_none() {
        for rn in manifest.root_notes.iter_mut() {
            if rn.id == note.id {
                rn.title = note.title.clone();
                rn.icon = note.icon.clone();
                rn.updated_at = updated_at.clone();
            }
        }
    } else {
        update_note_meta_in_tree(
            &mut manifest.tree,
            &note.id,
            &note.title,
            &note.icon,
            &updated_at,
        );
    }
    save_manifest(&workspace_path, &manifest).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to save workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let _ = logger.debug(
        "tauri.note",
        "save_note",
        "Saved note",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "noteId": note.id,
            "hasCover": note.cover.is_some(),
        })),
    );
    Ok(())
}

#[tauri::command]
pub fn delete_note(workspace_path: String, note_id: String) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "delete_note",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);

    let mut manifest = load_manifest(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "delete_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    // Find and extract note metadata from tree or root_notes
    let note_meta = if let Some(pos) = manifest.root_notes.iter().position(|n| n.id == note_id) {
        Some(manifest.root_notes.remove(pos))
    } else {
        extract_note_from_tree(&mut manifest.tree, &note_id)
    };

    if let Some(meta) = note_meta {
        manifest.root_order.retain(|id| id != &note_id);

        manifest.trash.push(workspace::TrashedItem {
            id: meta.id.clone(),
            item_type: "note".to_string(),
            title: meta.title.clone(),
            deleted_at: Utc::now().to_rfc3339(),
            original_parent_id: meta.folder_id.clone(),
        });

        save_manifest(&workspace_path, &manifest).map_err(|message| {
            let _ = logger.error(
                "tauri.note",
                "delete_note",
                "Failed to save workspace manifest",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?;

        let _ = logger.info(
            "tauri.note",
            "delete_note",
            "Moved note to trash",
            diagnostics_enabled,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "noteId": note_id,
            })),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn move_note(
    workspace_path: String,
    note_id: String,
    target_folder_id: Option<String>,
) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "move_note",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let mut manifest = load_manifest(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "move_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let note_meta: Option<NoteMeta> =
        if let Some(pos) = manifest.root_notes.iter().position(|n| n.id == note_id) {
            let mut meta = manifest.root_notes.remove(pos);
            manifest.root_order.retain(|id| id != &note_id);
            meta.folder_id = target_folder_id.clone();
            Some(meta)
        } else {
            let mut meta = extract_note_from_tree(&mut manifest.tree, &note_id);
            if let Some(ref mut m) = meta {
                m.folder_id = target_folder_id.clone();
            }
            meta
        };

    if let Some(meta) = note_meta {
        if let Some(fid) = &target_folder_id {
            insert_note_in_folder(&mut manifest.tree, fid, meta);
        } else {
            manifest.root_order.push(note_id.clone());
            manifest.root_notes.push(meta);
        }
    }

    // Update folderId inside the note file
    let path = note_path(&workspace_path, &note_id)?;
    if path.exists() {
        let file_content = std::fs::read_to_string(&path).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.note",
                "move_note",
                "Failed to read note file",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?;
        let mut doc: NoteDocument = serde_json::from_str(&file_content).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.note",
                "move_note",
                "Failed to parse note file",
                note_error_context(&workspace_path, "serde", message.clone()),
            );
            message
        })?;
        doc.folder_id = target_folder_id.clone();
        let new_content = serde_json::to_string_pretty(&doc).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.note",
                "move_note",
                "Failed to serialize moved note",
                note_error_context(&workspace_path, "serde", message.clone()),
            );
            message
        })?;
        crate::commands::path_utils::write_atomic(&path, new_content.as_bytes()).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.note",
                "move_note",
                "Failed to write moved note",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?;
    }

    save_manifest(&workspace_path, &manifest).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "move_note",
            "Failed to save workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let _ = logger.info(
        "tauri.note",
        "move_note",
        "Moved note",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "noteId": note_id,
            "targetFolderId": target_folder_id,
        })),
    );
    Ok(())
}
