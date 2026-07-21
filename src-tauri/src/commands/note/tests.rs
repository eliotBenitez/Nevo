use super::*;
use crate::commands::folder::{create_folder_sync, delete_folder_sync, load_manifest};
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
fn touch_note_updated_at_advances_file_and_manifest_while_preserving_title_and_icon() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let mut note = create_note_impl(
        workspace_path.clone(),
        None,
        "Touched note".to_string(),
        "🖊️".to_string(),
    )
    .expect("create note");

    // Seed a far-past timestamp on both the note file and the manifest entry
    // so the touch can be verified as a real chronological advance rather
    // than comparing two timestamps that happen to be equal.
    let stale = "2000-01-01T00:00:00+00:00".to_string();
    note.updated_at = stale.clone();
    save_note_impl(workspace_path.clone(), note.clone()).expect("save note with stale timestamp");

    let touched_at = touch_note_updated_at_impl(workspace_path.clone(), note.id.clone())
        .expect("touch note updated_at");

    let stale_parsed = chrono::DateTime::parse_from_rfc3339(&stale).expect("parse stale timestamp");
    let touched_parsed =
        chrono::DateTime::parse_from_rfc3339(&touched_at).expect("parse touched timestamp");
    assert!(touched_parsed > stale_parsed);

    let reloaded = load_note_impl(workspace_path.clone(), note.id.clone()).expect("reload note");
    assert_eq!(reloaded.updated_at, touched_at);
    assert_eq!(reloaded.title, "Touched note");
    assert_eq!(reloaded.icon, "🖊️");

    let manifest = load_manifest(&workspace_path).expect("load manifest");
    let manifest_entry = manifest
        .root_notes
        .iter()
        .find(|item| item.id == note.id)
        .expect("manifest entry for touched note");
    assert_eq!(manifest_entry.updated_at, touched_at);
    assert_eq!(manifest_entry.title, "Touched note");
    assert_eq!(manifest_entry.icon, "🖊️");
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

    let snapshot =
        load_note_snapshot(workspace_path, note.id.clone(), snapshot_id).expect("load snapshot");

    assert_eq!(snapshot.id, note.id);
    assert_eq!(snapshot.title, note.title);
    assert_eq!(snapshot.content, note.content);
}

#[test]
fn load_note_snapshot_returns_error_for_invalid_snapshot_id() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let note = create_saved_note(&workspace_path);

    let error = load_note_snapshot(workspace_path, note.id, "missing-snapshot".to_string())
        .expect_err("invalid snapshot id should fail");

    assert!(!error.is_empty());
}

#[test]
fn restore_note_snapshot_creates_a_fresh_latest_snapshot() {
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
    let restored = restore_note_snapshot(
        workspace_path.clone(),
        note.id.clone(),
        original_snapshot_id.clone(),
    )
    .expect("restore snapshot");
    let after_restore =
        list_note_snapshots_impl(workspace_path, note.id).expect("list after restore");

    assert_eq!(
        restored.content,
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
    assert_ne!(
        after_restore.first().map(|snapshot| snapshot.id.as_str()),
        Some(original_snapshot_id.as_str())
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
