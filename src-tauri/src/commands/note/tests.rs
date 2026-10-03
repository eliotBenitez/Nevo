use super::*;
use crate::commands::folder::{
    create_folder_sync, delete_folder_sync, load_manifest, save_manifest,
};
use crate::commands::workspace::create_workspace;
use chrono::Utc;
use serde_json::json;
use uuid::Uuid;

struct TestWorkspace {
    path: std::path::PathBuf,
}

impl TestWorkspace {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("nevo-note-history-{}", Uuid::new_v4()));
        create_workspace(
            path.to_string_lossy().into_owned(),
            "History".to_string(),
            "N".to_string(),
            "violet".to_string(),
        )
        .expect("create workspace");
        Self { path }
    }

    fn path_string(&self) -> String {
        self.path.to_string_lossy().into_owned()
    }
}

impl Drop for TestWorkspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn create_saved_note(workspace_path: &str) -> NoteDocument {
    let mut note = create_note_impl(
        workspace_path.to_string(),
        None,
        "History note".to_string(),
        "📄".to_string(),
    )
    .expect("create note");
    note.content = json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "Snapshot body" }]
            }
        ]
    });
    note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.to_string(), note.clone()).expect("save note");
    note
}

#[test]
fn create_notebook_upgrades_manifest_before_registering_lossless_note_data() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    let note = super::notebook::create_notebook_impl(
        path.clone(),
        None,
        "Meeting notes".to_string(),
        "📓".to_string(),
        "ruled".to_string(),
    )
    .expect("create notebook");
    let manifest = load_manifest(&path).expect("manifest");
    assert_eq!(manifest.schema_version, 2);
    assert_eq!(manifest.root_notes[0].id, note.id);
    assert_eq!(note.extra["documentKind"], json!("notebook"));
    assert_eq!(note.extra["notebook"]["version"], json!(1));
    assert_eq!(
        note.extra["notebook"]["pages"][0]["paper"]["kind"],
        json!("ruled")
    );
    assert!(note.canvas.is_none());
    assert_eq!(note.content, json!({ "type": "doc", "content": [] }));
}

#[test]
fn invalid_notebook_creation_does_not_upgrade_or_write_anything() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    let error = super::notebook::create_notebook_impl(
        path.clone(),
        None,
        "Invalid".to_string(),
        "📓".to_string(),
        "dots".to_string(),
    )
    .expect_err("unsupported paper kind must fail");
    assert!(error.contains("Unsupported notebook paper"));
    assert_eq!(load_manifest(&path).unwrap().schema_version, 1);
    assert_eq!(
        std::fs::read_dir(workspace.path.join("notes"))
            .unwrap()
            .count(),
        0
    );
}

#[test]
fn failed_notebook_manifest_write_keeps_the_written_note_as_a_diagnosable_orphan() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    let mut manifest_writes = 0;
    let result = super::notebook::create_notebook_impl_with_manifest_writer(
        path.clone(),
        None,
        "Partially registered".to_string(),
        "📓".to_string(),
        "plain".to_string(),
        |workspace_path, manifest| {
            manifest_writes += 1;
            if manifest_writes == 1 {
                save_manifest(workspace_path, manifest)
            } else {
                Err("injected metadata write failure".to_string())
            }
        },
    );
    let error = result.expect_err("metadata write failure should be surfaced");
    assert_eq!(error, "injected metadata write failure");
    assert_eq!(manifest_writes, 2);

    let manifest = load_manifest(&path).expect("manifest");
    assert_eq!(manifest.schema_version, 2);
    assert!(manifest.root_notes.is_empty());
    let note_paths: Vec<_> = std::fs::read_dir(workspace.path.join("notes"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert_eq!(note_paths.len(), 1);
    let raw = std::fs::read_to_string(&note_paths[0]).unwrap();
    let note: NoteDocument = serde_json::from_str(&raw).expect("orphan remains readable");
    assert_eq!(note.extra["documentKind"], json!("notebook"));
}

#[test]
fn save_note_cannot_strip_notebook_markers_or_bypass_schema_upgrade() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    let mut notebook = super::notebook::create_notebook_impl(
        path.clone(),
        None,
        "Meeting notes".to_string(),
        "📓".to_string(),
        "plain".to_string(),
    )
    .expect("create notebook");
    let note_file = note_path(&path, &notebook.id).unwrap();
    let before = std::fs::read(&note_file).unwrap();
    notebook.extra.remove("documentKind");
    notebook.extra.remove("notebook");
    let error = save_note_impl(path.clone(), notebook).expect_err("downgrade must fail");
    assert!(error.starts_with("unsupported-format:"));
    assert_eq!(std::fs::read(&note_file).unwrap(), before);

    let document = create_note_impl(path.clone(), None, "Ordinary".to_string(), "📄".to_string())
        .expect("create document");
    let mut forged = document.clone();
    forged
        .extra
        .insert("documentKind".to_string(), json!("notebook"));
    forged
        .extra
        .insert("notebook".to_string(), json!({ "version": 1, "pages": [] }));
    let error = save_note_impl(path.clone(), forged).expect_err("schema/form mismatch must fail");
    assert!(error.starts_with("unsupported-format:") || error.contains("Notebook page count"));
}

