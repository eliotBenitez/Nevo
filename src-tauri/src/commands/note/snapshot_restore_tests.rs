use super::*;
use crate::commands::note::{
    create_note_impl, list_note_snapshots_impl, load_note_impl, note_path, save_note_impl,
};
use crate::commands::note_index::{query_notes_impl, NoteQueryRequest};
use crate::commands::workspace::create_workspace;
use serde_json::json;
use uuid::Uuid;

struct TestWorkspace {
    path: std::path::PathBuf,
}

impl TestWorkspace {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("nevo-snapshot-restore-{}", Uuid::new_v4()));
        create_workspace(
            path.to_string_lossy().into_owned(),
            "Restore".to_string(),
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

fn set_retention(ws: &str, n: u32) {
    let path = crate::commands::workspace::settings_path(ws);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        &path,
        serde_json::to_vec(&json!({ "files": { "snapshotRetentionCount": n } })).unwrap(),
    )
    .unwrap();
}

fn doc(text: &str) -> serde_json::Value {
    json!({ "type": "doc", "content": [{ "type": "paragraph", "attrs": { "id": "b1" },
        "content": [{ "type": "text", "text": text, "marks": [{ "type": "strong" }] }] }] })
}

fn read_note_value(ws: &str, note_id: &str) -> serde_json::Value {
    serde_json::from_str(&std::fs::read_to_string(note_path(ws, note_id).unwrap()).unwrap())
        .unwrap()
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
    let a_id = list_note_snapshots_impl(ws.into(), note.id.clone()).unwrap()[0]
        .id
        .clone();
    // B: raw write with nested unknown fields + canvas + properties, bypassing save_note.
    let mut raw: serde_json::Value = read_note_value(ws, &note.id);
    raw["title"] = json!("B title");
    raw["icon"] = json!("🅱️");
    raw["content"] = doc("version B");
    raw["properties"] = json!({ "type": "task", "tags": ["b"], "date": null, "status": "active", "futureNested": 7 });
    raw["canvas"] = json!({ "version": 1, "frame": { "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0 }, "elements": {}, "connectors": {}, "order": [] });
    raw["futureTopLevel"] = json!({ "keep": true });
    std::fs::write(
        note_path(ws, &note.id).unwrap(),
        serde_json::to_vec_pretty(&raw).unwrap(),
    )
    .unwrap();
    // Keep restore recovery ids in a later millisecond so filename ordering
    // remains deterministic in retention assertions.
    std::thread::sleep(std::time::Duration::from_millis(2));
    (note.id, a_id)
}

#[test]
fn restore_is_reversible_with_retention_two() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    set_retention(&ws, 2);
    let (note_id, a_id) = a_then_b(&ws);
    let b_bytes = std::fs::read(note_path(&ws, &note_id).unwrap()).unwrap();

    let result =
        restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id.clone()).expect("restore A");

    assert_eq!(result.note.title, "A title");
    assert_eq!(result.note.content, doc("version A"));
    let restored_properties = result
        .note
        .properties
        .as_ref()
        .expect("restored properties");
    assert!(restored_properties.note_type.is_none());
    assert!(restored_properties.tags.is_empty());
    assert!(restored_properties.date.is_none());
    assert!(restored_properties.status.is_none());
    assert_eq!(restored_properties.extra["futureNested"], json!(7));

    save_note_impl(ws.clone(), result.note.clone()).expect("save restored note");
    let reloaded = load_note_impl(ws.clone(), note_id.clone()).expect("load saved note");
    let reloaded_properties = reloaded.properties.as_ref().expect("reloaded properties");
    assert_eq!(reloaded_properties.extra["futureNested"], json!(7));
    assert!(reloaded_properties.note_type.is_none());
    assert!(reloaded_properties.tags.is_empty());

    let restored_value = read_note_value(&ws, &note_id);
    assert_eq!(restored_value["properties"]["type"], json!(null));
    assert_eq!(restored_value["properties"]["tags"], json!([]));
    assert_eq!(restored_value["properties"]["date"], json!(null));
    assert_eq!(restored_value["properties"]["status"], json!(null));
    assert_eq!(
        restored_value["properties"]["futureNested"],
        json!(7),
        "restoring known historical properties must keep unknown current properties"
    );

    let recovery_raw = read_snapshot_raw(&ws, &note_id, &result.recovery_snapshot_id)
        .expect("read recovery snapshot");
    assert_eq!(recovery_raw.into_bytes(), b_bytes);

    let snapshots = list_note_snapshots_impl(ws, note_id).expect("list snapshots after restore");
    let ids: Vec<&str> = snapshots.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(
        ids,
        vec![result.recovery_snapshot_id.as_str(), a_id.as_str()]
    );
}

#[test]
fn restore_with_retention_one_keeps_only_the_pre_restore_state() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    set_retention(&ws, 1);
    let (note_id, a_id) = a_then_b(&ws);

    let result = restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id).expect("restore A");

    let snapshots =
        list_note_snapshots_impl(ws.clone(), note_id.clone()).expect("list after restore A");
    assert_eq!(snapshots.len(), 1);
    assert_eq!(snapshots[0].id, result.recovery_snapshot_id);

    let second = restore_note_snapshot_impl(
        ws.clone(),
        note_id.clone(),
        result.recovery_snapshot_id.clone(),
    )
    .expect("restore B via its recovery snapshot");

    assert_eq!(second.note.title, "B title");
    assert_eq!(second.note.icon, "🅱️");
    assert_eq!(second.note.content, doc("version B"));

    assert_eq!(
        second.note.properties.as_ref().unwrap().extra["futureNested"],
        json!(7)
    );
    // The committed JSON and typed result must agree on unknown property data.
    let on_disk = read_note_value(&ws, &note_id);
    assert_eq!(on_disk["properties"]["futureNested"], json!(7));
    assert_eq!(on_disk["canvas"]["version"], json!(1));
}

