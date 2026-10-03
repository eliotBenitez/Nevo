# History Screen Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make version history a safe recovery tool: every restore is reversible, the diff/preview tell the truth, retention follows Settings, and the screen is navigable and accessible.

**Architecture:** The Rust restore reads and validates the current `note.json`, writes it verbatim as a durable recovery snapshot, then journals the note replacement together with a manifest-metadata resync that recovery can replay idempotently. The note store puts a save barrier (flush + queued-save await) in front of the backend call. On the frontend, `src/utils/noteHistory.ts` compares canonicalized values, a new `src/utils/noteHistoryPreview.ts` builds a framework-agnostic preview tree, and `useNoteHistory` owns confirmation binding, retry, and copy rollback. The Vue components only render.

**Tech Stack:** Rust (Tauri v2, serde_json, chrono), Vue 3 `<script setup lang="ts">`, Pinia, vue-i18n, Vitest + @vue/test-utils, Tailwind `tw:` utilities.

**Spec:** `docs/superpowers/specs/2026-09-28-history-screen-reliability-design.md`

## Global Constraints

- `note.json` remains the sole source of truth. Snapshots remain full, immutable `NoteDocument` copies at `.nevo/snapshots/<noteId>/<%Y%m%d%H%M%S%3f>-<uuid>.json`. Keep the on-disk snapshot naming and the `NoteSnapshotMeta` shape (`id`, `noteId`, `createdAt`, `updatedAt`) unchanged.
- No persisted-schema migration, new authoritative store, plugin API change, collaboration/cloud code, or new runtime dependency.
- Retention: `files.snapshotRetentionCount`, integer 1–200, default 50. Missing, legacy, or unreadable settings resolve to 50.
- Snapshot throttle `SNAPSHOT_MIN_INTERVAL_SECS = 300` still applies to autosave snapshots. The restore recovery snapshot bypasses it.
- Rust: blocking filesystem work stays in `spawn_blocking` commands; no panics in command handlers; `cargo fmt` clean.
- TS/Vue: 2-space indentation, single quotes, no semicolons, strict TS, `<script setup lang="ts">`; route every user-facing string through vue-i18n in **all five** locales (`en`, `ru`, `fr`, `es`, `de`). Never round-trip `src/locales/*.json` through a JSON dumper; insert keys as text (use the `nevo-i18n-key` skill if present).
- `src/utils/**` stays framework-agnostic (no Vue, no I/O). No ProseMirror state in Pinia.
- Preview never mutates a snapshot, never executes plugin code, never uses `v-html`, and never renders an untrusted URL as a live link or loads a remote image.
- **Do not `git commit`.** The worktree already carries user-owned uncommitted changes in these same files (`src/stores/note.ts`, `src-tauri/src/commands/note/*`, and the untracked `src/features/history/`). Each task ends with a scoped-diff review instead of a commit. Never revert or reformat lines unrelated to the task.
- A new file approaching ~500 lines means the boundaries are wrong; split before continuing.

## Review Focus

1. **The current note is dirty in memory when Restore is pressed** (user typed, then opened history for the same note within 2 s). Expected: the edit is saved first and ends up in the recovery snapshot. Pinned in Task 5 (`persists a dirty active note before restoring`).
2. **Nested unknown fields in the current `note.json`** (e.g. `properties.priority` from a newer build). Expected: the recovery snapshot is a byte-exact copy, and the restored note keeps every current field it does not overwrite. Pinned in Task 3 (`recovery_snapshot_is_a_verbatim_copy_of_the_current_file`).
3. **Selecting another version while Confirm is visible, then pressing Enter on Confirm.** Expected: the confirmation closed on selection change, so nothing is restored. Pinned in Task 9 (`closes the confirmation when another version is selected`).
4. **A backend restore that succeeds with maintenance warnings** (manifest resync or prune failed). Expected: the UI reports success plus a separate warning, never "restore failed". Pinned in Task 9 (`reports post-commit warnings without calling the restore a failure`).
5. **A post-rename I/O error in the journal commit** (rename succeeded, directory fsync failed). Expected: the result reports a committed restore, not an unchanged note. Pinned in Task 2 (`commit_reports_committed_when_the_tmp_is_gone_after_an_error`).

---

## File Structure

| File | Status | Single responsibility |
| --- | --- | --- |
| `src-tauri/src/commands/note/snapshots.rs` | modify | Snapshot listing, loading, file writing, throttled autosave snapshot, settings-derived retention, prune command. Restore logic moves out. |
| `src-tauri/src/commands/note/snapshot_restore.rs` | **create** | `restore_note_snapshot` command: validate, recovery snapshot, merged document, journal commit, post-commit maintenance, result type. Includes its own `#[cfg(test)]` module. |
| `src-tauri/src/commands/note/restore_journal.rs` | modify | Journal marker gains an optional manifest-resync record; commit/recovery replay it idempotently; honest post-rename error handling. |
| `src-tauri/src/commands/note/mod.rs` | modify | Register `snapshot_restore` module + `pub use`. |
| `src-tauri/src/commands/note/tests.rs` | modify | Update the two existing restore tests to the new result/semantics. |
| `src/types/note.ts` | modify | Add `RestoreNoteSnapshotResult`, `RestoreWarning`. |
| `src/tauri/commands.ts`, `src/core/workspace-backend/{types,localBackend}.ts` | modify | Restore returns `RestoreNoteSnapshotResult`. |
| `src/stores/note.ts` | modify | Save barrier before restore; return the result. |
| `src/utils/noteHistory.ts` | modify | Canonical comparison, change details, properties/canvas metadata. |
| `src/utils/noteHistoryPreview.ts` | **create** | Framework-agnostic read-only preview tree for **As note**. |
| `src/features/history/HistoryPreviewBlock.vue` | **create** | Recursive renderer for one preview block. |
| `src/features/history/HistoryPreviewInline.vue` | **create** | Renders inline runs with marks, no live links. |
| `src/features/history/HistoryBlockContent.vue`, `HistoryDiffRow.vue`, `HistoryDiffRowChanged.vue`, `HistoryMetadataStrip.vue`, `HistoryDiffPane.vue` | modify | Present details/new fields/preview; accessible tabs. |
| `src/features/history/useNoteHistory.ts` | modify | Confirmation binding, retry, copy rollback, restore result handling. |
| `src/features/history/HistoryTopBar.vue`, `HistoryTimeline.vue`, `HistoryView.vue` | modify | Accessible back, bound confirmation layout, retry, recovery badge, live regions. |
| `src/app/WorkspaceShell.vue` | modify | Leaving history via Back / same-note sidebar click. |
| `src/locales/{en,ru,fr,es,de}.json` | modify | New `workspace.history.*` keys. |
| `docs/data-model.md`, `ARCHITECTURE.md`, `changes.md` | modify | Document restore/retention behavior; changelog after verification. |

---

## Package A — Durable restore and retention

### Task 1: Settings-derived retention and a non-pruning snapshot writer

**Files:**
- Modify: `src-tauri/src/commands/note/snapshots.rs`
- Test: `src-tauri/src/commands/note/tests.rs` (workspace-level tests), `snapshots.rs` `mod tests`

**Interfaces:**
- Produces (all `pub(crate)` in `snapshots.rs`):
  - `fn snapshot_retention_limit(workspace_path: &str) -> usize` — `files.snapshotRetentionCount` clamped 1..=200, `50` on any read/parse error.
  - `fn write_snapshot_bytes(workspace_path: &str, note_id: &str, bytes: &[u8]) -> Result<String, String>` — durable (`write_atomic`) write of a new snapshot file; returns its snapshot id; **never prunes**.
  - `fn prune_note_snapshots_internal(workspace_path: &str, note_id: &str, limit: usize) -> Result<(), String>` (existing, now `pub(crate)`).
  - `fn read_snapshot_raw(workspace_path: &str, note_id: &str, snapshot_id: &str) -> Result<String, String>` — validated path + `read_to_string`.
- `store_note_snapshot` keeps its signature and throttle but prunes to `snapshot_retention_limit`.

- [ ] **Step 1: Confirm the settings reader is reachable**

Run: `grep -n "mod paths\|pub(crate) use paths\|pub use paths" src-tauri/src/commands/workspace/mod.rs`
If `paths` is private, add `pub(crate) use paths::settings_path;` to `src-tauri/src/commands/workspace/mod.rs` (no other change). `read_workspace_settings` is already `pub(crate)` and re-exported via `pub use settings::*`.

