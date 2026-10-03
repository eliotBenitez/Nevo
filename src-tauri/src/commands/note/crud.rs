use chrono::Utc;
use uuid::Uuid;

use super::notebook::{validate_note_for_write, validate_serialized_size, DocumentFormat};
use super::snapshots::store_note_snapshot;
use super::{
    empty_doc, extract_note_from_tree, folder_exists, insert_note_in_folder, note_context,
    note_error_context, note_exists_in_tree, note_lock, note_path, update_note_meta_in_manifest,
    NoteDocument, NoteProperties,
};
use crate::commands::folder::{load_manifest, manifest_lock, save_manifest};
use crate::commands::note_index;
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::{self, NoteMeta, CURRENT_WORKSPACE_SCHEMA_VERSION};
use crate::logging::{LogContext, LogError};

#[tauri::command]
pub async fn create_note(
    workspace_path: String,
    folder_id: Option<String>,
    title: String,
    icon: String,
) -> Result<NoteDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_note_impl(workspace_path, folder_id, title, icon)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) fn create_note_impl(
    workspace_path: String,
    folder_id: Option<String>,
    title: String,
    icon: String,
) -> Result<NoteDocument, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let manifest_lock = manifest_lock(&workspace_path);
    let _manifest_guard = manifest_lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "create_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
    })?;
    if let Some(folder_id) = &folder_id {
        if !folder_exists(&manifest.tree, folder_id) {
            return Err("Target folder not found".to_string());
        }
    }
    let now = Utc::now().to_rfc3339();
    let note = NoteDocument {
        id: Uuid::new_v4().to_string(),
        title: title.clone(),
        icon: icon.clone(),
        cover: None,
        folder_id: folder_id.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
        properties: Some(NoteProperties::empty()),
        content: empty_doc(),
        canvas: None,
        extra: Default::default(),
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
        extra: Default::default(),
    };

    if let Some(fid) = &folder_id {
        if !insert_note_in_folder(&mut manifest.tree, fid, meta) {
            let _ = std::fs::remove_file(&path);
            return Err("Target folder not found".to_string());
        }
    } else {
        manifest.root_order.push(note.id.clone());
        manifest.root_notes.push(meta);
    }
    save_manifest(&workspace_path, &manifest).inspect_err(|message| {
        let _ = std::fs::remove_file(&path);
        let _ = logger.error(
            "tauri.note",
            "create_note",
            "Failed to save workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
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

    // Best-effort: the note metadata index is a rebuildable cache
    // (`note_index::reindex_all`), so a failure here must never fail the
    // create.
    let index_folder_path = note_index::folder_path_for_id(&manifest.tree, folder_id.as_deref());
    if let Err(message) =
        note_index::upsert_note_document(&workspace_path, &note, &index_folder_path)
    {
        let _ = logger.warn(
            "tauri.note",
            "create_note",
            "Failed to update note metadata index",
            diagnostics_enabled,
            note_error_context(&workspace_path, "note_index", message),
        );
    }

    Ok(note)
}

#[tauri::command]
pub async fn load_note(workspace_path: String, note_id: String) -> Result<NoteDocument, String> {
    tauri::async_runtime::spawn_blocking(move || load_note_impl(workspace_path, note_id))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn load_note_impl(
    workspace_path: String,
    note_id: String,
) -> Result<NoteDocument, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
pub async fn save_note(workspace_path: String, note: NoteDocument) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || save_note_impl(workspace_path, note))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn save_note_impl(workspace_path: String, note: NoteDocument) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);

    // Serializes this whole write against a concurrent snapshot restore for
    // the same note — see `note_lock`.
    let note_write_lock = note_lock(&workspace_path, &note.id);
    let _note_guard = note_write_lock.lock().map_err(|error| error.to_string())?;

    let manifest_lock = manifest_lock(&workspace_path);
    let _manifest_guard = manifest_lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
    })?;
    if manifest.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "workspace-schema-too-new:{}:{}",
            manifest.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION
        ));
    }
    let path = note_path(&workspace_path, &note.id)?;
    if path.exists() {
        let current_raw = std::fs::read_to_string(&path).map_err(|error| {
            format!("Unable to validate the current note before saving: {error}")
        })?;
        let current_value: serde_json::Value = serde_json::from_str(&current_raw)
            .map_err(|error| format!("Refusing to overwrite a malformed note: {error}"))?;
        let current_note: NoteDocument = serde_json::from_value(current_value)
            .map_err(|error| format!("Refusing to overwrite an unreadable note: {error}"))?;
        let current_format = validate_note_for_write(&current_note)
            .map_err(|_| "unsupported-format: the existing note is read-only".to_string())?;
        let requested_format = validate_note_for_write(&note)
            .map_err(|error| format!("unsupported-format: {error}"))?;
        if current_format != requested_format {
            return Err(
                "unsupported-format: note format changes require an explicit migration".to_string(),
            );
        }
    }
    let format = validate_note_for_write(&note)?;
    let raw = serde_json::to_value(&note).map_err(|error| error.to_string())?;
    if format == DocumentFormat::Notebook {
        if !path.is_file() {
            return Err(
                "unsupported-format: notebooks must be created with create_notebook".to_string(),
            );
        }
        validate_serialized_size(&raw)?;
    }
    if format == DocumentFormat::Notebook && manifest.schema_version < 2 {
        return Err("Notebook workspace schema upgrade is required before saving".to_string());
    }

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
    store_note_snapshot(&workspace_path, &note).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to store note snapshot",
            note_error_context(&workspace_path, "io", message.clone()),
        );
    })?;

    let updated = update_note_meta_in_manifest(
        &mut manifest.root_notes,
        &mut manifest.tree,
        &note.id,
        &note.title,
        &note.icon,
        &note.updated_at,
    );
    if !updated {
        let _ = logger.warn(
            "tauri.note",
            "save_note",
            "Note was saved but its manifest entry was not found",
            diagnostics_enabled,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "noteId": note.id,
                "folderId": note.folder_id,
            })),
        );
    }
    save_manifest(&workspace_path, &manifest).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_note",
            "Failed to save workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
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

    // Best-effort, mirrors create_note_impl: the index is a rebuildable
    // cache, so a failure here must never fail the save.
    let index_folder_path =
        note_index::folder_path_for_id(&manifest.tree, note.folder_id.as_deref());
    if let Err(message) =
        note_index::upsert_note_document(&workspace_path, &note, &index_folder_path)
    {
        let _ = logger.warn(
            "tauri.note",
            "save_note",
            "Failed to update note metadata index",
            diagnostics_enabled,
            note_error_context(&workspace_path, "note_index", message),
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_note(workspace_path: String, note_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_note_impl(workspace_path, note_id))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn delete_note_impl(workspace_path: String, note_id: String) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);

    let manifest_lock = manifest_lock(&workspace_path);
    let _manifest_guard = manifest_lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "delete_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
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
            icon: Some(meta.icon.clone()),
            // Carry the note's unknown fields through the trash so a delete +
            // restore in an older build does not drop what a newer one wrote
            // (`restore_from_trash` hands them back to the rebuilt NoteMeta).
            // A future TrashedItem field sharing a NoteMeta field's name would
            // collide here; both shapes live in the same manifest schema, so
            // that is a schema-version decision, not an accident to guard.
            extra: meta.extra.clone(),
        });

        save_manifest(&workspace_path, &manifest).inspect_err(|message| {
            let _ = logger.error(
                "tauri.note",
                "delete_note",
                "Failed to save workspace manifest",
                note_error_context(&workspace_path, "io", message.clone()),
            );
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

        // Best-effort: trashed notes should not surface in query_notes; the
        // index is rebuildable via note_index::reindex_all if this fails.
        if let Err(message) =
            note_index::remove_note(std::path::Path::new(&workspace_path), &note_id)
        {
            let _ = logger.warn(
                "tauri.note",
                "delete_note",
                "Failed to remove note from metadata index",
                diagnostics_enabled,
                note_error_context(&workspace_path, "note_index", message),
            );
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn move_note(
    workspace_path: String,
    note_id: String,
    target_folder_id: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        move_note_impl(workspace_path, note_id, target_folder_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) fn move_note_impl(
    workspace_path: String,
    note_id: String,
    target_folder_id: Option<String>,
) -> Result<(), String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let manifest_lock = manifest_lock(&workspace_path);
    let _manifest_guard = manifest_lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "move_note",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
    })?;

    if let Some(folder_id) = &target_folder_id {
        if !folder_exists(&manifest.tree, folder_id) {
            return Err("Target folder not found".to_string());
        }
    }
    let source_exists = manifest.root_notes.iter().any(|note| note.id == note_id)
        || note_exists_in_tree(&manifest.tree, &note_id);
    if !source_exists {
        return Err("Note not found in workspace manifest".to_string());
    }

    let path = note_path(&workspace_path, &note_id)?;
    let original_content = std::fs::read(&path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "move_note",
            "Failed to read note file",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let mut doc: NoteDocument = serde_json::from_slice(&original_content).map_err(|error| {
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
    let moved_content = serde_json::to_vec_pretty(&doc).map_err(|error| error.to_string())?;

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
            if !insert_note_in_folder(&mut manifest.tree, fid, meta) {
                return Err("Target folder not found".to_string());
            }
        } else {
            manifest.root_order.push(note_id.clone());
            manifest.root_notes.push(meta);
        }
    } else {
        return Err("Note not found in workspace manifest".to_string());
    }

    crate::commands::path_utils::write_atomic(&path, &moved_content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "move_note",
            "Failed to write moved note",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    save_manifest(&workspace_path, &manifest).inspect_err(|message| {
        let _ = crate::commands::path_utils::write_atomic(&path, &original_content);
        let _ = logger.error(
            "tauri.note",
            "move_note",
            "Failed to save workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
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

    // Best-effort: keep the index's folder_id/folder_path in sync with the
    // move. Recomputed from `manifest` after the move was applied above, so
    // this reflects the note's new location. The index is a rebuildable
    // cache (note_index::reindex_all), so a failure here must not fail the
    // move.
    let index_folder_path =
        note_index::folder_path_for_id(&manifest.tree, doc.folder_id.as_deref());
    if let Err(message) =
        note_index::upsert_note_document(&workspace_path, &doc, &index_folder_path)
    {
        let _ = logger.warn(
            "tauri.note",
            "move_note",
            "Failed to update note metadata index",
            diagnostics_enabled,
            note_error_context(&workspace_path, "note_index", message),
        );
    }

    Ok(())
}
