// Reversible snapshot restore.
//
// Restoring a note is a merge, not a load-and-overwrite: the historical
// snapshot's editable fields (title/icon/cover/properties/content/canvas)
// replace the current note's known values, while unknown current property
// keys, identity, placement, and unrelated fields stay untouched. The merge
// happens on raw `serde_json::Value`s rather than through `NoteDocument`'s
// typed fields, so nested unknown fields are not dropped by a struct round
// trip.
//
// Every restore first durably snapshots the exact current state being
// replaced (bypassing the normal five-minute snapshot throttle — see
// `snapshots::SNAPSHOT_MIN_INTERVAL_SECS`), so a restore is always
// reversible by restoring that recovery snapshot right back.

use chrono::Utc;
use serde::Serialize;
use serde_json::{Map, Value};

use super::notebook::{validate_note_for_write, validate_serialized_size, DocumentFormat};
use super::restore_journal::{commit_note_restore, CommitOutcome};
use super::snapshots::{
    prune_note_snapshots_internal, read_snapshot_raw, snapshot_retention_limit,
    write_snapshot_bytes,
};
use super::{note_context, note_error_context, note_lock, note_path, NoteDocument};
use crate::commands::folder::{load_manifest, manifest_lock};
use crate::commands::note_index;
use crate::commands::path_utils::{normalize_workspace_path, validate_id};
use crate::commands::workspace::{self, CURRENT_WORKSPACE_SCHEMA_VERSION};
use crate::logging::{LogContext, LogError};

#[cfg(test)]
#[path = "snapshot_restore_tests.rs"]
mod tests;