- [ ] **Step 2: Write failing tests in `src-tauri/src/commands/note/tests.rs`**

```rust
fn write_retention_setting(workspace_path: &str, raw: serde_json::Value) {
    let path = crate::commands::workspace::settings_path(workspace_path);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, serde_json::to_vec(&raw).unwrap()).unwrap();
}

fn seed_snapshot_files(workspace_path: &str, note_id: &str, count: usize) {
    let dir = snapshots::snapshot_dir_path(workspace_path, note_id).unwrap();
    std::fs::create_dir_all(&dir).unwrap();
    for i in 0..count {
        let stem = format!("2020010100{:04}000-{}", i, Uuid::new_v4());
        std::fs::write(dir.join(format!("{stem}.json")), b"{}").unwrap();
    }
}

#[test]
fn retention_limit_follows_settings_and_defaults_to_fifty() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    let settings_file = crate::commands::workspace::settings_path(&path);
    let _ = std::fs::remove_file(&settings_file);
    assert_eq!(snapshots::snapshot_retention_limit(&path), 50, "missing settings");

    for (raw, expected) in [(1, 1), (12, 12), (50, 50), (200, 200), (0, 1), (999, 200)] {
        write_retention_setting(&path, json!({ "files": { "snapshotRetentionCount": raw } }));
        assert_eq!(snapshots::snapshot_retention_limit(&path), expected, "raw {raw}");
    }

    write_retention_setting(&path, json!({ "files": {} }));
    assert_eq!(snapshots::snapshot_retention_limit(&path), 50, "legacy settings");

    std::fs::write(&settings_file, b"not json").unwrap();
    assert_eq!(snapshots::snapshot_retention_limit(&path), 50, "unreadable settings");
}

#[test]
fn explicit_prune_uses_the_settings_limit() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    write_retention_setting(&path, json!({ "files": { "snapshotRetentionCount": 12 } }));
    seed_snapshot_files(&path, "note-prune", 20);

    prune_note_snapshots_impl(path.clone(), "note-prune".to_string()).expect("prune");

    let left = list_note_snapshots_impl(path, "note-prune".to_string()).unwrap();
    assert_eq!(left.len(), 12);
}

#[test]
fn autosave_snapshot_prunes_to_the_settings_limit() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    write_retention_setting(&path, json!({ "files": { "snapshotRetentionCount": 2 } }));
    let note = create_saved_note(&path);
    // Drop every fresh snapshot so the throttle window is clear, then seed
    // old-dated ones; the next save must snapshot and prune to 2.
    let dir = snapshots::snapshot_dir_path(&path, &note.id).unwrap();
    std::fs::remove_dir_all(&dir).unwrap();
    seed_snapshot_files(&path, &note.id, 5);

    save_note_impl(path.clone(), note.clone()).expect("save");

    assert_eq!(list_note_snapshots_impl(path, note.id).unwrap().len(), 2);
}
```

If `snapshots` is not reachable as a path from `tests.rs`, use `super::snapshots::…` — `tests.rs` is `mod tests` inside `note/mod.rs`, and `snapshots` is a private sibling module, which is visible to it.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml retention_limit explicit_prune autosave_snapshot_prunes`
Expected: compile error `cannot find function snapshot_retention_limit`.

- [ ] **Step 4: Implement in `snapshots.rs`**

Replace `write_note_snapshot` and adjust callers:

```rust
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
    // (existing throttle block unchanged)
    let content = serde_json::to_string(note).map_err(|e| e.to_string())?;
    write_snapshot_bytes(workspace_path, &note.id, content.as_bytes())?;
    prune_note_snapshots_internal(
        workspace_path,
        &note.id,
        snapshot_retention_limit(workspace_path),
    )
}
```

Make `prune_note_snapshots_internal` and `create_snapshot_id` `pub(crate)` only if another module needs them (Task 3 needs `prune_note_snapshots_internal`). Change `prune_note_snapshots_impl` to pass `snapshot_retention_limit(&workspace_path)` instead of `50`. Make `load_note_snapshot_impl` use `read_snapshot_raw`. Update the doc comment on `build_snapshot_metas` ("up to 50" → "up to the retention limit, max 200").

Leave `restore_note_snapshot` / `restore_note_snapshot_impl` in place for now (Task 3 moves them); only replace its `write_note_snapshot(&workspace_path, &note)` call with `write_snapshot_bytes(..., serde_json::to_string(&note)...)` so it compiles.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::note`
Expected: new tests PASS; existing note tests PASS.

- [ ] **Step 6: Format and review the scoped diff**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml && git diff --stat -- src-tauri/src/commands`
Expected: only `snapshots.rs`, `tests.rs` (and possibly `workspace/mod.rs`) changed by this task.

---

### Task 2: Journal marker with idempotent manifest resync and honest commit outcome

**Files:**
- Modify: `src-tauri/src/commands/note/restore_journal.rs`
- Test: same file `mod tests`

**Interfaces:**
- Consumes: `note_path`, `update_note_meta_in_manifest` (from `super`), `load_manifest`, `save_manifest`, `manifest_lock` (from `crate::commands::folder`), `NoteDocument`.
- Produces:
  ```rust
  #[derive(Debug, Clone, Copy, PartialEq, Eq)]
  pub(crate) enum CommitOutcome {
      /// note.json replaced, manifest meta synced, marker removed.
      Complete,
      /// note.json replaced (authoritative) but the manifest resync failed;
      /// the marker is kept so `recover_pending_restores` finishes it.
      ManifestPending,
  }
  /// Err => note.json is unchanged (pre-commit failure). Ok => committed.
  pub(crate) fn commit_note_restore(
      workspace_path: &str,
      note_id: &str,
      note_json: &[u8],
  ) -> Result<CommitOutcome, String>
  ```
  Callers hold `note_lock` for `note_id`. `commit_note_restore` takes `manifest_lock` internally only around the manifest resync.

Marker compatibility: add one field with `#[serde(default, rename = "manifestMetaNoteId", skip_serializing_if = "Option::is_none")] manifest_meta_note_id: Option<String>` to `RestoreMarker`. Old markers (one- or two-entry, no field) deserialize with `None` and replay exactly as today. Recovery resync reads the **current** `note.json` and copies its `title`/`icon`/`updatedAt` into the manifest, so replaying it late can never write stale tree data.

- [ ] **Step 1: Write failing tests** (append to `restore_journal.rs` tests; the `TestDir` there has no manifest, so add a helper that builds a real workspace)

```rust
fn workspace_with_note(title: &str) -> (TestDir, String, String) {
    let dir = TestDir::new();
    let _ = std::fs::remove_dir_all(&dir.path);
    let ws = dir.path_string();
    crate::commands::workspace::create_workspace(ws.clone(), "J".into(), "J".into(), "violet".into())
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
    manifest.root_notes.iter().find(|n| n.id == id).unwrap().title.clone()
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
    let manifest_file = std::path::Path::new(&ws).join(".nevo").join("manifest.json");
    // Locate the real manifest path if it differs: grep `fn manifest_path` in folder.rs.
    let good_manifest = std::fs::read(&manifest_file).unwrap();
    std::fs::write(&manifest_file, b"not json").unwrap();

    let outcome = commit_note_restore(&ws, &id, &note_bytes(&ws, &id, "After")).unwrap();
    assert_eq!(outcome, CommitOutcome::ManifestPending);
    let on_disk: serde_json::Value =
        serde_json::from_slice(&std::fs::read(note_path(&ws, &id).unwrap()).unwrap()).unwrap();
    assert_eq!(on_disk["title"], "After", "note.json is authoritative after the rename");
    assert!(journal_marker_path(&ws, &id).exists());

    std::fs::write(&manifest_file, good_manifest).unwrap();
    recover_pending_restores(&ws).unwrap();
    assert_eq!(manifest_title(&ws, &id), "After");
    assert!(!journal_marker_path(&ws, &id).exists());
    // Idempotent: a second pass is a no-op.
    recover_pending_restores(&ws).unwrap();
    assert_eq!(manifest_title(&ws, &id), "After");
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
```

