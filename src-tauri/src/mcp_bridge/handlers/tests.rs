use super::*;

const READ_METHODS: [&str; 10] = [
    "workspace.info",
    "notes.list",
    "notes.search",
    "notes.read",
    "notes.editorSnapshot",
    "notes.open",
    "notes.listSnapshots",
    "notes.readSnapshot",
    "folders.list",
    "trash.list",
];
const WRITE_METHODS: [&str; 10] = [
    "notes.create",
    "notes.move",
    "notes.delete",
    "notes.applyEdit",
    "notes.writeMarkdown",
    "notes.rename",
    "notes.restoreSnapshot",
    "folders.create",
    "folders.rename",
    "trash.restore",
];

#[test]
fn every_method_declares_the_access_level_it_needs() {
    for method in READ_METHODS {
        assert_eq!(access_for(method), Some(Access::Read), "{method}");
    }
    for method in WRITE_METHODS {
        assert_eq!(access_for(method), Some(Access::Write), "{method}");
    }
}

#[test]
fn packaged_tool_catalog_matches_bridge_permissions() {
    let raw = include_str!("../../../../packages/mcp-server/src/tools/catalog.json");
    let catalog: Vec<serde_json::Value> = serde_json::from_str(raw).expect("tool catalog");
    assert_eq!(catalog.len(), 20);
    for tool in catalog {
        let method = tool["method"].as_str().expect("method");
        let expected = match tool["access"].as_str().expect("access") {
            "read" => Access::Read,
            "write" => Access::Write,
            other => panic!("unexpected access {other}"),
        };
        assert_eq!(access_for(method), Some(expected), "{method}");
    }
}

#[test]
fn unknown_methods_are_rejected() {
    assert!(access_for("notes.delete_everything").is_none());
    assert!(access_for("notes.permanentlyDelete").is_none());
}

#[test]
fn structural_note_writes_refresh_the_live_workspace_tree() {
    for method in [
        "notes.create",
        "notes.move",
        "notes.delete",
        "folders.create",
        "folders.rename",
        "trash.restore",
    ] {
        assert!(mutates_workspace_manifest(method), "{method}");
    }
    for method in ["notes.applyEdit", "notes.read", "workspace.info"] {
        assert!(!mutates_workspace_manifest(method), "{method}");
    }
}

/// The bridge must never expose a permanent delete: an agent can trash a
/// note (recoverable) but not destroy one.
#[test]
fn no_registered_method_destroys_data_irreversibly() {
    for method in WRITE_METHODS {
        assert!(!method.contains("permanent"), "{method}");
        assert!(!method.contains("emptyTrash"), "{method}");
    }
}

/// Builds a minimal on-disk workspace: manifest with one note in one
/// folder, the note file itself, and settings granting `mode`.
fn temp_workspace(mode: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("nevo-ws-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join(".nevo")).expect("create .nevo");
    std::fs::create_dir_all(root.join("notes")).expect("create notes dir");

    std::fs::write(
        root.join(".nevo/settings.json"),
        serde_json::json!({ "mcp": { "mode": mode } }).to_string(),
    )
    .expect("write settings");

    std::fs::write(
        root.join(".nevo/workspace.json"),
        serde_json::json!({
            "id": "ws-1",
            "name": "Test Vault",
            "glyph": "N",
            "gradient": "aurora",
            "schemaVersion": 2,
            "createdAt": "2026-01-01T00:00:00Z",
            "rootOrder": [],
            "tree": [{
                "id": "folder-1",
                "title": "Projects",
                "icon": "",
                "parentId": null,
                "order": 0,
                "children": [],
                "notes": [{
                    "id": "note-1",
                    "title": "Roadmap",
                    "icon": "",
                    "folderId": "folder-1",
                    "updatedAt": "2026-01-02T00:00:00Z"
                }]
            }],
            "rootNotes": []
        })
        .to_string(),
    )
    .expect("write manifest");

    std::fs::write(
        root.join("notes/note-note-1.nevo"),
        serde_json::json!({
            "id": "note-1",
            "title": "Roadmap",
            "icon": "",
            "cover": null,
            "folderId": "folder-1",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-02T00:00:00Z",
            "properties": null,
            "content": {
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "Ship the bridge" }]
                }]
            }
        })
        .to_string(),
    )
    .expect("write note");

    root
}

