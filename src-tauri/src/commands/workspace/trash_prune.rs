use std::path::Path;

use chrono::Utc;

use super::paths::{snapshots_dir_path, workspace_error_context};
use super::types::WorkspaceManifest;
use crate::commands::folder::{load_manifest, manifest_lock, save_manifest};
use crate::commands::note::note_path;
use crate::commands::note_index;

/// Drops trashed notes older than `retention_days`. The manifest is saved
/// first and the note files / snapshot dirs are deleted only after that save
/// succeeds, so a failed save never leaves trash entries pointing at files
/// that are already gone. Returns the pruned manifest when anything expired.
pub(super) fn prune_expired_trash(
    workspace_path: &str,
    retention_days: u32,
) -> Result<Option<WorkspaceManifest>, String> {
    let logger = crate::logging::logger();
    let lock = manifest_lock(workspace_path);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(workspace_path)?;

    let now = Utc::now();
    let mut expired_notes = Vec::new();
    let trash_len = manifest.trash.len();
    manifest.trash.retain(|item| {
        let Ok(deleted_at) = chrono::DateTime::parse_from_rfc3339(&item.deleted_at) else {
            return true;
        };
        let age = now.signed_duration_since(deleted_at.with_timezone(&Utc));
        if age.num_days() < retention_days as i64 {
            return true;
        }
        if item.item_type == "note" {
            expired_notes.push(item.id.clone());
        }
        false
    });
    if manifest.trash.len() == trash_len {
        return Ok(None);
    }

    save_manifest(workspace_path, &manifest).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "open_workspace",
            "Failed to save workspace manifest after pruning trash",
            workspace_error_context(workspace_path, "io", message.clone()),
        );
    })?;

    for id in &expired_notes {
        let mut failures = Vec::new();
        match note_path(workspace_path, id) {
            Ok(path) => {
                if let Err(error) = std::fs::remove_file(&path) {
                    if error.kind() != std::io::ErrorKind::NotFound {
                        failures.push(error.to_string());
                    }
                }
                let snap_dir = snapshots_dir_path(workspace_path).join(id);
                if let Err(error) = std::fs::remove_dir_all(&snap_dir) {
                    if error.kind() != std::io::ErrorKind::NotFound {
                        failures.push(error.to_string());
                    }
                }
            }
            Err(message) => failures.push(message),
        }
        if let Err(message) = note_index::remove_note(Path::new(workspace_path), id) {
            failures.push(message);
        }
        if !failures.is_empty() {
            let _ = logger.warn(
                "tauri.workspace",
                "open_workspace",
                "Failed to fully clean up an expired trashed note",
                true,
                workspace_error_context(workspace_path, "io", failures.join("; "))
                    .with_payload(serde_json::json!({ "itemId": id })),
            );
        }
    }

    let _ = logger.info(
        "tauri.workspace",
        "open_workspace",
        &format!(
            "Pruned {} items from trash",
            trash_len - manifest.trash.len()
        ),
        true,
        super::paths::workspace_context(workspace_path),
    );
    Ok(Some(manifest))
}