Before running, open `src-tauri/src/commands/folder.rs` and use the real manifest path helper instead of the literal `".nevo/manifest.json"` guess.

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml restore_journal`
Expected: compile errors for `CommitOutcome`, `manifest_meta_note_id`, `rename_happened`.

- [ ] **Step 3: Implement**

```rust
fn rename_happened(note_tmp: &Path) -> bool {
    !note_tmp.exists()
}

/// Copies title/icon/updatedAt from the note file currently on disk into the
/// manifest. Reads note.json fresh so a late replay never writes stale meta.
fn sync_manifest_meta_from_note(workspace_path: &str, note_id: &str) -> Result<(), String> {
    let raw = std::fs::read_to_string(note_path(workspace_path, note_id)?).map_err(|e| e.to_string())?;
    let note: super::NoteDocument = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let lock = crate::commands::folder::manifest_lock(workspace_path);
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let mut manifest = crate::commands::folder::load_manifest(workspace_path)?;
    super::update_note_meta_in_manifest(
        &mut manifest.root_notes,
        &mut manifest.tree,
        &note.id,
        &note.title,
        &note.icon,
        &note.updated_at,
    );
    crate::commands::folder::save_manifest(workspace_path, &manifest)
}
```

In `commit_note_restore`: write the marker with `manifest_meta_note_id: Some(note_id.to_string())`. Replace the rename line with:

```rust
if let Err(error) = replace_file_durable(&note_tmp, &note_target) {
    if !rename_happened(&note_tmp) {
        // Nothing was replaced: undo the staging so recovery never applies it later.
        cleanup_tmps(&[&note_tmp]);
        if std::fs::remove_file(&marker_path).is_err() && marker_path.exists() {
            return Err(format!(
                "{error}; the staged restore could not be cleaned up and may be applied on next open"
            ));
        }
        return Err(error.to_string());
    }
    // The rename landed; only its durability flush failed. The note changed.
}
match sync_manifest_meta_from_note(workspace_path, note_id) {
    Ok(()) => {
        let _ = std::fs::remove_file(&marker_path);
        Ok(CommitOutcome::Complete)
    }
    Err(_) => Ok(CommitOutcome::ManifestPending),
}
```

In `recover_marker`, after replaying entries and before removing the marker:

```rust
if let Some(note_id) = marker.manifest_meta_note_id.as_deref() {
    crate::commands::path_utils::validate_id(note_id)?;
    sync_manifest_meta_from_note(workspace_path, note_id)?;
}
```

A resync error there returns `Err` → the existing path quarantines the marker (note.json is already authoritative; only manifest meta is stale, which the next `save_note` fixes). Update the module header comment to describe the manifest record. Keep all existing tests green (legacy two-entry marker test must still pass unchanged).

`snapshots.rs`'s current restore calls `commit_note_restore(...)?;` — adjust it to `let _ = commit_note_restore(...)?;` and delete its now-duplicate manifest block so the crate compiles; Task 3 replaces that function entirely.

- [ ] **Step 4: Run to verify pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::note`
Expected: PASS, including the three pre-existing recovery tests.

- [ ] **Step 5: Format and review**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml && git diff -- src-tauri/src/commands/note/restore_journal.rs | head -200`

---

### Task 3: Reversible restore command (`snapshot_restore.rs`)

**Files:**
- Create: `src-tauri/src/commands/note/snapshot_restore.rs`
- Modify: `src-tauri/src/commands/note/snapshots.rs` (delete `restore_note_snapshot` + `_impl` there), `src-tauri/src/commands/note/mod.rs` (`mod snapshot_restore;` + `pub use snapshot_restore::*;`), `src-tauri/src/commands/note/tests.rs` (update two existing restore tests)
- `src-tauri/src/lib.rs` keeps `note::restore_note_snapshot` — the name is unchanged, only its module moved.

**Interfaces:**
- Consumes: Task 1 `read_snapshot_raw`, `write_snapshot_bytes`, `prune_note_snapshots_internal`, `snapshot_retention_limit`; Task 2 `commit_note_restore -> Result<CommitOutcome, String>`; `note_lock`, `note_path`, `note_index::{upsert_note_document, folder_path_for_id}`, `load_manifest`.
- Produces (serialized camelCase to TS):
  ```rust
  #[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
  #[serde(rename_all = "camelCase")]
  pub enum RestoreWarning { ManifestPending, PruneFailed }

  #[derive(Debug, Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct RestoreNoteSnapshotResult {
      pub note: NoteDocument,
      pub recovery_snapshot_id: String,
      pub warnings: Vec<RestoreWarning>,
  }

  #[tauri::command]
  pub async fn restore_note_snapshot(workspace_path: String, note_id: String, snapshot_id: String)
      -> Result<RestoreNoteSnapshotResult, String>;
  pub(crate) fn restore_note_snapshot_impl(workspace_path: String, note_id: String, snapshot_id: String)
      -> Result<RestoreNoteSnapshotResult, String>;
  ```

**Algorithm (the order is the contract):**
1. `validate_id` both ids; normalize workspace path.
2. Read the snapshot raw text (`read_snapshot_raw`), parse to `serde_json::Value` **and** validate it deserializes into `NoteDocument`. Failure → `Err`, nothing touched.
3. Take `note_lock(workspace, note_id)` for the rest of the function.
4. Read the current `note.json` raw text. Missing, unreadable, not a JSON object, not deserializable into `NoteDocument`, `id` ≠ `note_id`, or `content.type` ≠ `"doc"` → `Err` (log it), nothing touched.
5. `write_snapshot_bytes(ws, note_id, current_raw.as_bytes())` → `recovery_snapshot_id`. This is the verbatim current file, so every nested unknown field survives. Failure → `Err`, note untouched.
6. Build the restored document on `serde_json::Value`: start from the **current** object; for each key in `["title", "icon", "cover", "properties", "content", "canvas"]` copy the snapshot's value when present, and **remove** the key when absent in the snapshot (so a snapshot without a cover/canvas really removes it); set `"updatedAt"` to `Utc::now().to_rfc3339()`. `id`, `createdAt`, `folderId`, and every other current key stay. Validate the merged value deserializes into `NoteDocument` (→ `restored`); serialize pretty.
7. `commit_note_restore(ws, note_id, payload)`. `Err` → return `Err` (note unchanged; the recovery snapshot remains as a harmless extra version). `Ok(ManifestPending)` → push `RestoreWarning::ManifestPending`.
8. After commit only: `prune_note_snapshots_internal(ws, note_id, snapshot_retention_limit(ws))`; error → log + `RestoreWarning::PruneFailed`. The recovery snapshot is the newest file, so it survives any limit ≥ 1. Do **not** write a snapshot of the restored state.
9. Best-effort index refresh: load manifest (ignore failure), `upsert_note_document(ws, &restored, &folder_path_for_id(...))`; on error log a warning only.
10. Return `RestoreNoteSnapshotResult { note: restored, recovery_snapshot_id, warnings }`.

Keep the existing logging style (`logger.error("tauri.note", "restore_note_snapshot", …)`).

- [ ] **Step 1: Write failing tests in `snapshot_restore.rs` `#[cfg(test)] mod tests`**

Reuse the workspace harness pattern from `tests.rs` (copy `TestWorkspace` locally or make the one in `tests.rs` `pub(super)` and import it — prefer the latter if it is a two-word change).

