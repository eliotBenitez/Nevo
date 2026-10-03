// Commits a snapshot restore's `note.json` write as a durable, crash-safe
// operation.
//
// A plain `write_atomic` call already makes a single write atomic, but the
// journal here still earns its keep across an interrupted restore: the
// staged temp file is recorded in a marker before the rename into place, so
// `recover_pending_restores` can always finish (or safely no-op) an
// interrupted commit on the next `open_workspace` rather than leaving a
// half-renamed tmp file behind.
//
// This journal format is also rolled forward generically: a marker written
// by an OLDER build of this module carries two entries (note.json AND the
// legacy authoritative `.yjs` Y.Doc state), and `recover_pending_restores`
// doesn't care how many entries a marker has — it just replays each staged
// tmp -> target rename. So a marker left over from before this module
// dropped the `.yjs` write still rolls the `.yjs` bytes into place on
// `.nevo/collab`, where the legacy migration (see `collab.rs`'s module
// comment) picks them up on the next workspace open.
//
// The marker also carries an optional `manifestMetaNoteId`: once the
// `note.json` rename is durable, `commit_note_restore` resyncs the
// workspace manifest's `title`/`icon`/`updatedAt` for that note from the
// now-authoritative file. That resync takes its own `manifest_lock` and can
// fail independently of the rename (e.g. a corrupt manifest); the marker is
// only removed once both steps succeed, so a resync failure leaves it behind
// for `recover_pending_restores` to retry. `sync_manifest_meta_from_note`
// always re-reads `note.json` from disk rather than trusting stale in-memory
// data, so replaying it late (possibly across several failed opens) can
// never write manifest meta older than what's already on disk.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::note_path;
use crate::commands::path_utils::{replace_file_durable, write_atomic, write_temp_sibling};

fn journal_dir(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo").join("journal")
}

fn journal_failed_dir(workspace_path: &str) -> PathBuf {
    journal_dir(workspace_path).join("failed")
}

fn journal_marker_path(workspace_path: &str, note_id: &str) -> PathBuf {
    journal_dir(workspace_path).join(format!("restore-{note_id}.json"))
}

#[derive(Debug, Serialize, Deserialize)]
struct JournalEntry {
    /// Staged temp file, relative to the workspace root.
    tmp: String,
    /// Final destination, relative to the workspace root.
    target: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RestoreMarker {
    entries: Vec<JournalEntry>,
    /// Note whose manifest `title`/`icon`/`updatedAt` should be resynced from
    /// `note.json` once the entries above have been replayed. Absent on
    /// markers written by older builds (or the legacy two-entry marker),
    /// which deserialize this as `None` and skip the resync, replaying
    /// exactly as before.
    #[serde(
        default,
        rename = "manifestMetaNoteId",
        skip_serializing_if = "Option::is_none"
    )]
    manifest_meta_note_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommitOutcome {
    /// note.json replaced, manifest meta synced, marker removed.
    Complete,
    /// note.json replaced (authoritative) but the manifest resync failed;
    /// the marker is kept so `recover_pending_restores` finishes it.
    ManifestPending,
}

/// Converts an absolute path known to be inside `workspace_path` into a
/// portable (forward-slash) relative string for storage in the marker.
fn relative_to_workspace(workspace_path: &str, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(workspace_path)
        .map_err(|_| "Path is not inside the workspace".to_string())?;
    Ok(relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/"))
}

/// Resolves a marker-recorded relative path against `workspace_path`,
/// rejecting anything that could escape the workspace root. The marker is our
/// own data, but it is read back from disk on recovery (e.g. after a crash),
/// so it gets the same defense-in-depth as any other on-disk input.
fn resolve_relative(workspace_path: &str, relative: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(relative);
    if candidate.is_absolute()
        || candidate
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err(format!("Journal entry path is unsafe: {relative}"));
    }
    Ok(Path::new(workspace_path).join(candidate))
}

fn cleanup_tmps(paths: &[&Path]) {
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}

/// A missing tmp file after a failed `replace_file_durable` means the rename
/// itself landed and only the post-rename durability flush failed — the
/// target already has the new content. A present tmp file means the rename
/// never happened at all.
fn rename_happened(note_tmp: &Path) -> bool {
    !note_tmp.exists()
}

