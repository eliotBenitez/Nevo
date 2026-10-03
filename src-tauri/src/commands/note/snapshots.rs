use chrono::{NaiveDateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::{NoteDocument, NoteSnapshotMeta};
use crate::commands::path_utils::normalize_workspace_path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSnapshotsEntry {
    pub note_id: String,
    pub snapshots: Vec<NoteSnapshotMeta>,
}

fn snapshots_root_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo").join("snapshots")
}

pub(crate) fn snapshot_dir_path(
    workspace_path: &str,
    note_id: &str,
) -> Result<std::path::PathBuf, String> {
    crate::commands::path_utils::validate_id(note_id)?;
    Ok(snapshots_root_path(workspace_path).join(note_id))
}

fn snapshot_file_path(
    workspace_path: &str,
    note_id: &str,
    snapshot_id: &str,
) -> Result<std::path::PathBuf, String> {
    crate::commands::path_utils::validate_id(snapshot_id)?;
    Ok(snapshot_dir_path(workspace_path, note_id)?.join(format!("{}.json", snapshot_id)))
}

fn create_snapshot_id() -> String {
    format!(
        "{}-{}",
        Utc::now().format("%Y%m%d%H%M%S%3f"),
        Uuid::new_v4()
    )
}

/// List `.json` snapshot files in `dir`, newest first. Used both for a single
/// note's snapshot directory and (via `list_all_note_snapshots_impl`) for every
/// note-id subdirectory under the workspace's snapshots root in one pass.
fn list_json_files_in_dir(dir: &Path) -> Vec<PathBuf> {
    if !dir.exists() {
        return vec![];
    }

    let mut files = match std::fs::read_dir(dir) {
        Ok(entries) => entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|x| x.to_str()) == Some("json"))
            .collect::<Vec<_>>(),
        Err(_) => return vec![],
    };

    files.sort_by(|a, b| b.cmp(a));
    files
}

fn list_snapshot_files(
    workspace_path: &str,
    note_id: &str,
) -> Result<Vec<std::path::PathBuf>, String> {
    let dir = snapshot_dir_path(workspace_path, note_id)?;
    Ok(list_json_files_in_dir(&dir))
}