```rust
use super::*;
use crate::commands::note::{create_note_impl, list_note_snapshots_impl, load_note_snapshot_impl, note_path, save_note_impl};
use serde_json::json;

fn set_retention(ws: &str, n: u32) {
    let path = crate::commands::workspace::settings_path(ws);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, serde_json::to_vec(&json!({ "files": { "snapshotRetentionCount": n } })).unwrap()).unwrap();
}

fn doc(text: &str) -> serde_json::Value {
    json!({ "type": "doc", "content": [{ "type": "paragraph", "attrs": { "id": "b1" },
        "content": [{ "type": "text", "text": text, "marks": [{ "type": "strong" }] }] }] })
}

/// Saves version A (snapshotted), then writes B within the throttle window
/// (no snapshot), returning (note id, snapshot id of A).
fn a_then_b(ws: &str) -> (String, String) {
    let mut note = create_note_impl(ws.into(), None, "A title".into(), "🅰️".into()).unwrap();
    // Clear the create-time snapshot so A is the only one.
    let dir = crate::commands::note::snapshots::snapshot_dir_path(ws, &note.id).unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    note.content = doc("version A");
    save_note_impl(ws.into(), note.clone()).unwrap();
    let a_id = list_note_snapshots_impl(ws.into(), note.id.clone()).unwrap()[0].id.clone();
    // B: raw write with nested unknown fields + canvas + properties, bypassing save_note.
    let mut raw: serde_json::Value = serde_json::from_slice(&std::fs::read(note_path(ws, &note.id).unwrap()).unwrap()).unwrap();
    raw["title"] = json!("B title");
    raw["icon"] = json!("🅱️");
    raw["content"] = doc("version B");
    raw["properties"] = json!({ "type": "task", "tags": ["b"], "date": null, "status": "active", "futureNested": 7 });
    raw["canvas"] = json!({ "version": 1, "frame": { "x": 0, "y": 0, "width": 10, "height": 10 }, "elements": {}, "connectors": {}, "order": [] });
    raw["futureTopLevel"] = json!({ "keep": true });
    std::fs::write(note_path(ws, &note.id).unwrap(), serde_json::to_vec_pretty(&raw).unwrap()).unwrap();
    (note.id, a_id)
}
```

Check the real `CanvasSnapshotV1` Rust struct in `src-tauri/src/commands/note/canvas.rs` and make the `canvas` literal match its required fields.

Tests (one `#[test]` each):

- `restore_is_reversible_with_retention_two` — `set_retention(ws, 2)`; `a_then_b`; `let b_bytes = read(note_path)`; restore A → `result.note.title == "A title"`, content equals `doc("version A")`; the recovery snapshot file's bytes equal `b_bytes` exactly (`read_snapshot_raw`); snapshot list = `[recovery, A]` (2 entries, recovery newest).
- `restore_with_retention_one_keeps_only_the_pre_restore_state` — `set_retention(ws, 1)`; restore A → list has exactly 1 entry whose id is `result.recovery_snapshot_id`; restoring *that* id brings back B's title, icon, content, properties (including `futureNested`), and canvas.
- `recovery_snapshot_is_a_verbatim_copy_of_the_current_file` — assert byte equality and that `futureTopLevel` and `properties.futureNested` are present in the recovery snapshot raw JSON.
- `restore_keeps_identity_placement_and_unknown_current_fields` — put the note in a folder (`crate::commands::folder::create_folder_sync` then `move_note` or construct with `create_note_impl(ws, Some(folder_id), …)`); after restore the on-disk JSON has the same `id`, `createdAt`, `folderId`, still has `futureTopLevel`, and the manifest still lists the note under the same folder.
- `restore_removes_fields_absent_in_the_snapshot` — B has `cover` and `canvas`, A has neither → restored JSON has no `cover`/`canvas` keys.
- `restore_aborts_without_touching_a_malformed_current_note` — overwrite `note.json` with `b"{ not json"`; restore → `Err`; file bytes unchanged; snapshot count unchanged.
- `restore_aborts_when_the_current_note_is_missing` — delete `note.json`; restore → `Err`; no new snapshot.
- `restore_aborts_when_the_recovery_snapshot_cannot_be_written` — after `a_then_b`, make the note's snapshot directory unwritable by replacing it: move the A snapshot bytes aside, `remove_dir_all(dir)`, write a regular *file* at `dir`… this makes reading A fail too, so instead: read A's id, then `std::fs::set_permissions(&dir, 0o555)` under `#[cfg(unix)]` (restore permissions before the workspace drops). Assert `Err` and `note.json` unchanged.
- `restore_reports_prune_failure_as_a_warning_after_commit` — `set_retention(ws, 1)`; create a *directory* named `00000000000000000-dead.json` inside the snapshot dir (sorts oldest; `remove_file` fails on it); restore A → `Ok`, `warnings == [PruneFailed]`, note.json has A's content.
- `restore_reports_manifest_pending_and_recovery_completes_it` — corrupt the manifest file before restore; → `Ok`, `warnings` contains `ManifestPending`; restore the manifest bytes; `recover_pending_restores(ws)`; manifest title == "A title".
- `restore_refreshes_the_note_index` — after restore, query the index the way `note_index` tests do (see `src-tauri/src/commands/note_index/` tests for the helper) and assert the indexed title is "A title". If no reusable query helper exists, assert via `note_index::query::query_notes_impl` with a title filter.

Update in `tests.rs`: `restore_note_snapshot_creates_a_fresh_latest_snapshot` → rename to `restore_note_snapshot_adds_a_pre_restore_recovery_snapshot`, assert the newest snapshot id equals `restored.recovery_snapshot_id` and its content is the "Overwritten body"; the `.yjs` test just adapts `restored.note.content`.

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml snapshot_restore`
Expected: compile failure (module does not exist).

- [ ] **Step 3: Implement `snapshot_restore.rs`** following the algorithm above. Keep helpers small: `fn read_current_note(ws, note_id) -> Result<(String, serde_json::Map<String, Value>), String>`, `fn merge_restored(current: &Map, snapshot: &Map, updated_at: &str) -> Map`, `fn validate_note_value(value: &Value, note_id: &str) -> Result<NoteDocument, String>`. Target < 350 lines including tests; if tests push it past ~500, move tests into `src-tauri/src/commands/note/snapshot_restore_tests.rs` with `#[cfg(test)] #[path = "snapshot_restore_tests.rs"] mod tests;`.