#[test]
fn notebook_snapshot_restore_preserves_unknown_fields_at_nested_levels() {
    let workspace = TestWorkspace::new();
    let path = workspace.path_string();
    let mut note = super::notebook::create_notebook_impl(
        path.clone(),
        None,
        "History notebook".to_string(),
        "📓".to_string(),
        "plain".to_string(),
    )
    .expect("create notebook");
    note.extra["notebook"]["futureField"] = json!({ "version": 4 });
    note.extra["notebook"]["pages"][0]["paper"]["futurePaperField"] = json!("kept");
    let note_bytes = serde_json::to_vec_pretty(&note).unwrap();
    let snapshot_id = snapshots::write_snapshot_bytes(&path, &note.id, &note_bytes).unwrap();
    crate::commands::path_utils::write_atomic(&note_path(&path, &note.id).unwrap(), &note_bytes)
        .unwrap();

    note.extra["notebook"]["futureField"] = json!({ "version": 9 });
    let edited_bytes = serde_json::to_vec_pretty(&note).unwrap();
    crate::commands::path_utils::write_atomic(&note_path(&path, &note.id).unwrap(), &edited_bytes)
        .unwrap();
    let restored = restore_note_snapshot_impl(path.clone(), note.id.clone(), snapshot_id)
        .expect("restore notebook snapshot");
    assert_eq!(
        restored.note.extra["notebook"]["futureField"]["version"],
        json!(4)
    );
    assert_eq!(
        restored.note.extra["notebook"]["pages"][0]["paper"]["futurePaperField"],
        json!("kept")
    );
}

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
    assert_eq!(
        snapshots::snapshot_retention_limit(&path),
        50,
        "missing settings"
    );

    for (raw, expected) in [(1, 1), (12, 12), (50, 50), (200, 200), (0, 1), (999, 200)] {
        write_retention_setting(&path, json!({ "files": { "snapshotRetentionCount": raw } }));
        assert_eq!(
            snapshots::snapshot_retention_limit(&path),
            expected,
            "raw {raw}"
        );
    }

    write_retention_setting(&path, json!({ "files": {} }));
    assert_eq!(
        snapshots::snapshot_retention_limit(&path),
        50,
        "legacy settings"
    );

    std::fs::write(&settings_file, b"not json").unwrap();
    assert_eq!(
        snapshots::snapshot_retention_limit(&path),
        50,
        "unreadable settings"
    );
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

#[test]
fn restore_note_uses_saved_icon_and_falls_back_to_root_when_parent_was_deleted() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let folder = create_folder_sync(
        workspace_path.clone(),
        None,
        "Temporary".to_string(),
        "📁".to_string(),
    )
    .expect("create folder");
    let note = create_note_impl(
        workspace_path.clone(),
        Some(folder.id.clone()),
        "Recover me".to_string(),
        "🔐".to_string(),
    )
    .expect("create note");

    delete_note_impl(workspace_path.clone(), note.id.clone()).expect("move note to trash");
    delete_folder_sync(workspace_path.clone(), folder.id, false).expect("delete empty parent");
    restore_from_trash(workspace_path.clone(), note.id.clone()).expect("restore note");

    let manifest = load_manifest(&workspace_path).expect("load manifest");
    let restored_meta = manifest
        .root_notes
        .iter()
        .find(|item| item.id == note.id)
        .expect("restored root metadata");
    assert_eq!(restored_meta.icon, "🔐");
    assert_eq!(restored_meta.folder_id, None);
    assert!(manifest.trash.is_empty());

    let restored = load_note_impl(workspace_path, note.id).expect("load restored note");
    assert_eq!(restored.icon, "🔐");
    assert_eq!(restored.folder_id, None);
}