/// Exercises the blocking handlers directly: `dispatch` needs an AppHandle
/// that only exists in a running app, but everything below the permission
/// gate is reachable without one.
fn blocking(root: &std::path::Path, method: &str, params: Value) -> Result<Value, RpcError> {
    let path = root.to_string_lossy().into_owned();
    match method {
        "workspace.info" => notes::workspace_info(&path),
        "notes.list" => notes::list_notes(&path, params),
        "notes.search" => notes::search_notes(&path, params),
        "notes.read" => notes::read_note(&path, params),
        "notes.create" => write::create_note(&path, params),
        "notes.move" => write::move_note(&path, params),
        "notes.delete" => write::delete_note(&path, params),
        "notes.listSnapshots" => history::list_snapshots(&path, params),
        "notes.readSnapshot" => history::read_snapshot(&path, params),
        "folders.list" => folders::list_folders(&path),
        "folders.create" => folders::create_folder(&path, params),
        "folders.rename" => folders::rename_folder(&path, params),
        "trash.list" => trash::list_trash(&path),
        "trash.restore" => trash::restore(&path, params),
        other => panic!("unexpected method {other}"),
    }
}

#[test]
fn read_only_workspace_serves_list_read_and_search() {
    let root = temp_workspace("read-only");

    let listed = blocking(&root, "notes.list", Value::Null).expect("list notes");
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["notes"][0]["id"], "note-1");
    assert_eq!(listed["notes"][0]["folderPath"], "Projects");

    let read = blocking(
        &root,
        "notes.read",
        serde_json::json!({ "noteId": "note-1" }),
    )
    .expect("read note");
    assert_eq!(read["title"], "Roadmap");
    assert_eq!(read["contentSource"], "persisted");
    assert_eq!(read["format"], "document");

    let found = blocking(
        &root,
        "notes.search",
        serde_json::json!({ "query": "bridge" }),
    )
    .expect("search notes");
    assert_eq!(found["matches"][0]["noteId"], "note-1");

    let info = blocking(&root, "workspace.info", Value::Null).expect("workspace info");
    assert_eq!(info["name"], "Test Vault");
    assert_eq!(info["noteCount"], 1);
    assert_eq!(info["folderCount"], 1);

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn read_note_reports_notebook_format_and_raw_notebook_data() {
    let root = temp_workspace("notebook-read");
    let note_path = root.join("notes/note-note-1.nevo");
    let mut note: Value = serde_json::from_slice(&std::fs::read(&note_path).unwrap()).unwrap();
    note["documentKind"] = serde_json::json!("notebook");
    note["notebook"] = serde_json::json!({
        "version": 1,
        "pages": [],
        "futureField": { "preserve": true }
    });
    std::fs::write(&note_path, serde_json::to_vec_pretty(&note).unwrap()).unwrap();

    let result = notes::read_note(
        &root.to_string_lossy(),
        serde_json::json!({ "noteId": "note-1" }),
    )
    .expect("read notebook");
    assert_eq!(result["format"], "notebook");
    assert_eq!(result["notebook"]["futureField"]["preserve"], true);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn create_then_delete_updates_the_manifest_and_trash() {
    let root = temp_workspace("auto");

    let created = blocking(
        &root,
        "notes.create",
        serde_json::json!({ "title": "Agent note", "folderId": "folder-1" }),
    )
    .expect("create note");
    let new_id = created["id"].as_str().expect("id").to_string();

    let listed = blocking(&root, "notes.list", Value::Null).expect("list notes");
    assert_eq!(listed["total"], 2);

    let deleted = blocking(
        &root,
        "notes.delete",
        serde_json::json!({ "noteId": new_id }),
    )
    .expect("delete note");
    assert_eq!(deleted["movedToTrash"], true);

    // Trashed, not destroyed: the note leaves the tree but the workspace
    // still tracks it so the user can restore it.
    let after = blocking(&root, "notes.list", Value::Null).expect("list notes");
    assert_eq!(after["total"], 1);
    let info = blocking(&root, "workspace.info", Value::Null).expect("workspace info");
    assert_eq!(info["trashCount"], 1);

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn deleting_a_note_snapshots_it_first() {
    let root = temp_workspace("auto");

    blocking(
        &root,
        "notes.delete",
        serde_json::json!({ "noteId": "note-1" }),
    )
    .expect("delete note");

    let snapshots = std::fs::read_dir(root.join(".nevo/snapshots"))
        .map(|entries| entries.count())
        .unwrap_or(0);
    assert!(snapshots > 0, "expected a snapshot before the mutation");

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn folders_can_be_listed_created_and_renamed() {
    let root = temp_workspace("auto");

    let created = blocking(
        &root,
        "folders.create",
        serde_json::json!({ "title": "Drafts", "parentId": "folder-1" }),
    )
    .expect("create folder");
    let id = created["id"].as_str().expect("id").to_string();

    blocking(
        &root,
        "folders.rename",
        serde_json::json!({ "folderId": id, "title": "Ideas" }),
    )
    .expect("rename folder");

    let listed = blocking(&root, "folders.list", Value::Null).expect("list folders");
    assert_eq!(listed["total"], 2);
    assert_eq!(listed["folders"][1]["path"], "Projects/Ideas");

    let missing = blocking(
        &root,
        "folders.rename",
        serde_json::json!({ "folderId": "nope", "title": "X" }),
    );
    assert_eq!(missing.unwrap_err().code, "not_found");
    let orphan = blocking(
        &root,
        "folders.create",
        serde_json::json!({ "title": "X", "parentId": "nope" }),
    );
    assert_eq!(orphan.unwrap_err().code, "not_found");

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn trashed_notes_can_be_listed_and_restored() {
    let root = temp_workspace("auto");
    blocking(
        &root,
        "notes.delete",
        serde_json::json!({ "noteId": "note-1" }),
    )
    .expect("delete note");

    let trash = blocking(&root, "trash.list", Value::Null).expect("list trash");
    assert_eq!(trash["items"][0]["id"], "note-1");

    blocking(
        &root,
        "trash.restore",
        serde_json::json!({ "itemId": "note-1" }),
    )
    .expect("restore note");
    let listed = blocking(&root, "notes.list", Value::Null).expect("list notes");
    assert_eq!(listed["notes"][0]["folderPath"], "Projects");

    let again = blocking(
        &root,
        "trash.restore",
        serde_json::json!({ "itemId": "note-1" }),
    );
    assert_eq!(again.unwrap_err().code, "not_found");

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn snapshots_can_be_listed_and_read() {
    let root = temp_workspace("auto");
    // Deleting snapshots the note first, which gives history one entry.
    blocking(
        &root,
        "notes.delete",
        serde_json::json!({ "noteId": "note-1" }),
    )
    .expect("delete note");

    let listed = blocking(
        &root,
        "notes.listSnapshots",
        serde_json::json!({ "noteId": "note-1" }),
    )
    .expect("list snapshots");
    assert_eq!(listed["total"], 1);
    let snapshot_id = listed["snapshots"][0]["id"].as_str().expect("id");

    let read = blocking(
        &root,
        "notes.readSnapshot",
        serde_json::json!({ "noteId": "note-1", "snapshotId": snapshot_id }),
    )
    .expect("read snapshot");
    assert_eq!(read["title"], "Roadmap");
    assert!(read["content"].to_string().contains("Ship the bridge"));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn move_relocates_a_note_to_the_workspace_root() {
    let root = temp_workspace("auto");

    blocking(
        &root,
        "notes.move",
        serde_json::json!({ "noteId": "note-1", "targetFolderId": null }),
    )
    .expect("move note");

    let listed = blocking(&root, "notes.list", Value::Null).expect("list notes");
    assert_eq!(listed["notes"][0]["folderPath"], "");

    let _ = std::fs::remove_dir_all(&root);
}
