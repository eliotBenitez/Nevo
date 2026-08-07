use std::fs;
use std::path::PathBuf;

use rusqlite::params;
use uuid::Uuid;

use super::run_merge;
use crate::commands::database::open_database;
use crate::commands::folder::{create_folder_sync, load_manifest};
use crate::commands::note::create_note_impl;
use crate::commands::note::save_note_impl;
use crate::commands::workspace::create_workspace;
use crate::commands::workspace_transfer::archive_read::extract_archive;
use crate::commands::workspace_transfer::archive_write::write_workspace_archive;
use crate::commands::workspace_transfer::collect::collect_full_workspace_files;
use crate::commands::workspace_transfer::header::build_header;
use crate::commands::workspace_transfer::TransferProgress;

struct TempDir(PathBuf);

impl TempDir {
    fn new(prefix: &str) -> Self {
        let path = std::env::temp_dir().join(format!("{prefix}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temp dir");
        Self(path)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn noop_channel() -> tauri::ipc::Channel<TransferProgress> {
    tauri::ipc::Channel::new(|_| Ok(()))
}

fn new_workspace(temp: &TempDir, sub: &str, name: &str) -> PathBuf {
    let path = temp.0.join(sub);
    create_workspace(
        path.to_string_lossy().into_owned(),
        name.to_string(),
        "N".to_string(),
        "violet".to_string(),
    )
    .expect("create workspace");
    path
}

fn insert_db_row(workspace: &std::path::Path, database_id: &str, record_id: &str) {
    let connection = open_database(workspace).expect("open database");
    connection
        .execute(
            "INSERT INTO database_records(database_id, record_id, ordinal, cells_json) \
             VALUES (?1, ?2, 0, ?3)",
            params![database_id, record_id, r#"{"name":"Alice"}"#],
        )
        .expect("insert database row");
}

fn count_db_rows(workspace: &std::path::Path, database_id: &str) -> i64 {
    let connection = open_database(workspace).expect("open database");
    connection
        .query_row(
            "SELECT COUNT(*) FROM database_records WHERE database_id = ?1",
            [database_id],
            |row| row.get(0),
        )
        .expect("count rows")
}

/// Round-trip: build a source workspace with an internal link, a note_embed,
/// and two V2 database blocks (one `attrs.data` as an object, one as a
/// JSON-encoded string) referencing rows in `databases.sqlite`; export it to
/// a `.nevoz` archive; extract that archive; merge it into a destination
/// workspace that already has its own note. Every imported id must come out
/// remapped and consistent, the pre-existing dest note must be untouched,
/// and both `attrs.data` shapes must have their SQLite rows follow along
/// under the new database id.
#[test]
fn merge_remaps_note_links_embeds_and_v2_databases_and_copies_sqlite_rows() {
    let temp = TempDir::new("nevo-merge-roundtrip");

    // --- Source workspace: folder F / note A (links + embeds + two V2 db
    // blocks) + root note B.
    let source_root = new_workspace(&temp, "source", "Source");
    let source_path = source_root.to_string_lossy().into_owned();

    let folder = create_folder_sync(source_path.clone(), None, "F".to_string(), "📁".to_string())
        .expect("create folder");

    let note_b = create_note_impl(source_path.clone(), None, "B".to_string(), "📄".to_string())
        .expect("create note B");

    let mut note_a = create_note_impl(
        source_path.clone(),
        Some(folder.id.clone()),
        "A".to_string(),
        "📄".to_string(),
    )
    .expect("create note A");

    let db_obj_old = "db-object-form";
    let db_str_old = "db-string-form";
    insert_db_row(&source_root, db_obj_old, "row-obj");
    insert_db_row(&source_root, db_str_old, "row-str");

    note_a.content = serde_json::json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "link",
                    "marks": [{ "type": "internal_link", "attrs": { "noteId": note_b.id.clone() } }],
                }],
            },
            { "type": "note_embed", "attrs": { "noteId": note_b.id.clone() } },
            {
                "type": "database_block",
                "attrs": { "data": { "version": 2, "databaseId": db_obj_old, "fields": [] } },
            },
            {
                "type": "database_block",
                "attrs": {
                    "data": serde_json::to_string(&serde_json::json!({
                        "version": 2, "databaseId": db_str_old, "fields": []
                    })).unwrap(),
                },
            },
        ],
    });
    save_note_impl(source_path.clone(), note_a.clone()).expect("save note A");

    // --- Export the source workspace to a .nevoz archive (Phase-1 writer).
    let header = build_header(&source_root, false).expect("build header");
    let files = collect_full_workspace_files(&source_root).expect("collect files");
    let archive_path = temp.0.join("export.nevoz");
    let archive_file = fs::File::create(&archive_path).expect("create archive file");
    write_workspace_archive(
        archive_file,
        &source_root,
        &files,
        &header,
        None,
        &noop_channel(),
    )
    .expect("write archive");

    // --- Dest workspace with its own pre-existing note.
    let dest_root = new_workspace(&temp, "dest", "Dest");
    let dest_note = create_note_impl(
        dest_root.to_string_lossy().into_owned(),
        None,
        "Pre-existing".to_string(),
        "📄".to_string(),
    )
    .expect("create dest note");

    // --- Extract the archive (as the merge command itself would) and merge.
    let extracted = temp.0.join("extracted");
    fs::create_dir_all(&extracted).unwrap();
    extract_archive(&archive_path, &extracted, None, &noop_channel()).expect("extract archive");

    let report =
        run_merge(&extracted, &dest_root, &noop_channel()).expect("merge into dest workspace");

    assert_eq!(
        report.imported_notes, 2,
        "note A and note B were both imported"
    );
    assert_eq!(
        report.imported_databases, 2,
        "both V2 database blocks (object and string attrs.data) were remapped"
    );
    assert_eq!(
        report.imported_folders, 2,
        "folder F plus the wrapper root folder"
    );
    assert_eq!(report.imported_assets, 0);
    assert_eq!(report.skipped_boards, 0);
    // `save_note_impl` on note A wrote exactly one snapshot file; snapshots
    // are deliberately not imported by merge (see the plan's "Out of scope
    // (v1)" list), so it must be reported as skipped rather than silently
    // dropped.
    assert_eq!(report.skipped_snapshots, 1);

    // Pre-existing dest note is untouched.
    let untouched = fs::read_to_string(
        dest_root
            .join("notes")
            .join(format!("note-{}.nevo", dest_note.id)),
    )
    .expect("dest note still present");
    assert!(untouched.contains("Pre-existing"));

    // A new "Imported: Source" folder exists in the dest manifest, nesting
    // the imported folder F and the imported root note B underneath it.
    let dest_manifest = load_manifest(&dest_root.to_string_lossy()).expect("load dest manifest");
    let imported_root = dest_manifest
        .tree
        .iter()
        .find(|folder| folder.title == "Imported: Source")
        .expect("imported root folder exists");
    assert_eq!(
        imported_root.children.len(),
        1,
        "folder F nested under the wrapper"
    );
    let imported_folder_f = &imported_root.children[0];
    assert_eq!(imported_folder_f.title, "F");
    assert_eq!(imported_folder_f.notes.len(), 1);
    let imported_note_a_id = imported_folder_f.notes[0].id.clone();
    assert_ne!(imported_note_a_id, note_a.id, "note A got a fresh id");

    assert_eq!(
        imported_root.notes.len(),
        1,
        "note B nested as an imported root note"
    );
    let imported_note_b_id = imported_root.notes[0].id.clone();
    assert_ne!(imported_note_b_id, note_b.id, "note B got a fresh id");

    // Note A's content now points at note B's NEW id, not the old one.
    let note_a_raw = fs::read_to_string(
        dest_root
            .join("notes")
            .join(format!("note-{}.nevo", imported_note_a_id)),
    )
    .expect("imported note A written to dest");
    assert!(
        note_a_raw.contains(&imported_note_b_id),
        "internal_link/note_embed must be remapped to the new note B id"
    );
    assert!(
        !note_a_raw.contains(&note_b.id),
        "the old note B id must not survive the merge"
    );

    // Both V2 database ids were remapped (object AND string attrs.data
    // forms) and their SQLite rows followed under the new id.
    let note_a_value: serde_json::Value = serde_json::from_str(&note_a_raw).unwrap();
    let blocks = note_a_value["content"]["content"].as_array().unwrap();
    let new_db_obj = blocks[2]["attrs"]["data"]["databaseId"]
        .as_str()
        .expect("object-form attrs.data keeps its object shape")
        .to_string();
    let db_str_payload: serde_json::Value = serde_json::from_str(
        blocks[3]["attrs"]["data"]
            .as_str()
            .expect("string-form attrs.data stays a JSON-encoded string"),
    )
    .unwrap();
    let new_db_str = db_str_payload["databaseId"].as_str().unwrap().to_string();

    assert_ne!(new_db_obj, db_obj_old);
    assert_ne!(new_db_str, db_str_old);
    assert_eq!(count_db_rows(&dest_root, &new_db_obj), 1);
    assert_eq!(count_db_rows(&dest_root, &new_db_str), 1);
    assert_eq!(
        count_db_rows(&dest_root, db_obj_old),
        0,
        "the old db id must not exist in dest"
    );
}