#[test]
fn save_note_updates_root_manifest_entry_by_note_id_despite_stale_folder_id() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let mut note = create_note_impl(
        workspace_path.clone(),
        None,
        "Old root title".to_string(),
        "📄".to_string(),
    )
    .expect("create root note");

    note.title = "Updated root title".to_string();
    note.icon = "📝".to_string();
    note.folder_id = Some("stale-folder-id".to_string());
    note.updated_at = "2026-07-14T12:00:00+00:00".to_string();
    save_note_impl(workspace_path.clone(), note.clone()).expect("save root note");

    let manifest = load_manifest(&workspace_path).expect("load manifest");
    assert_eq!(manifest.root_notes.len(), 1);
    assert_eq!(manifest.root_notes[0].id, note.id);
    assert_eq!(manifest.root_notes[0].title, "Updated root title");
    assert_eq!(manifest.root_notes[0].icon, "📝");
    assert_eq!(manifest.root_notes[0].updated_at, note.updated_at);
    assert!(manifest.tree.is_empty());
}

#[test]
fn save_note_updates_nested_manifest_entry_by_note_id_despite_stale_folder_id() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let parent = create_folder_sync(
        workspace_path.clone(),
        None,
        "Parent".to_string(),
        "📁".to_string(),
    )
    .expect("create parent folder");
    let child = create_folder_sync(
        workspace_path.clone(),
        Some(parent.id.clone()),
        "Child".to_string(),
        "📁".to_string(),
    )
    .expect("create child folder");
    let mut note = create_note_impl(
        workspace_path.clone(),
        Some(child.id),
        "Old nested title".to_string(),
        "📄".to_string(),
    )
    .expect("create nested note");

    note.title = "Updated nested title".to_string();
    note.icon = "🗒️".to_string();
    note.folder_id = None;
    note.updated_at = "2026-07-14T12:01:00+00:00".to_string();
    save_note_impl(workspace_path.clone(), note.clone()).expect("save nested note");

    let manifest = load_manifest(&workspace_path).expect("load manifest");
    let saved_notes = &manifest.tree[0].children[0].notes;
    assert_eq!(saved_notes.len(), 1);
    assert_eq!(saved_notes[0].id, note.id);
    assert_eq!(saved_notes[0].title, "Updated nested title");
    assert_eq!(saved_notes[0].icon, "🗒️");
    assert_eq!(saved_notes[0].updated_at, note.updated_at);
    assert!(manifest.root_notes.is_empty());
}

#[test]
fn create_note_rejects_missing_folder_without_leaving_a_file() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let notes_before = std::fs::read_dir(workspace.path.join("notes"))
        .unwrap()
        .count();
    let error = create_note_impl(
        workspace_path.clone(),
        Some("missing-folder-id".to_string()),
        "Unlisted note".to_string(),
        "📄".to_string(),
    )
    .expect_err("missing target folder must fail");

    let manifest = load_manifest(&workspace_path).expect("load manifest");
    assert!(manifest.root_notes.is_empty());
    assert!(manifest.tree.is_empty());
    assert_eq!(error, "Target folder not found");
    assert_eq!(
        std::fs::read_dir(workspace.path.join("notes"))
            .unwrap()
            .count(),
        notes_before
    );
}

#[test]
fn move_note_rejects_missing_folder_without_removing_manifest_entry() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let note = create_note_impl(
        workspace_path.clone(),
        None,
        "Visible note".to_string(),
        "📄".to_string(),
    )
    .expect("create root note");

    let error = move_note_impl(
        workspace_path.clone(),
        note.id.clone(),
        Some("missing-folder-id".to_string()),
    )
    .expect_err("missing target folder must fail");

    assert_eq!(error, "Target folder not found");
    let manifest = load_manifest(&workspace_path).expect("load manifest");
    assert!(manifest.root_notes.iter().any(|entry| entry.id == note.id));
    let stored = load_note_impl(workspace_path, note.id).expect("load note after rejected move");
    assert_eq!(stored.folder_id, None);
}

#[test]
fn concurrent_note_creation_preserves_all_manifest_entries() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let handles = (0..8)
        .map(|index| {
            let workspace_path = workspace_path.clone();
            std::thread::spawn(move || {
                create_note_impl(
                    workspace_path,
                    None,
                    format!("Concurrent {index}"),
                    "📄".to_string(),
                )
            })
        })
        .collect::<Vec<_>>();

    let ids = handles
        .into_iter()
        .map(|handle| handle.join().unwrap().unwrap().id)
        .collect::<std::collections::HashSet<_>>();
    let manifest = load_manifest(&workspace_path).expect("load manifest");

    assert_eq!(ids.len(), 8);
    assert_eq!(manifest.root_notes.len(), 8);
    assert!(manifest
        .root_notes
        .iter()
        .all(|note| ids.contains(&note.id)));
}