- [ ] **Step 4: Run to verify pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::note`
Expected: all PASS.

- [ ] **Step 5: Format, full Rust check, review**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml --check && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: clean format; full suite PASS (report any pre-existing unrelated failure separately with its output).

---

### Task 4: TypeScript contract for the restore result

**Files:**
- Modify: `src/types/note.ts`, `src/tauri/commands.ts:406-407`, `src/core/workspace-backend/types.ts:134`, `src/core/workspace-backend/localBackend.ts:177-178`
- Test: `src/tauri/commands.test.ts` if it exists (check with `ls src/tauri/*.test.ts`); otherwise the store test in Task 5 covers it.

**Interfaces:**
- Produces:
  ```ts
  export type RestoreWarning = 'manifestPending' | 'pruneFailed'
  export interface RestoreNoteSnapshotResult {
    note: NoteDocument
    recoverySnapshotId: string
    warnings: RestoreWarning[]
  }
  // WorkspaceBackend
  restoreNoteSnapshot(noteId: string, snapshotId: string): Promise<RestoreNoteSnapshotResult>
  ```

- [ ] **Step 1:** Add the types to `src/types/note.ts` after `NoteSnapshotMeta`.
- [ ] **Step 2:** Change the wrapper generic to `invokeCommand<RestoreNoteSnapshotResult>('restore_note_snapshot', { workspacePath, noteId, snapshotId })` (payload casing unchanged — verified against Rust arg names `workspace_path`, `note_id`, `snapshot_id`), and the two backend signatures.
- [ ] **Step 3:** Run `pnpm exec vue-tsc --noEmit` — expected failures only in `src/stores/note.ts` / tests that Task 5 fixes. Do not fix them here beyond the types.

---

### Task 5: Save barrier in `noteStore.restoreSnapshot`

**Files:**
- Modify: `src/stores/note.ts:441-490`
- Test: `src/stores/note.test.ts` (`describe('restoreSnapshot')`)

**Interfaces:**
- Consumes: Task 4 `RestoreNoteSnapshotResult`.
- Produces: `restoreSnapshot(noteId: string, snapshotId: string): Promise<RestoreNoteSnapshotResult>`. Throws (and leaves disk untouched) if the pre-restore save fails.

Behavior for the active note:
1. `await persistActiveNote()` — flushes the editor session's pending content, and if dirty enqueues and **awaits** the queued save (covers an in-flight autosave too). If it throws, set `saveStatus = 'error'`, log, rethrow; the backend restore is never called.
2. `suspendEditorPersistence(noteId)`.
3. Backend restore.
4. `finally`: `loadNote(noteId, { force: true })` (bumps `noteSessionToken`, so any queued save closure or later autosave tick for the pre-restore session is a no-op because `isDirty` is false and the token no longer matches).

For a non-active note: unchanged (no save barrier needed; its content is on disk).

After success: `invalidateNoteCache(noteId)`, `useTreeStore().syncNoteMeta(result.note.id, { title, icon }, result.note.updatedAt)`, `void workspaceStore.refreshSidebarNotePreviews()`, return `result`.

- [ ] **Step 1: Write failing tests** (adapt the three existing restore tests to return `{ note: restored, recoverySnapshotId: 'rec-1', warnings: [] }` and assert `result.note`), then add:

```ts
it('persists a dirty active note before restoring', async () => {
  const mockedNoteCommands = vi.mocked(noteCommands)
  const order: string[] = []
  mockedNoteCommands.saveNote.mockImplementation(async () => { order.push('save') })
  mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded'))
  vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot').mockImplementation(async () => {
    order.push('restore')
    return { note: createNote('note-1', 'Restored'), recoverySnapshotId: 'rec-1', warnings: [] }
  })
  const noteStore = useNoteStore()
  noteStore.activeNote = createNote('note-1', 'Saved')
  noteStore.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unsaved edit' }] }] })

  await noteStore.restoreSnapshot('note-1', 'snapshot-1')

  expect(order).toEqual(['save', 'restore'])
  const saved = mockedNoteCommands.saveNote.mock.calls[0]![1] as NoteDocument
  expect(saved.content.content?.[0]?.content?.[0]?.text).toBe('Unsaved edit')
})

it('does not call the backend restore when the pre-restore save fails', async () => {
  const mockedNoteCommands = vi.mocked(noteCommands)
  mockedNoteCommands.saveNote.mockRejectedValue(new Error('disk full'))
  mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded'))
  const restoreSpy = vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
  const noteStore = useNoteStore()
  noteStore.activeNote = createNote('note-1', 'Saved')
  noteStore.markContentDirty()

  await expect(noteStore.restoreSnapshot('note-1', 'snapshot-1')).rejects.toThrow('disk full')

  expect(restoreSpy).not.toHaveBeenCalled()
  expect(suspendEditorPersistence).not.toHaveBeenCalled()
})

it('waits for an in-flight save before restoring', async () => {
  const mockedNoteCommands = vi.mocked(noteCommands)
  const inFlight = deferred<void>()
  mockedNoteCommands.saveNote.mockReturnValueOnce(inFlight.promise)
  mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded'))
  const restoreSpy = vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
    .mockResolvedValue({ note: createNote('note-1', 'Restored'), recoverySnapshotId: 'rec-1', warnings: [] })
  const noteStore = useNoteStore()
  noteStore.activeNote = createNote('note-1', 'Saved')
  noteStore.markContentDirty()
  const autosave = noteStore.saveNote()

  const restoring = noteStore.restoreSnapshot('note-1', 'snapshot-1')
  await Promise.resolve(); await Promise.resolve()
  expect(restoreSpy).not.toHaveBeenCalled()

  inFlight.resolve()
  await autosave
  await restoring
  expect(restoreSpy).toHaveBeenCalledTimes(1)
})

it('a stale autosave tick after restore does not overwrite the restored note', async () => {
  const mockedNoteCommands = vi.mocked(noteCommands)
  mockedNoteCommands.saveNote.mockResolvedValue(undefined)
  mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Restored from disk'))
  vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
    .mockResolvedValue({ note: createNote('note-1', 'Restored'), recoverySnapshotId: 'rec-1', warnings: [] })
  const noteStore = useNoteStore()
  noteStore.activeNote = createNote('note-1', 'Saved')
  noteStore.markContentDirty()

  await noteStore.restoreSnapshot('note-1', 'snapshot-1')
  mockedNoteCommands.saveNote.mockClear()
  await noteStore.saveNote() // what useNotePersistence's timer would do

  expect(mockedNoteCommands.saveNote).not.toHaveBeenCalled()
  expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('Restored from disk')
})
```

Check the `noteCommands.saveNote` call signature in `src/tauri/commands.ts` and adjust `mock.calls[0]![1]` to the argument index that holds the note.

- [ ] **Step 2:** Run `pnpm exec vitest run src/stores/note.test.ts` — expected: new tests FAIL (`order` is `['restore']`, backend called after failed save).
- [ ] **Step 3:** Implement per the behavior list. Replace the hand-rolled flush in the `isActive` branch with `await persistActiveNote()` inside a `try` that logs `event: 'restore_snapshot_presave'` on failure and rethrows. Update the doc comment. Keep the `finally` reload.
- [ ] **Step 4:** Run `pnpm exec vitest run src/stores/note.test.ts src/core/document-session` — expected PASS.
- [ ] **Step 5:** Run `pnpm exec eslint src/stores/note.ts src/stores/note.test.ts src/types/note.ts src/tauri/commands.ts src/core/workspace-backend` and review `git diff -- src/stores/note.ts`.

---

### Task 6: Persistence docs

**Files:** `docs/data-model.md`, `ARCHITECTURE.md`

- [ ] **Step 1:** In `docs/data-model.md`, find the snapshots / restore journal section (`grep -n -i "snapshot\|journal" docs/data-model.md`) and document: retention comes from `files.snapshotRetentionCount` (1–200, default 50) for both autosave and explicit prune; restore writes a verbatim pre-restore recovery snapshot before the journaled replacement, never snapshots the restored state, preserves `id`/`createdAt`/`folderId` and unknown current fields, removes snapshot-absent `cover`/`canvas`; journal markers may carry `manifestMetaNoteId` (optional; older one/two-entry markers still replay); recovery resyncs manifest title/icon/updatedAt from `note.json`.
- [ ] **Step 2:** In `ARCHITECTURE.md`, update the note save/restore flow paragraph (search `restore`) to mention the store's save barrier (`persistActiveNote` → suspend → backend → forced reload) and the `RestoreNoteSnapshotResult` warnings.
- [ ] **Step 3:** `git diff --check -- docs ARCHITECTURE.md`.

---

## Package B — Truthful comparison and preview

### Task 7: Semantic diff, change details, properties and canvas metadata

**Files:**
- Modify: `src/utils/noteHistory.ts`
- Test: `src/utils/noteHistory.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HistoryMetadataField =
    | 'title' | 'icon' | 'cover'
    | 'propertiesType' | 'propertiesTags' | 'propertiesDate' | 'propertiesStatus'
    | 'canvas'
  export interface HistoryDiffMetadataChange {
    field: HistoryMetadataField
    currentValue: string | null
    snapshotValue: string | null
    /** canvas only: element/connector counts equal but layout/content differs */
    layoutOnly?: boolean
  }
  export type HistoryBlockChangeKind = 'text' | 'type' | 'attrs' | 'marks' | 'structure'
  export interface HistoryComparableBlock {
    type: string
    label: string
    text: string            // collected inline text ('' for atoms)
    signature: string       // canonical, key-order independent
    attrs: Record<string, unknown>
  }
  export interface NormalizedDiffBlockRow {
    kind: 'added' | 'removed' | 'changed' | 'unchanged'
    current: HistoryComparableBlock | null
    snapshot: HistoryComparableBlock | null
    /** only for kind 'changed' with both sides */
    changes?: HistoryBlockChangeKind[]
    /** attr keys whose values differ, sorted; only when changes includes 'attrs' */
    changedAttrs?: string[]
  }
  export function canonicalJson(value: unknown): string
  export function summarizeCanvas(canvas: NoteDocument['canvas']): string | null  // e.g. "3/1" = elements/connectors, null when absent
  ```
  `buildNoteHistoryDiff`, `normalizeHistoryBlocks`, `pickInitialHistoryNoteId`, `filterHistoryFiles` keep their names.

Rules:
- `canonicalJson`: recursively sort object keys; drop `undefined` values; arrays keep order. For block payloads, treat `attrs` that is `{}`/`null`/missing as the same, and `marks` that is `[]`/`null`/missing as the same.
- Block signature = `canonicalJson({ type, attrs, marks, text, content })` after that normalization (content recursively normalized the same way).
- Change detection for a changed pair: `type` differs → `'type'`; text differs → `'text'`; canonical attrs differ → `'attrs'` (+ `changedAttrs`); canonical marks anywhere in the subtree differ while text is equal → `'marks'`; otherwise (child structure differs, e.g. list items reordered, checklist toggled inside a list) → `'structure'`. The existing `label` fallback stays.
- Metadata: title/icon/cover as today; properties via `normalizeProperties`-equivalent (trim, drop empty, tags joined with `', '`, `null` when empty); canvas: compare `canonicalJson(canvas ?? null)`; if different emit `{ field: 'canvas', currentValue: summarizeCanvas(current), snapshotValue: summarizeCanvas(snapshot), layoutOnly: summaries equal }`.
- `buildNoteHistoryDiff` returns `rows: []` when all rows are unchanged (unchanged), metadata may still be non-empty.

- [ ] **Step 1: Write failing tests**

```ts
describe('semantic comparison', () => {
  const para = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'paragraph', attrs: { id: 'b1', align: null }, content: [{ type: 'text', text }], ...extra })
  const reordered = (text: string) => ({ content: [{ text, type: 'text' }], attrs: { align: null, id: 'b1' }, type: 'paragraph' })

  it('ignores object key order', () => {
    const current = note({ content: { type: 'doc', content: [para('Same')] } })
    const snapshot = note({ content: { content: [reordered('Same')], type: 'doc' } as never })
    const diff = buildNoteHistoryDiff(current, snapshot)
    expect(diff.rows).toEqual([])
    expect(diff.metadata).toEqual([])
  })

  it('treats empty attrs and marks as absent', () => {
    const a = note({ content: { type: 'doc', content: [{ type: 'paragraph', attrs: {}, marks: [], content: [{ type: 'text', text: 'x' }] }] } })
    const b = note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } })
    expect(buildNoteHistoryDiff(a, b).rows).toEqual([])
  })

  it('explains a formatting-only change', () => {
    const current = note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold', marks: [{ type: 'strong' }] }] }] } })
    const snapshot = note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold' }] }] } })
    const [row] = buildNoteHistoryDiff(current, snapshot).rows
    expect(row).toMatchObject({ kind: 'changed', changes: ['marks'] })
  })

  it('explains a block type change and an attribute change', () => {
    const typeDiff = buildNoteHistoryDiff(
      note({ content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] }] } }),
      note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'T' }] }] } }),
    )
    expect(typeDiff.rows[0]).toMatchObject({ kind: 'changed', changes: expect.arrayContaining(['type']) })

    const attrDiff = buildNoteHistoryDiff(
      note({ content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] }] } }),
      note({ content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'T' }] }] } }),
    )
    expect(attrDiff.rows[0]).toMatchObject({ kind: 'changed', changes: ['attrs'], changedAttrs: ['level'] })
  })

  it('reports a checklist toggle as a change', () => {
    const item = (checked: boolean) => ({ type: 'checklist_item', attrs: { checked }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task' }] }] })
    const diff = buildNoteHistoryDiff(
      note({ content: { type: 'doc', content: [item(true)] } }),
      note({ content: { type: 'doc', content: [item(false)] } }),
    )
    expect(diff.rows[0]).toMatchObject({ kind: 'changed', changes: ['attrs'], changedAttrs: ['checked'] })
  })

  it('reports every property field and canvas', () => {
    const current = note({ properties: { type: 'task', tags: ['a', 'b'], date: '2026-09-28', status: 'active' }, canvas: canvasWith(2) })
    const snapshot = note({ properties: { type: 'note', tags: ['a'], date: null, status: null } })
    const fields = buildNoteHistoryDiff(current, snapshot).metadata.map(change => change.field)
    expect(fields).toEqual(['propertiesType', 'propertiesTags', 'propertiesDate', 'propertiesStatus', 'canvas'])
  })

  it('flags a canvas layout-only change', () => {
    const moved = canvasWith(1); moved.elements[Object.keys(moved.elements)[0]!]!.x = 999
    const change = buildNoteHistoryDiff(note({ canvas: moved }), note({ canvas: canvasWith(1) })).metadata[0]
    expect(change).toMatchObject({ field: 'canvas', layoutOnly: true })
  })

  it('an identical note has no metadata and no rows', () => {
    const n = note({ properties: { type: 'task', tags: ['a'], date: null, status: 'done' }, canvas: canvasWith(1) })
    expect(buildNoteHistoryDiff(n, structuredClone(n))).toEqual({ metadata: [], rows: [] })
  })
})
```

Define `note(overrides)` and `canvasWith(count)` helpers at the top of the test file; build `canvasWith` from the real `CanvasSnapshotV1`/`CanvasElement` shape in `src/core/canvas/types.ts` (look up the element's position field names and fix `.x` above accordingly). Update the existing `reports top-level metadata changes` test if it asserted the exact metadata array.

- [ ] **Step 2:** `pnpm exec vitest run src/utils/noteHistory.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Keep `noteHistory.ts` < ~400 lines; if detail detection makes it grow past that, move `canonicalJson` + block normalization into `src/utils/noteHistoryCanonical.ts`.
- [ ] **Step 4:** Re-run → PASS. Run `pnpm exec eslint src/utils/noteHistory.ts src/utils/noteHistory.test.ts`.