/// Copies `title`/`icon`/`updatedAt` from the note file currently on disk
/// into the workspace manifest. Always re-reads `note.json` fresh (rather
/// than taking values from a caller) so a late or repeated replay (e.g. from
/// `recover_pending_restores` after several failed opens) can never write
/// manifest meta older than what's already authoritative on disk.
fn sync_manifest_meta_from_note(workspace_path: &str, note_id: &str) -> Result<(), String> {
    let raw =
        std::fs::read_to_string(note_path(workspace_path, note_id)?).map_err(|e| e.to_string())?;
    let note: super::NoteDocument = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if note.id != note_id {
        return Err(format!(
            "note.json id {} does not match expected {note_id}",
            note.id
        ));
    }
    let lock = crate::commands::folder::manifest_lock(workspace_path);
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let mut manifest = crate::commands::folder::load_manifest(workspace_path)?;
    super::update_note_meta_in_manifest(
        &mut manifest.root_notes,
        &mut manifest.tree,
        note_id,
        &note.title,
        &note.icon,
        &note.updated_at,
    );
    crate::commands::folder::save_manifest(workspace_path, &manifest)
}

/// Durably commits `note_json` to `note_path(workspace_path, note_id)` and
/// resyncs the workspace manifest's `title`/`icon`/`updatedAt` for the note:
/// the `note.json` rename happens only after a journal marker recording it
/// is itself durable on disk, so a crash at any point leaves either nothing
/// changed (marker never landed) or a resumable, idempotent recovery (marker
/// landed, `recover_pending_restores` finishes the rename and/or the
/// manifest resync on the next open).
///
/// `Err` means `note.json` is unchanged (a pre-commit failure — nothing was
/// staged, or staging failed before the point of no return). `Ok` means the
/// note was committed; the `CommitOutcome` says whether the manifest resync
/// also completed synchronously or was deferred to recovery.
///
/// Callers must hold `note_lock(workspace_path, note_id)` for the duration —
/// this function does not lock the note itself, so it can be composed with
/// the snapshot-file write that makes up a full restore. It takes the
/// manifest lock internally, only around the resync.
pub(crate) fn commit_note_restore(
    workspace_path: &str,
    note_id: &str,
    note_json: &[u8],
) -> Result<CommitOutcome, String> {
    let note_target = note_path(workspace_path, note_id)?;
    if let Some(dir) = note_target.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    let note_tmp = write_temp_sibling(&note_target, note_json).map_err(|e| e.to_string())?;

    let entries = (|| -> Result<Vec<JournalEntry>, String> {
        Ok(vec![JournalEntry {
            tmp: relative_to_workspace(workspace_path, &note_tmp)?,
            target: relative_to_workspace(workspace_path, &note_target)?,
        }])
    })();
    let entries = match entries {
        Ok(entries) => entries,
        Err(message) => {
            cleanup_tmps(&[&note_tmp]);
            return Err(message);
        }
    };

    let marker_dir = journal_dir(workspace_path);
    if let Err(error) = std::fs::create_dir_all(&marker_dir) {
        cleanup_tmps(&[&note_tmp]);
        return Err(error.to_string());
    }
    let marker_path = journal_marker_path(workspace_path, note_id);
    let marker_json = match serde_json::to_vec(&RestoreMarker {
        entries,
        manifest_meta_note_id: Some(note_id.to_string()),
    }) {
        Ok(json) => json,
        Err(error) => {
            cleanup_tmps(&[&note_tmp]);
            return Err(error.to_string());
        }
    };
    if let Err(error) = write_atomic(&marker_path, &marker_json) {
        cleanup_tmps(&[&note_tmp]);
        return Err(error.to_string());
    }

    // From here on, data is safe even on a crash: `recover_pending_restores`
    // can always finish the job from the marker alone. Do not delete the
    // tmp file or the marker on a failure past this point.
    if let Err(error) = replace_file_durable(&note_tmp, &note_target) {
        if !rename_happened(&note_tmp) {
            // Nothing was replaced: undo the staging so recovery never
            // applies it later.
            cleanup_tmps(&[&note_tmp]);
            if std::fs::remove_file(&marker_path).is_err() && marker_path.exists() {
                return Err(format!(
                    "{error}; the staged restore could not be cleaned up and may be applied on next open"
                ));
            }
            return Err(error.to_string());
        }
        // The rename landed; only its durability flush failed. The note
        // changed, so this is a committed restore, not a pre-commit failure.
    }

    match sync_manifest_meta_from_note(workspace_path, note_id) {
        Ok(()) => {
            // Best-effort cleanup: if this fails, the next
            // `recover_pending_restores` finds a marker whose tmp file is
            // already gone and just deletes it — no data is at risk either
            // way.
            let _ = std::fs::remove_file(&marker_path);
            Ok(CommitOutcome::Complete)
        }
        Err(message) => {
            // note.json is already authoritative; only the manifest resync
            // failed. Keep the marker so `recover_pending_restores` retries
            // the resync (its entries are already gone, so replay is a
            // no-op — only `manifest_meta_note_id` still has work to do).
            let logger = crate::logging::logger();
            let _ = logger.error(
                "tauri.note",
                "restore_note_snapshot",
                "Committed a restored note but failed to resync its manifest metadata; deferring to recovery",
                super::note_error_context(workspace_path, "manifest", message),
            );
            Ok(CommitOutcome::ManifestPending)
        }
    }
}