#[test]
fn recovery_snapshot_is_a_verbatim_copy_of_the_current_file() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let (note_id, a_id) = a_then_b(&ws);
    let b_bytes = std::fs::read(note_path(&ws, &note_id).unwrap()).unwrap();

    let result = restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id).expect("restore");

    let recovery_raw = read_snapshot_raw(&ws, &note_id, &result.recovery_snapshot_id)
        .expect("read recovery snapshot");
    assert_eq!(recovery_raw.as_bytes(), b_bytes.as_slice());

    let value: serde_json::Value = serde_json::from_str(&recovery_raw).unwrap();
    assert_eq!(value["futureTopLevel"]["keep"], json!(true));
    assert_eq!(value["properties"]["futureNested"], json!(7));
}

#[test]
fn restore_keeps_identity_placement_and_unknown_current_fields() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let folder =
        crate::commands::folder::create_folder_sync(ws.clone(), None, "Folder".into(), "📁".into())
            .expect("create folder");

    let mut note = create_note_impl(
        ws.clone(),
        Some(folder.id.clone()),
        "A title".into(),
        "🅰️".into(),
    )
    .expect("create note");
    let dir = crate::commands::note::snapshots::snapshot_dir_path(&ws, &note.id).unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    note.content = doc("version A");
    save_note_impl(ws.clone(), note.clone()).unwrap();
    let a_id = list_note_snapshots_impl(ws.clone(), note.id.clone()).unwrap()[0]
        .id
        .clone();
    let created_at = note.created_at.clone();

    let mut raw = read_note_value(&ws, &note.id);
    raw["title"] = json!("B title");
    raw["content"] = doc("version B");
    raw["futureTopLevel"] = json!({ "keep": true });
    std::fs::write(
        note_path(&ws, &note.id).unwrap(),
        serde_json::to_vec_pretty(&raw).unwrap(),
    )
    .unwrap();

    let result = restore_note_snapshot_impl(ws.clone(), note.id.clone(), a_id).expect("restore");

    let on_disk = read_note_value(&ws, &note.id);
    assert_eq!(on_disk["id"], json!(note.id));
    assert_eq!(on_disk["createdAt"], json!(created_at));
    assert_eq!(on_disk["folderId"], json!(folder.id));
    assert_eq!(on_disk["futureTopLevel"]["keep"], json!(true));
    assert_eq!(result.note.folder_id.as_deref(), Some(folder.id.as_str()));

    let manifest = load_manifest(&ws).expect("load manifest");
    let folder_meta = manifest
        .tree
        .iter()
        .find(|f| f.id == folder.id)
        .expect("folder still in manifest");
    assert!(
        folder_meta.notes.iter().any(|n| n.id == note.id),
        "restore must not move the note out of its folder"
    );
}

#[test]
fn restore_removes_fields_absent_in_the_snapshot() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let mut note = create_note_impl(ws.clone(), None, "A title".into(), "🅰️".into()).unwrap();
    let dir = crate::commands::note::snapshots::snapshot_dir_path(&ws, &note.id).unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    note.content = doc("version A");
    save_note_impl(ws.clone(), note.clone()).unwrap();
    let a_id = list_note_snapshots_impl(ws.clone(), note.id.clone()).unwrap()[0]
        .id
        .clone();

    let mut raw = read_note_value(&ws, &note.id);
    raw["cover"] = json!("cover.png");
    raw["canvas"] = json!({ "version": 1, "frame": { "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0 }, "elements": {}, "connectors": {}, "order": [] });
    std::fs::write(
        note_path(&ws, &note.id).unwrap(),
        serde_json::to_vec_pretty(&raw).unwrap(),
    )
    .unwrap();

    restore_note_snapshot_impl(ws.clone(), note.id.clone(), a_id).expect("restore");

    let on_disk = read_note_value(&ws, &note.id);
    assert!(
        on_disk.get("cover").map(|v| v.is_null()).unwrap_or(true),
        "cover must not survive a restore from a snapshot that had none"
    );
    assert!(
        on_disk.get("canvas").is_none(),
        "canvas must not survive a restore from a snapshot that had none"
    );
}

#[test]
fn restore_aborts_without_touching_a_malformed_current_note() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let (note_id, a_id) = a_then_b(&ws);
    let snapshots_before = list_note_snapshots_impl(ws.clone(), note_id.clone())
        .unwrap()
        .len();
    std::fs::write(note_path(&ws, &note_id).unwrap(), b"{ not json").unwrap();

    let result = restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id);

    assert!(result.is_err());
    assert_eq!(
        std::fs::read(note_path(&ws, &note_id).unwrap()).unwrap(),
        b"{ not json"
    );
    let snapshots_after = list_note_snapshots_impl(ws, note_id).unwrap().len();
    assert_eq!(snapshots_after, snapshots_before);
}