/// The editable fields a restore copies from the snapshot onto the current
/// note. Everything else on the current note (id, createdAt, folderId, and
/// any field this build doesn't know about) is left untouched.
const RESTORABLE_FIELDS: [&str; 8] = [
    "title",
    "icon",
    "cover",
    "properties",
    "content",
    "canvas",
    "documentKind",
    "notebook",
];
const KNOWN_PROPERTY_FIELDS: [&str; 4] = ["type", "tags", "date", "status"];

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RestoreWarning {
    /// The note was committed, but the workspace manifest resync failed and
    /// was deferred to `recover_pending_restores` (see `restore_journal`).
    ManifestPending,
    /// The note was committed, but pruning old snapshots down to the
    /// configured retention afterward failed. The recovery snapshot itself
    /// is unaffected — it is always the newest file.
    PruneFailed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreNoteSnapshotResult {
    pub note: NoteDocument,
    /// Id of the snapshot durably written from the exact pre-restore state,
    /// so this restore can itself be undone by restoring this snapshot.
    pub recovery_snapshot_id: String,
    pub warnings: Vec<RestoreWarning>,
}

#[tauri::command]
pub async fn restore_note_snapshot(
    workspace_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<RestoreNoteSnapshotResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        restore_note_snapshot_impl(workspace_path, note_id, snapshot_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) fn restore_note_snapshot_impl(
    workspace_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<RestoreNoteSnapshotResult, String> {
    let logger = crate::logging::logger();
    validate_id(&note_id)?;
    validate_id(&snapshot_id)?;
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);

    // Step 2: the snapshot to restore from must be sound before anything
    // about the current note is touched.
    let snapshot_raw =
        read_snapshot_raw(&workspace_path, &note_id, &snapshot_id).inspect_err(|message| {
            let _ = logger.error(
                "tauri.note",
                "restore_note_snapshot",
                "Failed to read snapshot file",
                note_error_context(&workspace_path, "io", message.clone()),
            );
        })?;
    let snapshot_map = parse_snapshot_value(&snapshot_raw).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to parse snapshot file",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;

    // Step 3: hold the note lock for the rest of the restore, so a
    // concurrent `save_note` for this note cannot interleave with it.
    let note_write_lock = note_lock(&workspace_path, &note_id);
    let _note_guard = note_write_lock.lock().map_err(|error| error.to_string())?;

    // Step 4: read and validate the note being replaced before touching it.
    // A missing, unreadable, malformed, misidentified, or non-document
    // current note aborts here, before anything is modified.
    let (current_raw, current_map) =
        read_current_note(&workspace_path, &note_id).map_err(|message| {
            let _ = logger.error(
                "tauri.note",
                "restore_note_snapshot",
                "Refusing to restore over an unreadable or malformed current note",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?;

    let current_value: Value = serde_json::from_str(&current_raw).map_err(|e| e.to_string())?;
    let current_note = validate_note_value(&current_value, &note_id)?;
    let snapshot_value = Value::Object(snapshot_map.clone());
    let snapshot_note = validate_note_value(&snapshot_value, &note_id)?;
    let current_format = validate_note_for_write(&current_note)?;
    let snapshot_format = validate_note_for_write(&snapshot_note)?;
    if current_format != snapshot_format {
        return Err("Cannot restore a snapshot with a different document format".to_string());
    }
    if current_format == DocumentFormat::Notebook {
        let lock = manifest_lock(&workspace_path);
        let _manifest_guard = lock.lock().map_err(|error| error.to_string())?;
        let manifest = load_manifest(&workspace_path)?;
        if manifest.schema_version < 2 {
            return Err("Notebook workspace schema upgrade is required before restore".to_string());
        }
        if manifest.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION {
            return Err(format!(
                "workspace-schema-too-new:{}:{}",
                manifest.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION
            ));
        }
    }

    // Step 5: durably snapshot the exact state being replaced, verbatim and
    // bypassing the normal snapshot throttle, before it is touched. If this
    // fails, the note is left untouched.
    let recovery_snapshot_id =
        write_snapshot_bytes(&workspace_path, &note_id, current_raw.as_bytes()).inspect_err(
            |message| {
                let _ = logger.error(
                    "tauri.note",
                    "restore_note_snapshot",
                    "Failed to write the pre-restore recovery snapshot",
                    note_error_context(&workspace_path, "io", message.clone()),
                );
            },
        )?;

    // Step 6: merge the snapshot's editable fields onto the current
    // document, preserving identity, placement, and unknown fields, and
    // validate the result before it is written anywhere. The bytes committed
    // below are this merged `Value` serialized directly (not a re-serialized
    // `NoteDocument`), so a nested unknown field this build doesn't model —
    // e.g. inside `properties` — still survives the restore.
    let updated_at = Utc::now().to_rfc3339();
    let merged = merge_restored(&current_map, &snapshot_map, &updated_at);
    let merged_value = Value::Object(merged);
    let restored = validate_note_value(&merged_value, &note_id).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Restored note failed validation before it was committed",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    let payload = serde_json::to_string_pretty(&merged_value).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to serialize restored note",
            note_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;

    // Step 7: commit note.json and (best-effort, inside commit_note_restore)
    // the manifest resync as one durable, crash-safe operation.
    let mut warnings = Vec::new();
    match commit_note_restore(&workspace_path, &note_id, payload.as_bytes()) {
        Ok(CommitOutcome::Complete) => {}
        Ok(CommitOutcome::ManifestPending) => warnings.push(RestoreWarning::ManifestPending),
        Err(message) => {
            let _ = logger.error(
                "tauri.note",
                "restore_note_snapshot",
                "Failed to durably commit the restored note",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            return Err(message);
        }
    }

    // Step 8: pruning only after a successful commit — the recovery snapshot
    // just written is the newest file, so it survives any limit >= 1. A
    // prune failure does not undo the already-committed restore.
    let limit = snapshot_retention_limit(&workspace_path);
    if let Err(message) = prune_note_snapshots_internal(&workspace_path, &note_id, limit) {
        let _ = logger.error(
            "tauri.note",
            "restore_note_snapshot",
            "Failed to prune old snapshots after a restore",
            note_error_context(&workspace_path, "io", message),
        );
        warnings.push(RestoreWarning::PruneFailed);
    }

    // Step 9: best-effort index refresh so search/metadata reflect the
    // restored note immediately, instead of only after the note is next
    // saved. The index is a rebuildable cache, so a failure here is only
    // logged.
    if let Ok(manifest) = load_manifest(&workspace_path) {
        let folder_path =
            note_index::folder_path_for_id(&manifest.tree, restored.folder_id.as_deref());
        if let Err(message) =
            note_index::upsert_note_document(&workspace_path, &restored, &folder_path)
        {
            let _ = logger.warn(
                "tauri.note",
                "restore_note_snapshot",
                "Failed to update note metadata index after a restore",
                diagnostics_enabled,
                note_error_context(&workspace_path, "note_index", message),
            );
        }
    }

    let _ = logger.info(
        "tauri.note",
        "restore_note_snapshot",
        "Restored note snapshot",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "noteId": note_id,
            "snapshotId": snapshot_id,
            "recoverySnapshotId": recovery_snapshot_id,
        })),
    );

    Ok(RestoreNoteSnapshotResult {
        note: restored,
        recovery_snapshot_id,
        warnings,
    })
}

/// Parses a snapshot's raw text and confirms it deserializes into a
/// well-formed `NoteDocument`, without the stricter identity/content checks
/// `validate_note_value` applies to the current note and the merged result —
/// a snapshot's own `id` and `content` are whatever the note looked like when
/// it was written, not something to re-validate against the note being
/// restored into.
fn parse_snapshot_value(raw: &str) -> Result<Map<String, Value>, String> {
    let value: Value = serde_json::from_str(raw).map_err(|error| error.to_string())?;
    let _: NoteDocument =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| "Snapshot is not a JSON object".to_string())
}

/// Reads and validates the current `note.json` before any part of a restore
/// touches it. Returns the raw text (for the verbatim recovery snapshot) and
/// the parsed object (for merging).
fn read_current_note(
    workspace_path: &str,
    note_id: &str,
) -> Result<(String, Map<String, Value>), String> {
    let path = note_path(workspace_path, note_id)?;
    let raw = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let value: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    validate_note_value(&value, note_id)?;
    let map = value
        .as_object()
        .cloned()
        .ok_or_else(|| "Current note is not a JSON object".to_string())?;
    Ok((raw, map))
}

/// Confirms `value` is a JSON object that deserializes into a `NoteDocument`
/// whose `id` matches `note_id` and whose `content.type` is `"doc"`. Shared
/// by the current-note check (step 4) and the merged restored document
/// (step 6) so both are held to the same bar before anything is written or
/// returned.
fn validate_note_value(value: &Value, note_id: &str) -> Result<NoteDocument, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Note is not a JSON object".to_string())?;
    let content_type = object
        .get("content")
        .and_then(|content| content.get("type"))
        .and_then(|content_type| content_type.as_str());
    if content_type != Some("doc") {
        return Err("Note content is not a document".to_string());
    }
    let note: NoteDocument =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;
    if note.id != note_id {
        return Err(format!(
            "Note id {} does not match expected {note_id}",
            note.id
        ));
    }
    let format = validate_note_for_write(&note)?;
    if format == DocumentFormat::Notebook {
        validate_serialized_size(value)?;
    }
    Ok(note)
}

/// Builds the restored document: starts from `current`, then for each
/// restorable field copies the snapshot's value when present or removes the
/// field when the snapshot doesn't have it (so a snapshot without a cover or
/// canvas really removes it). `properties` preserves unknown current keys
/// while restoring the known fields from history.
/// Identity/placement fields (`id`, `createdAt`, `folderId`) and any other
/// current field are left untouched because they are never in the
/// restorable set.
fn merge_restored(
    current: &Map<String, Value>,
    snapshot: &Map<String, Value>,
    updated_at: &str,
) -> Map<String, Value> {
    let mut merged = current.clone();
    for field in RESTORABLE_FIELDS {
        match snapshot.get(field) {
            Some(value) if field == "properties" => {
                merged.insert(
                    field.to_string(),
                    merge_properties(current.get(field), value),
                );
            }
            Some(value) => {
                merged.insert(field.to_string(), value.clone());
            }
            None => {
                merged.remove(field);
            }
        }
    }
    merged.insert(
        "updatedAt".to_string(),
        Value::String(updated_at.to_string()),
    );
    merged
}

/// Restores the known property values from history while retaining unknown
/// current keys. Unknown keys present only in the historical snapshot are
/// copied too, but a current value wins when both builds know different data.
fn merge_properties(current: Option<&Value>, snapshot: &Value) -> Value {
    let Some(snapshot_properties) = snapshot.as_object() else {
        return snapshot.clone();
    };

    let mut merged = current
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    for field in KNOWN_PROPERTY_FIELDS {
        match snapshot_properties.get(field) {
            Some(value) => {
                merged.insert(field.to_string(), value.clone());
            }
            None => {
                merged.remove(field);
            }
        }
    }

    for (field, value) in snapshot_properties {
        if !KNOWN_PROPERTY_FIELDS.contains(&field.as_str()) {
            merged.entry(field.clone()).or_insert_with(|| value.clone());
        }
    }

    Value::Object(merged)
}