---

### Task 8: Read-only preview model (`noteHistoryPreview.ts`) and renderers

**Files:**
- Create: `src/utils/noteHistoryPreview.ts`, `src/utils/noteHistoryPreview.test.ts`
- Create: `src/features/history/HistoryPreviewBlock.vue`, `src/features/history/HistoryPreviewInline.vue`, `src/features/history/HistoryPreviewBlock.test.ts`
- Modify: `src/features/history/HistoryDiffPane.vue` (As-note branch), `src/features/history/useNoteHistory.ts` (`previewBlocks` source), `src/features/history/HistoryDiffRowChanged.vue`, `HistoryDiffRow.vue`, `HistoryMetadataStrip.vue`
- Modify locales: `src/locales/{en,ru,fr,es,de}.json`

**Interfaces:**
- Produces:
  ```ts
  export interface HistoryInlineRun {
    kind: 'text' | 'break' | 'math' | 'atom'
    text: string
    marks: Array<'strong' | 'em' | 'code' | 'strike' | 'underline' | 'highlight' | 'link' | 'superscript' | 'subscript'>
    /** link target, shown as text only — never rendered as a live anchor */
    href?: string
  }
  export type HistoryPreviewBlock =
    | { kind: 'paragraph'; runs: HistoryInlineRun[] }
    | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; runs: HistoryInlineRun[] }
    | { kind: 'quote'; children: HistoryPreviewBlock[] }
    | { kind: 'code'; language: string | null; text: string }
    | { kind: 'list'; ordered: boolean; items: HistoryPreviewBlock[][] }
    | { kind: 'checklist'; checked: boolean; children: HistoryPreviewBlock[] }
    | { kind: 'callout'; variant: string | null; icon: string | null; children: HistoryPreviewBlock[] }
    | { kind: 'toggle'; title: HistoryInlineRun[]; children: HistoryPreviewBlock[] }
    | { kind: 'table'; rows: Array<Array<{ header: boolean; blocks: HistoryPreviewBlock[] }>> }
    | { kind: 'image'; src: string | null; alt: string; caption: string; external: boolean }
    | { kind: 'divider' }
    | { kind: 'math'; latex: string }
    | { kind: 'unsupported'; type: string; text: string }
  export function buildHistoryPreview(content: BlockNode): HistoryPreviewBlock[]
  ```
- `useNoteHistory` returns `previewBlocks: ComputedRef<HistoryPreviewBlock[]>` built from `buildHistoryPreview(structuredClone-free read of selectedSnapshot.content)` — the builder only reads.
- Image rules: `src` starting with `data:image/` → keep; relative workspace path (no scheme) → keep (component resolves with `workspaceAssetUrl`); anything else (`http(s):`, `file:`, `javascript:` …) → `src: null, external: true` and show the URL as text.
- Node mapping (verify names in `src/editor-core/schema/`): `paragraph`, `heading`, `blockquote`, `code_block`, `bullet_list`/`ordered_list` with `list_item`, `checklist_item` (`attrs.checked`), `callout` (`attrs.variant`, `attrs.icon`), `toggle` with `toggle_title`, `table`/`table_row`/`table_cell`/`table_header`, `image_block` (`src`, `alt`, `caption`), `divider`/`horizontal_rule`, `math_block` (`latex`). Everything else (`mermaid_block`, `database_block`, `media_block`, plugin blocks, …) → `unsupported` with collected text.
- Mark mapping: `strong`, `em`, `code`, `strike`, `underline`, `highlight`, `link` (`attrs.href`), `superscript`, `subscript`; other marks are dropped from `marks` (text kept).