#[test]
fn load_note_snapshot_returns_snapshot_document() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let note = create_saved_note(&workspace_path);
    let snapshots =
        list_note_snapshots_impl(workspace_path.clone(), note.id.clone()).expect("list snapshots");
    let snapshot_id = snapshots.first().expect("snapshot metadata").id.clone();

    let snapshot = load_note_snapshot_impl(workspace_path, note.id.clone(), snapshot_id)
        .expect("load snapshot");

    assert_eq!(snapshot.id, note.id);
    assert_eq!(snapshot.title, note.title);
    assert_eq!(snapshot.content, note.content);
}

#[test]
fn load_note_snapshot_returns_error_for_invalid_snapshot_id() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let note = create_saved_note(&workspace_path);

    let error = load_note_snapshot_impl(workspace_path, note.id, "missing-snapshot".to_string())
        .expect_err("invalid snapshot id should fail");

    assert!(!error.is_empty());
}

#[test]
fn restore_note_snapshot_adds_a_pre_restore_recovery_snapshot() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let mut note = create_saved_note(&workspace_path);
    let original_snapshots =
        list_note_snapshots_impl(workspace_path.clone(), note.id.clone()).expect("list snapshots");
    let original_snapshot_id = original_snapshots
        .first()
        .expect("original snapshot")
        .id
        .clone();

    note.content = json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "Overwritten body" }]
            }
        ]
    });
    note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), note.clone()).expect("save overwrite");

    let before_restore = list_note_snapshots_impl(workspace_path.clone(), note.id.clone())
        .expect("list before restore");
    std::thread::sleep(std::time::Duration::from_millis(5));
    let restored = restore_note_snapshot_impl(
        workspace_path.clone(),
        note.id.clone(),
        original_snapshot_id.clone(),
    )
    .expect("restore snapshot");
    let after_restore = list_note_snapshots_impl(workspace_path.clone(), note.id.clone())
        .expect("list after restore");

    assert_eq!(
        restored.note.content,
        json!({
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "Snapshot body" }]
                }
            ]
        })
    );
    assert_eq!(after_restore.len(), before_restore.len() + 1);
    assert_eq!(
        after_restore.first().map(|snapshot| snapshot.id.clone()),
        Some(restored.recovery_snapshot_id.clone())
    );
    let recovery = load_note_snapshot_impl(
        workspace_path,
        note.id,
        restored.recovery_snapshot_id.clone(),
    )
    .expect("load recovery snapshot");
    assert_eq!(
        recovery.content,
        json!({
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "Overwritten body" }]
                }
            ]
        })
    );
}

#[test]
fn search_workspace_blocks_finds_matches_across_multiple_notes() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    let mut first_note = create_note_impl(
        workspace_path.clone(),
        None,
        "Alpha note".to_string(),
        "📄".to_string(),
    )
    .expect("create first note");
    first_note.content = json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "Alpha block match" }]
            }
        ]
    });
    first_note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), first_note.clone()).expect("save first note");

    let mut second_note = create_note_impl(
        workspace_path.clone(),
        None,
        "Beta note".to_string(),
        "📄".to_string(),
    )
    .expect("create second note");
    second_note.content = json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "Some alpha content later" }]
            }
        ]
    });
    second_note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), second_note.clone()).expect("save second note");

    let results = crate::commands::note::search::search_workspace_blocks_sync(
        workspace_path,
        "alpha".to_string(),
    )
    .expect("search blocks");

    assert_eq!(results.len(), 2);
    assert_eq!(results[0].note_id, first_note.id);
    assert_eq!(results[1].note_id, second_note.id);
}

#[test]
fn search_workspace_blocks_returns_block_metadata_and_snippet() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    let mut note = create_note_impl(
        workspace_path.clone(),
        None,
        "Snippet note".to_string(),
        "📄".to_string(),
    )
    .expect("create note");
    note.content = json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "Leading context alpha trailing context" }]
            }
        ]
    });
    note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), note.clone()).expect("save note");

    let results = crate::commands::note::search::search_workspace_blocks_sync(
        workspace_path,
        "alpha".to_string(),
    )
    .expect("search blocks");
    let first = results.first().expect("match");

    assert_eq!(first.note_title, "Snippet note");
    assert_eq!(first.block_index, 0);
    assert!(first.snippet.to_lowercase().contains("alpha"));
    assert!(first.block_text.contains("Leading context"));
}