/// Build snapshot metadata for a set of snapshot files belonging to `note_id`.
/// Deliberately never reads or parses a snapshot file's JSON body: with up to
/// the retention limit (max 200) snapshots per note, doing so to produce a
/// plain listing (id/noteId/timestamps) meant parsing every snapshot's full
/// document just to list it.
/// Everything needed comes from the file name and filesystem metadata:
/// `createdAt` from the leading `%Y%m%d%H%M%S%3f` timestamp encoded in the
/// snapshot id (falling back to mtime if that fails to parse), and
/// `updatedAt` from mtime — a snapshot file is written once and never
/// modified afterward, so mtime is equivalent to the document's own
/// `updated_at` in practice.
fn build_snapshot_metas(note_id: &str, files: Vec<PathBuf>) -> Vec<NoteSnapshotMeta> {
    let mut snapshots = vec![];
    for path in files {
        let snapshot_id = match path.file_stem().and_then(|x| x.to_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let mtime = std::fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(|mtime| chrono::DateTime::<Utc>::from(mtime).to_rfc3339());
        let created_at = snapshot_timestamp(&path)
            .map(|naive| naive.and_utc().to_rfc3339())
            .or_else(|| mtime.clone())
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        let updated_at = mtime.unwrap_or_else(|| created_at.clone());
        snapshots.push(NoteSnapshotMeta {
            id: snapshot_id,
            note_id: note_id.to_string(),
            created_at,
            updated_at,
        });
    }
    snapshots
}

pub(crate) fn prune_note_snapshots_internal(
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

/// Effective per-note snapshot retention from the workspace settings file
/// (`files.snapshotRetentionCount`, normalized to 1..=200). Any read or parse
/// failure falls back to the documented default instead of failing a save.
pub(crate) fn snapshot_retention_limit(workspace_path: &str) -> usize {
    crate::commands::workspace::read_workspace_settings(&crate::commands::workspace::settings_path(
        workspace_path,
    ))
    .map(|settings| settings.files.snapshot_retention_count.clamp(1, 200) as usize)
    .unwrap_or(50)
}

/// Durably writes one new snapshot file and returns its id. Never prunes:
/// callers decide when pruning is safe (a restore prunes only after commit).
pub(crate) fn write_snapshot_bytes(
    workspace_path: &str,
    note_id: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let dir = snapshot_dir_path(workspace_path, note_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let snapshot_id = create_snapshot_id();
    let snapshot_path = snapshot_file_path(workspace_path, note_id, &snapshot_id)?;
    crate::commands::path_utils::write_atomic(&snapshot_path, bytes).map_err(|e| e.to_string())?;
    Ok(snapshot_id)
}

pub(crate) fn read_snapshot_raw(
    workspace_path: &str,
    note_id: &str,
    snapshot_id: &str,
) -> Result<String, String> {
    let snapshot_path = snapshot_file_path(workspace_path, note_id, snapshot_id)?;
    std::fs::read_to_string(&snapshot_path).map_err(|e| e.to_string())
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

    let content = serde_json::to_string(note).map_err(|e| e.to_string())?;
    write_snapshot_bytes(workspace_path, &note.id, content.as_bytes())?;
    prune_note_snapshots_internal(
        workspace_path,
        &note.id,
        snapshot_retention_limit(workspace_path),
    )
}

#[tauri::command]
pub async fn list_note_snapshots(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<NoteSnapshotMeta>, String> {
    tauri::async_runtime::spawn_blocking(move || list_note_snapshots_impl(workspace_path, note_id))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn list_note_snapshots_impl(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<NoteSnapshotMeta>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let files = list_snapshot_files(&workspace_path, &note_id)?;
    Ok(build_snapshot_metas(&note_id, files))
}

/// Collect snapshot metadata for every note in one filesystem pass, instead of
/// the frontend issuing one `list_note_snapshots` invoke per note (N+1 IPC
/// round trips when opening the history panel).
#[tauri::command]
pub async fn list_all_note_snapshots(
    workspace_path: String,
) -> Result<Vec<NoteSnapshotsEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_all_note_snapshots_impl(workspace_path))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn list_all_note_snapshots_impl(
    workspace_path: String,
) -> Result<Vec<NoteSnapshotsEntry>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let root = snapshots_root_path(&workspace_path);
    if !root.exists() {
        return Ok(vec![]);
    }

    let mut entries = vec![];
    let dirs = std::fs::read_dir(&root).map_err(|e| e.to_string())?;
    for dir_entry in dirs.flatten() {
        let dir_path = dir_entry.path();
        if !dir_path.is_dir() {
            continue;
        }
        let note_id = match dir_entry.file_name().to_str() {
            Some(id) => id.to_string(),
            None => continue,
        };
        let files = list_json_files_in_dir(&dir_path);
        let snapshots = build_snapshot_metas(&note_id, files);
        if snapshots.is_empty() {
            continue;
        }
        entries.push(NoteSnapshotsEntry { note_id, snapshots });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn load_note_snapshot(
    workspace_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<NoteDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        load_note_snapshot_impl(workspace_path, note_id, snapshot_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) fn load_note_snapshot_impl(
    workspace_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<NoteDocument, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let content = read_snapshot_raw(&workspace_path, &note_id, &snapshot_id)?;
    let mut note: NoteDocument = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    note.id = note_id;
    Ok(note)
}

#[tauri::command]
pub async fn prune_note_snapshots(workspace_path: String, note_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || prune_note_snapshots_impl(workspace_path, note_id))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn prune_note_snapshots_impl(
    workspace_path: String,
    note_id: String,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let limit = snapshot_retention_limit(&workspace_path);
    prune_note_snapshots_internal(&workspace_path, &note_id, limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempSnapshotDir {
        path: PathBuf,
    }

    impl TempSnapshotDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-snapshot-metas-{}", Uuid::new_v4()));
            std::fs::create_dir_all(&path).expect("create temp snapshot dir");
            Self { path }
        }

        /// Writes a snapshot file named `{stem}.json` with `body` as its raw
        /// contents — deliberately not valid `NoteDocument` JSON in most tests
        /// here, since `build_snapshot_metas` must never parse it.
        fn write_file(&self, stem: &str, body: &str) -> PathBuf {
            let file_path = self.path.join(format!("{stem}.json"));
            std::fs::write(&file_path, body).expect("write snapshot file");
            file_path
        }
    }

    impl Drop for TempSnapshotDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn build_snapshot_metas_never_reads_or_parses_file_contents() {
        let dir = TempSnapshotDir::new();
        let stem = "20260101120000000-11111111-1111-1111-1111-111111111111";
        // Deliberately invalid JSON: if `build_snapshot_metas` ever tried to
        // parse this as a `NoteDocument` it would fail to produce an entry.
        let path = dir.write_file(stem, "not valid json {{{");

        let metas = build_snapshot_metas("note-1", vec![path]);

        assert_eq!(metas.len(), 1);
        assert_eq!(metas[0].id, stem);
        assert_eq!(metas[0].note_id, "note-1");
        assert_eq!(metas[0].created_at, "2026-01-01T12:00:00+00:00");
    }

    #[test]
    fn build_snapshot_metas_preserves_newest_first_ordering() {
        let dir = TempSnapshotDir::new();
        let oldest = "20260101000000000-11111111-1111-1111-1111-111111111111";
        let middle = "20260102000000000-22222222-2222-2222-2222-222222222222";
        let newest = "20260103000000000-33333333-3333-3333-3333-333333333333";
        // Written out of chronological order to prove the result is sorted by
        // filename, not by write/creation order.
        dir.write_file(middle, "{}");
        dir.write_file(newest, "{}");
        dir.write_file(oldest, "{}");

        let files = list_json_files_in_dir(&dir.path);
        let metas = build_snapshot_metas("note-1", files);

        let ids: Vec<&str> = metas.iter().map(|meta| meta.id.as_str()).collect();
        assert_eq!(ids, vec![newest, middle, oldest]);
    }

    #[test]
    fn build_snapshot_metas_falls_back_to_mtime_when_stem_has_no_parseable_timestamp() {
        let dir = TempSnapshotDir::new();
        // No `%Y%m%d%H%M%S%3f`-shaped leading segment, so `snapshot_timestamp`
        // cannot parse a creation time out of the file name alone.
        let path = dir.write_file("legacy-snapshot-name", "{}");

        let metas = build_snapshot_metas("note-1", vec![path]);

        assert_eq!(metas.len(), 1);
        // Must still be a well-formed, parseable timestamp rather than being
        // dropped or left empty.
        assert!(chrono::DateTime::parse_from_rfc3339(&metas[0].created_at).is_ok());
        assert_eq!(metas[0].created_at, metas[0].updated_at);
    }
}