#[test]
fn restore_aborts_when_the_current_note_is_missing() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let (note_id, a_id) = a_then_b(&ws);
    let snapshots_before = list_note_snapshots_impl(ws.clone(), note_id.clone())
        .unwrap()
        .len();
    std::fs::remove_file(note_path(&ws, &note_id).unwrap()).unwrap();

    let result = restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id);

    assert!(result.is_err());
    assert!(!note_path(&ws, &note_id).unwrap().exists());
    let snapshots_after = list_note_snapshots_impl(ws, note_id).unwrap().len();
    assert_eq!(snapshots_after, snapshots_before);
}

#[cfg(unix)]
#[test]
fn restore_aborts_when_the_recovery_snapshot_cannot_be_written() {
    use std::os::unix::fs::PermissionsExt;

    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let (note_id, a_id) = a_then_b(&ws);
    let before = std::fs::read(note_path(&ws, &note_id).unwrap()).unwrap();
    let dir = crate::commands::note::snapshots::snapshot_dir_path(&ws, &note_id).unwrap();
    let original_permissions = std::fs::metadata(&dir).unwrap().permissions();

    // Read-execute only: existing snapshot files (including A, read in step
    // 2 before this restore acquires the note lock) remain readable, but the
    // directory cannot accept the new recovery-snapshot file.
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id);
    std::fs::set_permissions(&dir, original_permissions).unwrap();

    assert!(result.is_err());
    assert_eq!(
        std::fs::read(note_path(&ws, &note_id).unwrap()).unwrap(),
        before
    );
}

#[test]
fn restore_reports_prune_failure_as_a_warning_after_commit() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    set_retention(&ws, 1);
    let (note_id, a_id) = a_then_b(&ws);
    let dir = crate::commands::note::snapshots::snapshot_dir_path(&ws, &note_id).unwrap();
    // Sorts oldest by name (all zeros); a directory here makes
    // `prune_note_snapshots_internal`'s `remove_file` fail on it.
    std::fs::create_dir(dir.join("00000000000000000-dead.json")).unwrap();

    let result = restore_note_snapshot_impl(ws, note_id, a_id).expect("restore still commits");

    assert_eq!(result.warnings, vec![RestoreWarning::PruneFailed]);
    assert_eq!(result.note.content, doc("version A"));
}

#[test]
fn restore_reports_manifest_pending_and_recovery_completes_it() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let (note_id, a_id) = a_then_b(&ws);
    // Real manifest path per `folder::load_manifest`/`save_manifest`.
    let manifest_file = std::path::Path::new(&ws)
        .join(".nevo")
        .join("workspace.json");
    let good_manifest = std::fs::read(&manifest_file).unwrap();
    std::fs::write(&manifest_file, b"not json").unwrap();

    let result =
        restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id).expect("restore commits");

    assert!(result.warnings.contains(&RestoreWarning::ManifestPending));

    std::fs::write(&manifest_file, good_manifest).unwrap();
    crate::commands::note::restore_journal::recover_pending_restores(&ws)
        .expect("recover pending restores");

    let manifest = load_manifest(&ws).expect("load manifest after recovery");
    let title = manifest
        .root_notes
        .iter()
        .find(|n| n.id == note_id)
        .expect("manifest entry for the restored note")
        .title
        .clone();
    assert_eq!(title, "A title");
}

#[test]
fn restore_refreshes_the_note_index() {
    let workspace = TestWorkspace::new();
    let ws = workspace.path_string();
    let (note_id, a_id) = a_then_b(&ws);

    restore_note_snapshot_impl(ws.clone(), note_id.clone(), a_id).expect("restore");

    let rows = query_notes_impl(ws, NoteQueryRequest::default()).expect("query index");
    let row = rows
        .iter()
        .find(|row| row.note_id == note_id)
        .expect("restored note indexed");
    assert_eq!(row.title, "A title");
}