#[test]
fn search_workspace_blocks_skips_malformed_and_empty_note_content() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    let malformed_path = note_path(&workspace_path, "broken").expect("valid note id");
    std::fs::write(&malformed_path, "{ this is not valid json").expect("write malformed note");

    let mut empty_note = create_note_impl(
        workspace_path.clone(),
        None,
        "Empty note".to_string(),
        "📄".to_string(),
    )
    .expect("create empty note");
    empty_note.content = json!({
        "type": "doc",
        "content": []
    });
    empty_note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), empty_note).expect("save empty note");

    let results = crate::commands::note::search::search_workspace_blocks_sync(
        workspace_path,
        "alpha".to_string(),
    )
    .expect("search blocks");

    assert!(results.is_empty());
}

#[test]
fn restore_note_snapshot_commits_only_note_json_and_leaves_a_legacy_yjs_file_untouched() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let note = create_saved_note(&workspace_path);

    let snapshots =
        list_note_snapshots_impl(workspace_path.clone(), note.id.clone()).expect("list snapshots");
    let snapshot_id = snapshots
        .first()
        .expect("save_note_impl should have created a snapshot")
        .id
        .clone();

    // Simulate edits made after the snapshot was taken: a different note body
    // on disk, and separately, a leftover `.yjs` file from before this note's
    // workspace was migrated off legacy per-note Y.Doc state.
    let mut edited = note.clone();
    edited.content = json!({
        "type": "doc",
        "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "Edited after snapshot" }] }
        ]
    });
    edited.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), edited).expect("save edited note");
    let yjs_path =
        crate::commands::note::collab::yjs_state_path(&workspace_path, &note.id).expect("yjs path");
    std::fs::create_dir_all(yjs_path.parent().unwrap()).unwrap();
    std::fs::write(&yjs_path, b"legacy-yjs-bytes").unwrap();

    let restored = restore_note_snapshot_impl(workspace_path.clone(), note.id.clone(), snapshot_id)
        .expect("restore snapshot");

    assert_eq!(restored.note.content, note.content);

    let note_file_path = note_path(&workspace_path, &note.id).expect("note path");
    let on_disk: NoteDocument =
        serde_json::from_str(&std::fs::read_to_string(&note_file_path).unwrap()).unwrap();
    assert_eq!(
        on_disk.content, note.content,
        "note.json must hold the restored (not the edited) body"
    );

    let yjs_bytes = std::fs::read(&yjs_path).unwrap();
    assert_eq!(
        yjs_bytes, b"legacy-yjs-bytes",
        "restore must not touch a leftover legacy `.yjs` file at all"
    );

    let manifest = load_manifest(&workspace_path).expect("load manifest");
    let meta = manifest
        .root_notes
        .iter()
        .find(|item| item.id == note.id)
        .expect("manifest entry for the restored note");
    assert_eq!(meta.updated_at, restored.note.updated_at);
}

/// A note.json saved by a hypothetical newer Nevo build with a top-level
/// field this build doesn't know about must survive a load->save round trip
/// unchanged, instead of that field being silently dropped the first time an
/// older build resaves the note.
#[test]
fn note_round_trip_preserves_an_unknown_top_level_field() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let note = create_note_impl(
        workspace_path.clone(),
        None,
        "Note with future field".to_string(),
        "📄".to_string(),
    )
    .expect("create note");

    let note_file_path = note_path(&workspace_path, &note.id).expect("note path");
    let raw = std::fs::read_to_string(&note_file_path).expect("read note file");
    let mut value: serde_json::Value = serde_json::from_str(&raw).expect("parse note file");
    value["futureFeatureFlag"] = serde_json::Value::from("from-a-newer-build");
    std::fs::write(
        &note_file_path,
        serde_json::to_string_pretty(&value).unwrap(),
    )
    .expect("rewrite note file with an unknown field");

    let loaded = load_note_impl(workspace_path.clone(), note.id.clone()).expect("load note");
    assert_eq!(
        loaded.extra.get("futureFeatureFlag"),
        Some(&serde_json::Value::from("from-a-newer-build"))
    );

    save_note_impl(workspace_path.clone(), loaded).expect("save note");

    let after = std::fs::read_to_string(&note_file_path).expect("read note file");
    let after_value: serde_json::Value = serde_json::from_str(&after).expect("parse note file");
    assert_eq!(
        after_value["futureFeatureFlag"],
        serde_json::Value::from("from-a-newer-build")
    );
}