- [ ] **Step 1: Write failing util tests** covering: checklist checked state; nested bullet list; callout variant + children; table with header row; image with workspace src vs `https://…` (external, `src: null`) vs `javascript:` (external); bold+link run with `href`; unknown `plugin_x_block` → `unsupported` with its text; builder does not mutate input (`const input = …; const copy = structuredClone(input); buildHistoryPreview(input); expect(input).toEqual(copy)`).
- [ ] **Step 2:** `pnpm exec vitest run src/utils/noteHistoryPreview.test.ts` → FAIL.
- [ ] **Step 3:** Implement `noteHistoryPreview.ts` (pure functions, one `switch` per node type).
- [ ] **Step 4: Components**
  - `HistoryPreviewInline.vue` — props `runs: HistoryInlineRun[]`; renders each run as nested `<strong>/<em>/<code>/<s>/<u>/<mark>/<sup>/<sub>` using text interpolation only; a `link` run renders its text with `tw:underline` plus a muted `(href)` suffix in a `<span>`; no `<a>`, no `v-html`.
  - `HistoryPreviewBlock.vue` — props `block: HistoryPreviewBlock`; recursive (`defineOptions({ name: 'HistoryPreviewBlock' })`). Checklist renders a disabled `<input type="checkbox" :checked>` with `aria-label` from `workspace.history.preview.checklistItem`; list → `<ul>/<ol>`; table → `<table>` with `<th scope="col">` for header cells; image → `<figure>` with `<img :src="workspaceAssetUrl(src)" :alt loading="lazy">` only when `src` is non-null, otherwise a bordered placeholder reading `workspace.history.preview.externalImage` + the URL as text; unsupported → bordered note with `workspace.history.preview.unsupported` (`{type}`) and the extracted text. Reuse the existing typography classes from `HistoryBlockContent.vue` for paragraph/heading/quote/code.
  - `HistoryDiffPane.vue` As-note branch: iterate `HistoryPreviewBlock` (prop type `previewBlocks: HistoryPreviewBlock[]`).
  - `HistoryDiffRowChanged.vue`: add optional props `changes?: HistoryBlockChangeKind[]`, `changedAttrs?: string[]`, `beforeType?: string`, `afterType?: string`; when `changes` lacks `'text'`, show a line below the (identical) text: `workspace.history.change.marks`, `.type` (`{from} → {to}`), `.attrs` (`{attrs}` joined), `.structure`. `HistoryDiffPane` passes them from the row.
  - `HistoryMetadataStrip.vue`: `t('workspace.history.fields.' + field)` for the new fields; canvas values render via `workspace.history.canvasSummary` (`{elements} elements, {connectors} connectors`) — parse the `"e/c"` summary — or `workspace.history.canvasNone` when null; `layoutOnly` appends `workspace.history.canvasLayoutChanged`.
- [ ] **Step 5: Locales** — add to all five catalogs under `workspace.history` (English below; translate ru/fr/es/de faithfully, keep placeholders):
  ```json
  "fields": { "…existing…": "", "propertiesType": "Type", "propertiesTags": "Tags", "propertiesDate": "Date", "propertiesStatus": "Status", "canvas": "Canvas" },
  "canvasSummary": "{elements} elements, {connectors} connectors",
  "canvasNone": "No canvas",
  "canvasLayoutChanged": "layout changed",
  "change": { "marks": "Formatting changed", "type": "Block type changed: {from} → {to}", "attrs": "Settings changed: {attrs}", "structure": "Nested content changed" },
  "preview": { "unsupported": "{type} block — preview not available", "externalImage": "External image (not loaded)", "checklistItem": "Checklist item" }
  ```
  Insert as text (see Global Constraints). Run `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts`.
- [ ] **Step 6: Component tests** (`HistoryPreviewBlock.test.ts`, mount with the `en` i18n like `HistoryView.test.ts`): a checked checklist renders a checked disabled checkbox; a table renders `th` + `td`; an external image renders no `img` and shows the URL text; a `javascript:` link run renders no `a` element; an unsupported block shows its type. Extend `HistoryView.test.ts`: a formatting-only change shows "Formatting changed"; key-order-only difference shows the "No differences" message.
- [ ] **Step 7:** `pnpm exec vitest run src/utils src/features/history` → PASS; `pnpm exec eslint` on changed files; delete `HistoryBlockContent.vue` only if nothing imports it anymore (`grep -rn HistoryBlockContent src`) — otherwise keep it for diff rows.

---

## Package C — Route and action UX

### Task 9: `useNoteHistory` — bound confirmation, retry, restore result, copy rollback

**Files:**
- Modify: `src/features/history/useNoteHistory.ts`
- Test: create `src/features/history/useNoteHistory.test.ts` (mock stores as `HistoryView.test.ts` does; mount a tiny host component or use `withSetup` helper pattern already in the repo — `grep -rn "function withSetup" src` first)

**Interfaces:**
- Consumes: Task 5 `restoreSnapshot → RestoreNoteSnapshotResult`; tree store `createNote`, `deleteNote`, `permanentlyDeleteFromTrash`.
- Produces (added/changed return fields):
  ```ts
  selectedSnapshotLoaded: ComputedRef<boolean>            // selectedSnapshot !== null && !loading && !error
  confirmation: Ref<{ snapshotId: string; createdAt: string } | null>
  requestRestore(): void          // opens confirmation only when selectedSnapshotLoaded
  cancelRestore(): void
  confirmRestore(): Promise<void> // restores confirmation.snapshotId, not the current selection
  recoverySnapshotId: Ref<string | null>   // last restore's pre-restore snapshot, session-only
  restoreWarning: Ref<string | null>       // localized, non-blocking
  restoreSucceeded: Ref<boolean>           // for the live-region announcement
  retrySnapshots(): Promise<void>
  retrySnapshot(): Promise<void>
  copyError: Ref<string | null>            // includes orphan note id on failed rollback
  ```
  Remove `restore()` (replaced by `confirmRestore`) and update `HistoryView.vue` accordingly in Task 10.

Behavior:
- `watch(selectedSnapshotId, …)` also sets `confirmation.value = null` and clears `restoreError`.
- `confirmRestore`: guard `confirmation` non-null and `!restoring`; call `noteStore.restoreSnapshot(noteId, confirmation.snapshotId)`. Success → `confirmation = null`, `recoverySnapshotId = result.recoverySnapshotId`, `restoreWarning = result.warnings.length ? t('workspace.history.restoreWarning') : null`, `restoreSucceeded = true`, `await loadSnapshots()`, then `selectedSnapshotId = result.recoverySnapshotId` (so reversing is one click). Failure → keep `confirmation` and selection, set `restoreError`.
- Copy: enabled only when `selectedSnapshotLoaded`. On failure after `createNote` succeeded: `await treeStore.deleteNote(created.id)` then `await treeStore.permanentlyDeleteFromTrash(created.id)`; if either throws, `copyError = t('workspace.history.copyRollbackFailed', { noteId: created.id })`, else the existing copy error message.
- `retrySnapshots` = `loadSnapshots()`; `retrySnapshot` = `loadSelectedSnapshot()`.

- [ ] **Step 1: Write failing tests**
  - `closes the confirmation when another version is selected` — request on `snap-new`, `selectSnapshot('snap-old')`, `confirmation` is `null`, `confirmRestore()` does not call `restoreSnapshot`.
  - `confirmRestore restores the bound snapshot` — request on `snap-new`, (no selection change), confirm → `restoreSnapshot('note-1', 'snap-new')`.
  - `cannot request restore while the snapshot is loading or failed` — `loadNoteSnapshot` pending → `requestRestore()` leaves `confirmation` null; rejected → same; `selectedSnapshotLoaded` false.
  - `selects the recovery snapshot after a successful restore` — mock result `{ recoverySnapshotId: 'snap-rec' }`, list reload returns it first → `selectedSnapshotId === 'snap-rec'`, `recoverySnapshotId === 'snap-rec'`.
  - `reports post-commit warnings without calling the restore a failure` — warnings `['pruneFailed']` → `restoreError` null, `restoreWarning` set.
  - `keeps the bound confirmation for retry after a failed restore` — reject once → `confirmation.snapshotId === 'snap-new'`, `restoreError` set; resolve on second `confirmRestore` → success.
  - `rolls back the created note when saving the copy fails` — `backend.saveNote` rejects → `deleteNote('note-copy')` and `permanentlyDeleteFromTrash('note-copy')` called, returns `null`.
  - `reports the orphan note id when rollback fails` — `deleteNote` rejects → `copyError` contains `note-copy`.
  - `retry reloads a failed timeline and a failed snapshot`.
