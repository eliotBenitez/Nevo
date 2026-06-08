use chrono::{NaiveDateTime, Utc};
use std::path::Path;
use uuid::Uuid;

use super::{
    note_error_context, note_path, update_note_meta_in_tree, NoteDocument, NoteSnapshotMeta,
};
use crate::commands::folder::{load_manifest, save_manifest};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

pub(crate) fn snapshot_dir_path(workspace_path: &str, note_id: &str) -> std::path::PathBuf {
    Path::new(workspace_path)
        .join(".nevo")
        .join("snapshots")
        .join(note_id)
}

fn snapshot_file_path(
    workspace_path: &str,
    note_id: &str,
    snapshot_id: &str,
) -> std::path::PathBuf {
    snapshot_dir_path(workspace_path, note_id).join(format!("{}.json", snapshot_id))
}

fn create_snapshot_id() -> String {
    format!(
        "{}-{}",
        Utc::now().format("%Y%m%d%H%M%S%3f"),
        Uuid::new_v4()
    )
}

fn list_snapshot_files(
    workspace_path: &str,
    note_id: &str,
) -> Result<Vec<std::path::PathBuf>, String> {
    let dir = snapshot_dir_path(workspace_path, note_id);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut files = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|x| x.to_str()) == Some("json"))
        .collect::<Vec<_>>();

    files.sort_by(|a, b| b.cmp(a));
    Ok(files)
}

fn prune_note_snapshots_internal(
    workspace_path: &str,
    note_id: &str,
    limit: usize,
) -> Result<(), String> {
    let files = list_snapshot_files(workspace_path, note_id)?;
    if files.len() <= limit {
        return Ok(());
    }

    for path in files.iter().skip(limit) {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Minimum spacing between version snapshots. Autosave runs every ~2s while
/// typing; without this the snapshot history would grow by hundreds of full
/// document copies per session. The note file itself is always written by
/// `save_note`, so throttling snapshots never risks losing current content.
const SNAPSHOT_MIN_INTERVAL_SECS: i64 = 300;

/// Parse the leading `%Y%m%d%H%M%S%3f` timestamp from a snapshot filename
/// (format: `{timestamp}-{uuid}`). Returns the snapshot's creation time.
fn snapshot_timestamp(path: &Path) -> Option<NaiveDateTime> {
    let stem = path.file_stem()?.to_str()?;
    let ts = stem.split('-').next()?;
    NaiveDateTime::parse_from_str(ts, "%Y%m%d%H%M%S%3f").ok()
}

fn write_note_snapshot(workspace_path: &str, note: &NoteDocument) -> Result<(), String> {
    let dir = snapshot_dir_path(workspace_path, &note.id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let snapshot_id = create_snapshot_id();
    let snapshot_path = snapshot_file_path(workspace_path, &note.id, &snapshot_id);
    let content = serde_json::to_string(note).map_err(|e| e.to_string())?;
    std::fs::write(snapshot_path, content).map_err(|e| e.to_string())?;
    prune_note_snapshots_internal(workspace_path, &note.id, 50)
}

pub(crate) fn store_note_snapshot(workspace_path: &str, note: &NoteDocument) -> Result<(), String> {
    // Skip if the newest existing snapshot is younger than the throttle window.
    if let Some(newest) = list_snapshot_files(workspace_path, &note.id)?.first() {
        if let Some(created) = snapshot_timestamp(newest) {
            let age = Utc::now().naive_utc().signed_duration_since(created);
            if age.num_seconds() < SNAPSHOT_MIN_INTERVAL_SECS {
                return Ok(());
            }
        }
    }

    write_note_snapshot(workspace_path, note)
}

#[tauri::command]
pub fn list_note_snapshots(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<NoteSnapshotMeta>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let mut snapshots = vec![];
    let files = list_snapshot_files(&workspace_path, &note_id)?;

    for path in files {
        let snapshot_id = match path.file_stem().and_then(|x| x.to_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let parsed = match serde_json::from_str::<NoteDocument>(&content) {
            Ok(doc) => doc,
            Err(_) => continue,
        };
        let created_at = std::fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(|mtime| chrono::DateTime::<Utc>::from(mtime).to_rfc3339())
            .unwrap_or_else(|| parsed.updated_at.clone());
        snapshots.push(NoteSnapshotMeta {
            id: snapshot_id,
            note_id: parsed.id.clone(),
            created_at,
            updated_at: parsed.updated_at.clone(),
        });
    }

    Ok(snapshots)
}

#[tauri::command]
pub fn load_note_snapshot(
    workspace_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<NoteDocument, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let snapshot_path = snapshot_file_path(&workspace_path, &note_id, &snapshot_id);
    let content = std::fs::read_to_string(&snapshot_path).map_err(|e| e.to_string())?;
    let mut note: NoteDocument = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    note.id = note_id;
    Ok(note)
}

#[tauri::command]
pub fn restore_note_snapshot(
    workspace_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<NoteDocument, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
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
    let snapshot_path = snapshot_file_path(&workspace_path, &note_id, &snapshot_id);
    let content = std::fs::read_to_string(&snapshot_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to read snapshot file",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let mut note: NoteDocument = serde_json::from_str(&content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to parse snapshot file",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;

    note.id = note_id.clone();
    note.updated_at = Utc::now().to_rfc3339();

    let note_file_path = note_path(&workspace_path, &note_id);
    let payload = serde_json::to_string_pretty(&note).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to serialize restored note",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    std::fs::write(&note_file_path, payload).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to write restored note",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    write_note_snapshot(&workspace_path, &note).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to snapshot restored note",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let mut manifest = load_manifest(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to load workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    if note.folder_id.is_none() {
        for rn in manifest.root_notes.iter_mut() {
            if rn.id == note.id {
                rn.title = note.title.clone();
                rn.icon = note.icon.clone();
                rn.updated_at = note.updated_at.clone();
            }
        }
    } else {
        update_note_meta_in_tree(
            &mut manifest.tree,
            &note.id,
            &note.title,
            &note.icon,
            &note.updated_at,
        );
    }
    save_manifest(&workspace_path, &manifest).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to save workspace manifest",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let _ = logger.info(
        "tauri.note",
        "restore_note_snapshot",
        "Restored note snapshot",
        diagnostics_enabled,
        super::note_context(&workspace_path).with_payload(serde_json::json!({
            "noteId": note_id,
            "snapshotId": snapshot_id,
        })),
    );

    Ok(note)
}

#[tauri::command]
pub fn prune_note_snapshots(workspace_path: String, note_id: String) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    prune_note_snapshots_internal(&workspace_path, &note_id, 50)
}
