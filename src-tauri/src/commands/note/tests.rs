use super::*;
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