#[derive(Debug)]
enum RecoveryError {
    InvalidMarker(String),
    Retryable(String),
}

fn recover_marker(workspace_path: &str, marker_path: &Path) -> Result<(), RecoveryError> {
    let content = std::fs::read_to_string(marker_path)
        .map_err(|e| RecoveryError::Retryable(e.to_string()))?;
    let marker: RestoreMarker =
        serde_json::from_str(&content).map_err(|e| RecoveryError::InvalidMarker(e.to_string()))?;

    // Validate the whole marker before applying any rename. Otherwise an
    // unsafe later entry could quarantine the marker after earlier entries
    // had already been committed.
    let entries = marker
        .entries
        .iter()
        .map(|entry| {
            let tmp = resolve_relative(workspace_path, &entry.tmp)
                .map_err(RecoveryError::InvalidMarker)?;
            let target = resolve_relative(workspace_path, &entry.target)
                .map_err(RecoveryError::InvalidMarker)?;
            Ok((tmp, target))
        })
        .collect::<Result<Vec<_>, RecoveryError>>()?;
    if let Some(note_id) = marker.manifest_meta_note_id.as_deref() {
        crate::commands::path_utils::validate_id(note_id).map_err(RecoveryError::InvalidMarker)?;
    }

    for (tmp, target) in entries {
        if tmp.exists() {
            replace_file_durable(&tmp, &target)
                .map_err(|e| RecoveryError::Retryable(e.to_string()))?;
        }
        // If the tmp is already gone, this entry was committed by an earlier
        // (possibly interrupted) recovery pass — nothing left to do for it.
    }

    if let Some(note_id) = marker.manifest_meta_note_id.as_deref() {
        sync_manifest_meta_from_note(workspace_path, note_id).map_err(RecoveryError::Retryable)?;
    }

    std::fs::remove_file(marker_path).map_err(|e| RecoveryError::Retryable(e.to_string()))
}

fn quarantine_marker(workspace_path: &str, marker_path: &Path) {
    let failed_dir = journal_failed_dir(workspace_path);
    if std::fs::create_dir_all(&failed_dir).is_err() {
        return;
    }
    if let Some(name) = marker_path.file_name() {
        let _ = std::fs::rename(marker_path, failed_dir.join(name));
    }
}