- [ ] **Step 2:** `pnpm exec vitest run src/features/history/useNoteHistory.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Add locale keys (all five): `workspace.history.restoreWarning` ("Restored. Some cleanup did not finish and will be retried when the workspace reopens."), `workspace.history.restoreSucceeded` ("Version restored. The previous state was saved as a version."), `workspace.history.copyRollbackFailed` ("Failed to copy this version. An incomplete copy remains: {noteId}"), `workspace.history.recoveryBadge` ("Before restore"), `workspace.history.retry` ("Retry"), `workspace.history.restoreConfirmAt` ("Restore the version from {time}? The current note will be saved as a version first.").
- [ ] **Step 4:** Re-run → PASS; eslint changed files.

---

### Task 10: Accessible top bar, tabs, timeline, and wiring in `HistoryView`

**Files:**
- Modify: `src/features/history/HistoryTopBar.vue`, `HistoryTimeline.vue`, `HistoryDiffPane.vue` (tabs), `HistoryView.vue`, `src/styles/features/history/history-timeline.css` (only if a scoped rule is needed)
- Test: `src/features/history/HistoryView.test.ts`, `HistoryView.mobile.test.ts`

**Interfaces:**
- `HistoryTopBar` props: replace internal `confirmOpen` with `confirmation: { snapshotId: string; createdAt: string } | null`, `confirmLabel: string` (formatted time), `canRestore` (= loaded), `canCopy` (= loaded), `restoring`, `restoreError`, `restoreWarning`, `copying`, `copyError`; emits `back`, `copy`, `request-restore`, `cancel-restore`, `confirm-restore`.
- `HistoryTimeline` props add `recoveryId: string | null`; emits add `retry`.
- `HistoryDiffPane` emits add `retry`.
- Timestamp formatting: move `formatTimestamp` from `HistoryTimeline.vue` into `src/features/history/formatHistoryTimestamp.ts` (`(value: string, locale: string, t) => string`) so the top bar's confirmation shows the same label.

Requirements:
- Back button: `:aria-label="t('workspace.history.backToNote')"` always (the visible span hides ≤480px).
- Confirmation row (`role="group"`, `aria-labelledby` the text id): text `restoreConfirmAt` with `{time}`, then Cancel, then Confirm, in DOM order; at ≤480px the text spans the full width above a two-column button grid (`tw:max-[480px]:col-span-2` on the text). Focus moves to Cancel when the confirmation opens (`nextTick` + template ref). `Escape` inside the group emits `cancel-restore`.
- Confirm disabled when `!canRestore || restoring`.
- Errors: `role="alert"`; warning/success: a visually-hidden `role="status" aria-live="polite"` region announcing `restoreSucceeded` / `restoreWarning`, plus visible warning text.
- Tabs in `HistoryDiffPane`: each tab gets `id="history-tab-<mode>"`, `aria-controls="history-panel"`, `:tabindex="viewMode === mode ? 0 : -1"`; the body container gets `id="history-panel" role="tabpanel" :aria-labelledby="'history-tab-' + viewMode"`. `@keydown` on the tablist: ArrowRight/ArrowLeft cycle, Home/End jump; each moves selection **and** focus. Keep existing focus-visible utilities.
- Loading states: `role="status"`; error states: `role="alert"` with a Retry `nv-btn` emitting `retry`.
- Timeline: when `snapshot.id === recoveryId`, show a `workspace.history.recoveryBadge` pill next to the timestamp; timeline error state has Retry.

- [ ] **Step 1: Write failing tests** in `HistoryView.test.ts` (update the existing confirm/cancel/failure tests to the new flow):
  - `the back button has an accessible name` — `find('.history-top-bar__back').attributes('aria-label')` equals `Back to note`.
  - `confirmation names the version time and closes when another version is selected`.
  - `confirm is disabled while the selected version is loading`.
  - `tabs expose tab/tabpanel relationships and support arrow/Home/End keys` — trigger `keydown` `ArrowRight` on the active tab → second tab `aria-selected="true"` and `document.activeElement` is it; `End` → last; `Home` → first; panel `aria-labelledby` matches.
  - `a failed timeline load offers retry` — first `listNoteSnapshots` rejects, click Retry, second resolves → entries render.
  - `a failed snapshot load offers retry`.
  - `after restore the recovery version is selected and badged`.
  - `emits open-note after a successful copy` (existing, keep green).
- [ ] **Step 2:** `pnpm exec vitest run src/features/history` → FAIL.
- [ ] **Step 3:** Implement; wire in `HistoryView.vue` (`:confirmation`, `@request-restore="requestRestore"`, etc., `:recovery-id="recoverySnapshotId"`, retry handlers).
- [ ] **Step 4:** Re-run → PASS; eslint changed files; `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts`.

---

### Task 11: Leave history via Back and same-note sidebar selection

**Files:**
- Modify: `src/app/WorkspaceShell.vue:520-541` (`openNote`)
- Test: `src/app/WorkspaceShell.test.ts`

**Interfaces:** none new. `openNote(noteId)` navigates to `routeForNote(noteId)` when the current route is the history route for the same note.

- [ ] **Step 1: Write failing tests** — read the existing `WorkspaceShell.test.ts` harness first (router setup, how it triggers `openNote` via the sidebar stub). Add:
  - `Back from history navigates to the note route` — start at `/workspace/note/note-1/history`, emit `back` from the `HistoryView` stub → `router.currentRoute.value.path === '/workspace/note/note-1'`.
  - `selecting the same note in the sidebar while in history leaves history` — emit the sidebar's open-note event with `note-1` → same assertion.
  - `copy opens the new note` — `HistoryView` emits `open-note` with `note-2` → `/workspace/note/note-2`.
- [ ] **Step 2:** `pnpm exec vitest run src/app/WorkspaceShell.test.ts` → the first two FAIL.
- [ ] **Step 3:** Change the guard to `const sameNote = activeNoteId.value === noteId && !isGraphView.value && !isDrawView.value && !isHistoryView.value` and update the comment above it (history also carries the parent `noteId`). `flushSave()` before push stays.
- [ ] **Step 4:** Re-run → PASS; `pnpm exec eslint src/app/WorkspaceShell.vue src/app/WorkspaceShell.test.ts`.

---

## Integration and verification (lead)

### Task 12: Full verification, visual QA, docs, changelog

- [ ] **Step 1: Frontend checks**
  `pnpm exec vitest run src/utils/noteHistory.test.ts src/utils/noteHistoryPreview.test.ts src/features/history src/app/WorkspaceShell.test.ts src/stores/note.test.ts src/core/document-session src/app/components/WorkspaceEditorPane.test.ts src/locales/locales.test.ts src/i18n.test.ts`
  then `pnpm exec eslint <all changed ts/vue files>` and `pnpm build`.
- [ ] **Step 2: Rust checks**
  `cargo fmt --manifest-path src-tauri/Cargo.toml --check && cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] **Step 3: Visual QA in the real app** (`nevo-visual-qa` skill, `pnpm qa`) in a disposable workspace: acceptance scenarios 1, 3, 7, 8 from the spec — type an edit, open history within 2 s, restore the previous version, confirm the "Before restore" version holds the edit and restoring it brings the edit back; Back and same-note sidebar click reach the editor; at 390px and 360px in light and dark: accessible back name (eval `aria-label`), tab arrow keys, confirmation layout, focus rings, loading/error/retry. Save screenshots for comparison, confirmation, success, and error; stop the QA session afterwards.
- [ ] **Step 4:** Review `git diff --check` and the full scoped diff against the spec's §2 contract, checking that no unrelated user changes were touched.
- [ ] **Step 5:** Add `changes.md` entries (English, past tense) — `🛠️ Fixed`: reversible restore with recovery snapshot, stale-save barrier, Back from history, semantic diff noise; `🔄 Updated / Improved`: settings-driven retention, truthful diff/preview, accessible history screen.
- [ ] **Step 6:** `graphify update .`
- [ ] **Step 7:** Final report in Russian: completed tasks, checks actually run with results, skipped checks (e.g. Windows/macOS rename semantics not exercised), residual risks.