/// Rolls forward any restore left mid-commit by a previous crash. Called once
/// on `open_workspace`; a failure here must never fail opening the workspace
/// — it only means that one note's restore (already visible as failed/partial
/// to whoever ran it) stays unresolved until a later open retries it. Only
/// malformed or unsafe markers are quarantined; I/O failures remain retryable.
///
/// Returns the number of marker files it attempted to process (whether they
/// succeeded, failed, or were quarantined). A marker's replay — and, when it
/// carries `manifest_meta_note_id`, its manifest resync — writes
/// `.nevo/workspace.json` directly to disk, bypassing whatever copy the
/// caller already has in memory. Any caller holding an in-memory manifest
/// read before this call must re-read it from disk when this returns > 0,
/// or it risks reporting stale data / clobbering the resync on its next
/// save.
pub(crate) fn recover_pending_restores(workspace_path: &str) -> Result<usize, String> {
    let dir = journal_dir(workspace_path);
    if !dir.exists() {
        return Ok(0);
    }

    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut processed = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() || path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        processed += 1;
        if let Err(error) = recover_marker(workspace_path, &path) {
            let (message, quarantine) = match error {
                RecoveryError::InvalidMarker(message) => (message, true),
                RecoveryError::Retryable(message) => (message, false),
            };
            let logger = crate::logging::logger();
            let _ = logger.error(
                "tauri.note",
                "recover_pending_restores",
                if quarantine {
                    "Invalid restore journal marker; quarantining it"
                } else {
                    "Failed to replay restore journal marker; keeping it for retry"
                },
                super::note_error_context(workspace_path, "journal", message),
            );
            if quarantine {
                quarantine_marker(workspace_path, &path);
            }
        }
    }
    Ok(processed)
}

#[cfg(test)]
mod tests {
    use super::super::collab::yjs_state_path;
    use super::*;
    use uuid::Uuid;

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("nevo-restore-journal-{}", Uuid::new_v4()));
            std::fs::create_dir_all(path.join("notes")).unwrap();
            std::fs::create_dir_all(path.join(".nevo").join("collab")).unwrap();
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn commits_the_note_file_and_leaves_no_journal_or_tmp_files() {
        // `commit_note_restore` now also resyncs manifest meta, so this
        // (unlike before) needs a real workspace/note fixture for that
        // resync to succeed — the original bare `{"restored":true}` body and
        // manifest-less TestDir can no longer deserialize as a NoteDocument.
        let (_dir, ws, id) = workspace_with_note("Before");
        let bytes = note_bytes(&ws, &id, "Restored");

        let outcome = commit_note_restore(&ws, &id, &bytes).expect("commit restore");
        assert_eq!(outcome, CommitOutcome::Complete);

        let note_target = note_path(&ws, &id).unwrap();
        assert_eq!(std::fs::read(&note_target).unwrap(), bytes);
        assert!(!journal_marker_path(&ws, &id).exists());

        let leftover = std::fs::read_dir(note_target.parent().unwrap())
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().contains(".tmp"));
        assert!(!leftover, "no tmp files should remain in the notes dir");
    }

    /// A marker written by an OLDER build of `commit_note_restore` (before it
    /// dropped the `.yjs` write) still carries two entries. `recover_marker`
    /// doesn't special-case the entry count, so both the note file and the
    /// legacy `.yjs` bytes roll forward together — the `.yjs` bytes landing
    /// back under `.nevo/collab` where the legacy migration in `collab.rs`
    /// picks them up on the next workspace open.
    #[test]
    fn recovery_rolls_a_crashed_commit_forward_including_a_legacy_two_entry_marker() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();

        let note_target = note_path(&workspace_path, "note-2").unwrap();
        let yjs_target = yjs_state_path(&workspace_path, "note-2").unwrap();
        std::fs::write(&note_target, b"old-note").unwrap();
        std::fs::write(&yjs_target, b"old-yjs").unwrap();

        // Simulate the crash point: tmp files staged and a marker written,
        // but neither rename has happened yet.
        let note_tmp = note_target.with_extension("nevo.crash.tmp");
        let yjs_tmp = yjs_target.with_extension("yjs.crash.tmp");
        std::fs::write(&note_tmp, b"new-note").unwrap();
        std::fs::write(&yjs_tmp, b"new-yjs").unwrap();
        let marker = RestoreMarker {
            entries: vec![
                JournalEntry {
                    tmp: relative_to_workspace(&workspace_path, &note_tmp).unwrap(),
                    target: relative_to_workspace(&workspace_path, &note_target).unwrap(),
                },
                JournalEntry {
                    tmp: relative_to_workspace(&workspace_path, &yjs_tmp).unwrap(),
                    target: relative_to_workspace(&workspace_path, &yjs_target).unwrap(),
                },
            ],
            manifest_meta_note_id: None,
        };
        let marker_path = journal_marker_path(&workspace_path, "note-2");
        std::fs::create_dir_all(marker_path.parent().unwrap()).unwrap();
        std::fs::write(&marker_path, serde_json::to_vec(&marker).unwrap()).unwrap();

        recover_pending_restores(&workspace_path).expect("recover");

        assert_eq!(std::fs::read(&note_target).unwrap(), b"new-note");
        assert_eq!(std::fs::read(&yjs_target).unwrap(), b"new-yjs");
        assert!(!marker_path.exists());
        assert!(!note_tmp.exists());
        assert!(!yjs_tmp.exists());
    }

    #[test]
    fn recovery_is_idempotent_when_a_rename_already_completed() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();

        let note_target = note_path(&workspace_path, "note-3").unwrap();
        let yjs_target = yjs_state_path(&workspace_path, "note-3").unwrap();
        // The note file was already renamed into place by a first, partially
        // successful recovery attempt; only the yjs tmp remains.
        std::fs::write(&note_target, b"already-committed").unwrap();
        let yjs_tmp = yjs_target.with_extension("yjs.crash.tmp");
        std::fs::write(&yjs_tmp, b"still-pending").unwrap();
        let note_tmp_gone = note_target.with_extension("nevo.crash.tmp"); // never existed

        let marker = RestoreMarker {
            entries: vec![
                JournalEntry {
                    tmp: relative_to_workspace(&workspace_path, &note_tmp_gone).unwrap(),
                    target: relative_to_workspace(&workspace_path, &note_target).unwrap(),
                },
                JournalEntry {
                    tmp: relative_to_workspace(&workspace_path, &yjs_tmp).unwrap(),
                    target: relative_to_workspace(&workspace_path, &yjs_target).unwrap(),
                },
            ],
            manifest_meta_note_id: None,
        };
        let marker_path = journal_marker_path(&workspace_path, "note-3");
        std::fs::create_dir_all(marker_path.parent().unwrap()).unwrap();
        std::fs::write(&marker_path, serde_json::to_vec(&marker).unwrap()).unwrap();

        recover_pending_restores(&workspace_path).expect("recover");

        assert_eq!(std::fs::read(&note_target).unwrap(), b"already-committed");
        assert_eq!(std::fs::read(&yjs_target).unwrap(), b"still-pending");
        assert!(!marker_path.exists());
    }

    #[test]
    fn a_marker_entry_escaping_the_workspace_is_quarantined_not_applied() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();

        let outside_target = std::env::temp_dir().join(format!("nevo-escape-{}", Uuid::new_v4()));
        let marker = RestoreMarker {
            entries: vec![JournalEntry {
                tmp: "notes/does-not-matter.tmp".to_string(),
                target: format!(
                    "../{}",
                    outside_target.file_name().unwrap().to_string_lossy()
                ),
            }],
            manifest_meta_note_id: None,
        };
        let marker_path = journal_marker_path(&workspace_path, "note-4");
        std::fs::create_dir_all(marker_path.parent().unwrap()).unwrap();
        std::fs::write(&marker_path, serde_json::to_vec(&marker).unwrap()).unwrap();

        recover_pending_restores(&workspace_path).expect("recover does not fail the open");

        assert!(
            !marker_path.exists(),
            "the unsafe marker should be moved out of the journal dir"
        );
        assert!(
            journal_failed_dir(&workspace_path)
                .join(marker_path.file_name().unwrap())
                .exists(),
            "the unsafe marker should be quarantined instead of silently dropped"
        );
        assert!(
            !outside_target.exists(),
            "nothing should have been written outside the workspace"
        );
    }

    #[test]
    fn an_invalid_later_entry_is_quarantined_before_any_entry_is_applied() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();
        let first_tmp = dir.path.join("notes").join("first.tmp");
        let first_target = dir.path.join("notes").join("first.nevo");
        std::fs::write(&first_tmp, b"new content").unwrap();
        std::fs::write(&first_target, b"old content").unwrap();
        let marker = RestoreMarker {
            entries: vec![
                JournalEntry {
                    tmp: relative_to_workspace(&workspace_path, &first_tmp).unwrap(),
                    target: relative_to_workspace(&workspace_path, &first_target).unwrap(),
                },
                JournalEntry {
                    tmp: "notes/second.tmp".to_string(),
                    target: "../outside.nevo".to_string(),
                },
            ],
            manifest_meta_note_id: None,
        };
        let marker_path = journal_marker_path(&workspace_path, "note-invalid-later");
        std::fs::create_dir_all(marker_path.parent().unwrap()).unwrap();
        std::fs::write(&marker_path, serde_json::to_vec(&marker).unwrap()).unwrap();

        recover_pending_restores(&workspace_path).unwrap();

        assert_eq!(std::fs::read(&first_target).unwrap(), b"old content");
        assert!(first_tmp.exists(), "validation must precede every rename");
        assert!(!marker_path.exists());
        assert!(journal_failed_dir(&workspace_path)
            .join(marker_path.file_name().unwrap())
            .exists());
    }

    #[test]
    fn a_malformed_marker_is_quarantined_not_deleted() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();

        let marker_path = journal_marker_path(&workspace_path, "note-5");
        std::fs::create_dir_all(marker_path.parent().unwrap()).unwrap();
        std::fs::write(&marker_path, b"not valid json").unwrap();

        recover_pending_restores(&workspace_path).expect("recover does not fail the open");

        assert!(!marker_path.exists());
        assert!(journal_failed_dir(&workspace_path)
            .join(marker_path.file_name().unwrap())
            .exists());
    }

    fn workspace_with_note(title: &str) -> (TestDir, String, String) {
        let dir = TestDir::new();
        let _ = std::fs::remove_dir_all(&dir.path);
        let ws = dir.path_string();
        crate::commands::workspace::create_workspace(
            ws.clone(),
            "J".into(),
            "J".into(),
            "violet".into(),
        )
        .expect("workspace");
        let note = super::super::create_note_impl(ws.clone(), None, title.into(), "📄".into())
            .expect("note");
        (dir, ws, note.id)
    }

    fn note_bytes(ws: &str, id: &str, title: &str) -> Vec<u8> {
        let mut note: super::super::NoteDocument =
            serde_json::from_slice(&std::fs::read(note_path(ws, id).unwrap()).unwrap()).unwrap();
        note.title = title.to_string();
        note.updated_at = "2030-01-01T00:00:00+00:00".to_string();
        serde_json::to_vec_pretty(&note).unwrap()
    }

    fn manifest_title(ws: &str, id: &str) -> String {
        let manifest = crate::commands::folder::load_manifest(ws).unwrap();
        manifest
            .root_notes
            .iter()
            .find(|n| n.id == id)
            .unwrap()
            .title
            .clone()
    }

    #[test]
    fn commit_replaces_the_note_and_resyncs_manifest_meta() {
        let (_dir, ws, id) = workspace_with_note("Before");
        let outcome = commit_note_restore(&ws, &id, &note_bytes(&ws, &id, "After")).unwrap();
        assert_eq!(outcome, CommitOutcome::Complete);
        assert_eq!(manifest_title(&ws, &id), "After");
        assert!(!journal_marker_path(&ws, &id).exists());
    }

    #[test]
    fn a_manifest_failure_after_the_rename_keeps_the_marker_and_recovery_finishes_it() {
        let (_dir, ws, id) = workspace_with_note("Before");
        // Real manifest path per `folder::load_manifest`/`save_manifest`:
        // `.nevo/workspace.json` (the brief's `.nevo/manifest.json` was a guess).
        let manifest_file = std::path::Path::new(&ws)
            .join(".nevo")
            .join("workspace.json");
        let good_manifest = std::fs::read(&manifest_file).unwrap();
        std::fs::write(&manifest_file, b"not json").unwrap();

        let outcome = commit_note_restore(&ws, &id, &note_bytes(&ws, &id, "After")).unwrap();
        assert_eq!(outcome, CommitOutcome::ManifestPending);
        let on_disk: serde_json::Value =
            serde_json::from_slice(&std::fs::read(note_path(&ws, &id).unwrap()).unwrap()).unwrap();
        assert_eq!(
            on_disk["title"], "After",
            "note.json is authoritative after the rename"
        );
        assert!(journal_marker_path(&ws, &id).exists());

        recover_pending_restores(&ws).unwrap();
        assert!(journal_marker_path(&ws, &id).exists());
        assert!(!journal_failed_dir(&ws)
            .join(format!("restore-{id}.json"))
            .exists());

        std::fs::write(&manifest_file, good_manifest).unwrap();
        recover_pending_restores(&ws).unwrap();
        assert_eq!(manifest_title(&ws, &id), "After");
        assert!(!journal_marker_path(&ws, &id).exists());
        // Idempotent: a second pass is a no-op.
        recover_pending_restores(&ws).unwrap();
        assert_eq!(manifest_title(&ws, &id), "After");
    }

    #[test]
    fn a_transient_target_error_keeps_marker_for_a_later_recovery() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();
        let tmp = dir.path.join("notes").join("restore.tmp");
        let target = dir
            .path
            .join("notes")
            .join("created-later")
            .join("note.json");
        std::fs::write(&tmp, b"restored note").unwrap();
        let marker = RestoreMarker {
            entries: vec![JournalEntry {
                tmp: relative_to_workspace(&workspace_path, &tmp).unwrap(),
                target: relative_to_workspace(&workspace_path, &target).unwrap(),
            }],
            manifest_meta_note_id: None,
        };
        let marker_path = journal_marker_path(&workspace_path, "note-retry");
        std::fs::create_dir_all(marker_path.parent().unwrap()).unwrap();
        std::fs::write(&marker_path, serde_json::to_vec(&marker).unwrap()).unwrap();

        recover_pending_restores(&workspace_path).unwrap();
        assert!(
            marker_path.exists(),
            "retryable failure keeps the marker active"
        );
        assert!(
            tmp.exists(),
            "failed rename leaves the staged note available"
        );
        assert!(!journal_failed_dir(&workspace_path)
            .join(marker_path.file_name().unwrap())
            .exists());

        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        recover_pending_restores(&workspace_path).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"restored note");
        assert!(!marker_path.exists());
    }

    #[test]
    fn a_marker_write_failure_leaves_the_note_unchanged() {
        let (_dir, ws, id) = workspace_with_note("Before");
        let before = std::fs::read(note_path(&ws, &id).unwrap()).unwrap();
        let journal = journal_dir(&ws);
        let _ = std::fs::remove_dir_all(&journal);
        std::fs::write(&journal, b"a file where the journal dir should be").unwrap();

        let result = commit_note_restore(&ws, &id, &note_bytes(&ws, &id, "After"));

        assert!(result.is_err());
        assert_eq!(std::fs::read(note_path(&ws, &id).unwrap()).unwrap(), before);
        let leftover_tmp = std::fs::read_dir(note_path(&ws, &id).unwrap().parent().unwrap())
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().contains(".tmp"));
        assert!(!leftover_tmp);
    }

    #[test]
    fn a_legacy_marker_without_manifest_field_still_deserializes() {
        let raw = br#"{"entries":[{"tmp":"notes/a.tmp","target":"notes/a.nevo"}]}"#;
        let marker: RestoreMarker = serde_json::from_slice(raw).unwrap();
        assert!(marker.manifest_meta_note_id.is_none());
        assert_eq!(marker.entries.len(), 1);
    }

    #[test]
    fn commit_reports_committed_when_the_tmp_is_gone_after_an_error() {
        // Unit-test the classification helper directly: after a failed
        // replace, a missing tmp means the rename happened.
        let dir = TestDir::new();
        let tmp = dir.path.join("gone.tmp");
        assert!(rename_happened(&tmp));
        std::fs::write(&tmp, b"x").unwrap();
        assert!(!rename_happened(&tmp));
    }
}
