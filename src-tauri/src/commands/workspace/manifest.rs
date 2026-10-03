use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

use super::paths::{
    notes_dir_path, settings_path, snapshots_dir_path, workspace_context, workspace_error_context,
};
use super::plugins::ensure_bundled_system_plugins;
use super::settings::{is_extended_diagnostics_enabled, read_workspace_settings};
use super::types::{
    WorkspaceManifest, WorkspaceSettings, CURRENT_WORKSPACE_SCHEMA_VERSION,
    INITIAL_WORKSPACE_SCHEMA_VERSION,
};
use crate::commands::path_utils::{
    activate_workspace_root, normalize_workspace_path, write_atomic,
};
use crate::logging::{LogContext, LogError};

#[tauri::command]
pub fn create_workspace(
    path: String,
    name: String,
    glyph: String,
    gradient: String,
) -> Result<WorkspaceManifest, String> {
    let logger = crate::logging::logger();
    let path = normalize_workspace_path(&path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to normalize workspace path",
            LogContext::default()
                .with_error(LogError {
                    kind: Some("path".to_string()),
                    message: message.clone(),
                    details: None,
                })
                .with_payload(serde_json::json!({ "path": path })),
        );
    })?;
    let base = Path::new(&path);
    let workspace_path = path.to_string_lossy().into_owned();
    std::fs::create_dir_all(base.join(".nevo/plugins")).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to create plugin directory",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    ensure_bundled_system_plugins(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to install bundled plugins",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
    })?;
    std::fs::create_dir_all(base.join("notes")).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to create notes directory",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    std::fs::create_dir_all(base.join("folders")).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to create folders directory",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let manifest = WorkspaceManifest {
        id: Uuid::new_v4().to_string(),
        name,
        glyph,
        gradient,
        schema_version: INITIAL_WORKSPACE_SCHEMA_VERSION,
        created_at: Utc::now().to_rfc3339(),
        root_order: vec![],
        tree: vec![],
        root_notes: vec![],
        trash: vec![],
        sidebar_note_order: vec![],
        extra: Default::default(),
    };

    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to serialize workspace manifest",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    std::fs::write(base.join(".nevo/workspace.json"), manifest_json).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to write workspace manifest",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let settings_json =
        serde_json::to_string_pretty(&WorkspaceSettings::default()).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.workspace",
                "create_workspace",
                "Failed to serialize workspace settings",
                workspace_error_context(&workspace_path, "serde", message.clone()),
            );
            message
        })?;
    std::fs::write(settings_path(&workspace_path), settings_json).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "create_workspace",
            "Failed to write workspace settings",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let _ = logger.info(
        "tauri.workspace",
        "create_workspace",
        "Created workspace",
        false,
        workspace_context(&workspace_path)
            .with_workspace_id(manifest.id.clone())
            .with_payload(serde_json::json!({
                "name": manifest.name,
            })),
    );

    activate_workspace_root(base)?;
    Ok(manifest)
}

#[tauri::command]
pub fn open_workspace(path: String) -> Result<WorkspaceManifest, String> {
    let logger = crate::logging::logger();
    let path = normalize_workspace_path(&path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "open_workspace",
            "Failed to normalize workspace path",
            LogContext::default()
                .with_error(LogError {
                    kind: Some("path".to_string()),
                    message: message.clone(),
                    details: None,
                })
                .with_payload(serde_json::json!({ "path": path })),
        );
    })?;
    let workspace_path = path.to_string_lossy().into_owned();

    let manifest_path = Path::new(&path).join(".nevo/workspace.json");
    let content = std::fs::read_to_string(&manifest_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "open_workspace",
            "Failed to read workspace manifest",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let mut manifest: WorkspaceManifest = serde_json::from_str(&content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "open_workspace",
            "Failed to parse workspace manifest",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;

    // Reject before any write (trash pruning below, or anything the caller
    // does afterwards) touches a manifest written by a newer Nevo build.
    // Without this, an older build would silently keep opening it and the
    // very next save would drop every field this build doesn't know about
    // (see the `extra` catch-all fields for what that save DOES preserve —
    // this gate is for the versioned-shape changes that isn't enough for).
    // No migration ladder exists yet for the reverse direction (older
    // schema_version on a newer build) — that keeps opening as before; a
    // step-by-step upgrade, when needed, belongs right here.
    if manifest.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION {
        let message = format!(
            "workspace-schema-too-new:{}:{}",
            manifest.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION
        );
        let _ = logger.error(
            "tauri.workspace",
            "open_workspace",
            "Workspace manifest schema version is newer than this build supports",
            workspace_error_context(&workspace_path, "schema_version", message.clone()),
        );
        return Err(message);
    }

    // Both of these write into the workspace, so they run only once the
    // manifest has been read and accepted above — refusing a workspace this
    // build cannot support must leave it exactly as it was found.
    //
    // Roll forward any snapshot restore left mid-commit by a crash before the
    // last close (see restore_journal). Must never fail opening the workspace.
    let mut recovered_marker_count = 0usize;
    match crate::commands::note::restore_journal::recover_pending_restores(&workspace_path) {
        Ok(count) => recovered_marker_count = count,
        Err(message) => {
            let _ = logger.error(
                "tauri.workspace",
                "open_workspace",
                "Failed to recover a pending note restore",
                workspace_error_context(&workspace_path, "journal", message),
            );
        }
    }

    // A marker replay (or its manifest-meta resync — see
    // `restore_journal::sync_manifest_meta_from_note`) writes
    // `.nevo/workspace.json` straight to disk, bypassing the `manifest`
    // parsed above. Re-read it now so the trash-pruning save below and the
    // manifest this command returns both reflect that write, instead of
    // silently overwriting it with the stale pre-recovery copy or handing
    // the frontend stale title/icon data.
    if recovered_marker_count > 0 {
        match std::fs::read_to_string(&manifest_path)
            .map_err(|error| error.to_string())
            .and_then(|content| {
                serde_json::from_str::<WorkspaceManifest>(&content)
                    .map_err(|error| error.to_string())
            }) {
            Ok(refreshed) => manifest = refreshed,
            Err(message) => {
                let _ = logger.error(
                    "tauri.workspace",
                    "open_workspace",
                    "Failed to re-read workspace manifest after restore recovery; \
                     continuing with the pre-recovery copy",
                    workspace_error_context(&workspace_path, "journal", message),
                );
            }
        }
    }

    ensure_bundled_system_plugins(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "open_workspace",
            "Failed to install bundled plugins",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
    })?;

    // Prune trash on open
    if let Ok(settings) = read_workspace_settings(&settings_path(&workspace_path)) {
        let retention_days = settings.files.trash_retention_days;

        if retention_days > 0 {
            let now = Utc::now();
            let mut pruned = false;
            let trash_len = manifest.trash.len();

            manifest.trash.retain(|item| {
                if let Ok(deleted_at) = chrono::DateTime::parse_from_rfc3339(&item.deleted_at) {
                    let age = now.signed_duration_since(deleted_at.with_timezone(&Utc));
                    if age.num_days() >= retention_days as i64 {
                        if item.item_type == "note" {
                            let path = notes_dir_path(&workspace_path)
                                .join(format!("note-{}.nevo", item.id));
                            if path.exists() {
                                let _ = std::fs::remove_file(path);
                            }
                            let snap_dir = snapshots_dir_path(&workspace_path).join(&item.id);
                            if snap_dir.exists() {
                                let _ = std::fs::remove_dir_all(snap_dir);
                            }
                        }
                        pruned = true;
                        return false;
                    }
                }
                true
            });

            if pruned {
                let _ = logger.info(
                    "tauri.workspace",
                    "open_workspace",
                    &format!(
                        "Pruned {} items from trash",
                        trash_len - manifest.trash.len()
                    ),
                    true,
                    workspace_context(&workspace_path),
                );
                let _ = save_workspace_manifest(workspace_path.clone(), manifest.clone());
            }
        }
    }

    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_path);
    let _ = logger.info(
        "tauri.workspace",
        "open_workspace",
        "Opened workspace",
        diagnostics_enabled,
        workspace_context(&workspace_path),
    );
    activate_workspace_root(&path)?;
    Ok(manifest)
}

/// Reads the current manifest without running the open-workspace migrations,
/// plugin installation, trash retention, or active-root side effects.
#[tauri::command]
pub fn load_workspace_manifest(path: String) -> Result<WorkspaceManifest, String> {
    let path = normalize_workspace_path(&path)?;
    crate::commands::folder::load_manifest(&path.to_string_lossy())
}

#[tauri::command]
pub fn save_workspace_manifest(path: String, manifest: WorkspaceManifest) -> Result<(), String> {
    let logger = crate::logging::logger();
    let path = normalize_workspace_path(&path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "save_workspace_manifest",
            "Failed to normalize workspace path",
            LogContext::default()
                .with_error(LogError {
                    kind: Some("path".to_string()),
                    message: message.clone(),
                    details: None,
                })
                .with_payload(serde_json::json!({ "path": path })),
        );
    })?;
    let workspace_path = path.to_string_lossy().into_owned();
    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_path);
    let lock = crate::commands::folder::manifest_lock(&workspace_path);
    let _manifest_guard = lock.lock().map_err(|error| error.to_string())?;
    let current = crate::commands::folder::load_manifest(&workspace_path)?;
    if current.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "workspace-schema-too-new:{}:{}",
            current.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION
        ));
    }
    if manifest.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "workspace-schema-too-new:{}:{}",
            manifest.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION
        ));
    }
    if manifest.schema_version < current.schema_version {
        return Err(format!(
            "workspace-schema-stale:{}:{}",
            manifest.schema_version, current.schema_version
        ));
    }
    let manifest_path = Path::new(&path).join(".nevo/workspace.json");
    let content = serde_json::to_string_pretty(&manifest).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "save_workspace_manifest",
            "Failed to serialize workspace manifest",
            workspace_error_context(&workspace_path, "serde", message.clone()),
        );
        message
    })?;
    write_atomic(&manifest_path, content.as_bytes()).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "save_workspace_manifest",
            "Failed to write workspace manifest",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let _ = logger.info(
        "tauri.workspace",
        "save_workspace_manifest",
        "Saved workspace manifest",
        diagnostics_enabled,
        workspace_context(&workspace_path)
            .with_workspace_id(manifest.id)
            .with_payload(serde_json::json!({
                "rootNotes": manifest.root_notes.len(),
                "rootFolders": manifest.tree.len(),
            })),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::folder::{load_manifest, save_manifest};
    use uuid::Uuid;

    struct TestWorkspace {
        path: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-manifest-test-{}", Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Test".to_string(),
                "N".to_string(),
                "violet".to_string(),
            )
            .expect("create workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }

        fn manifest_path(&self) -> std::path::PathBuf {
            self.path.join(".nevo/workspace.json")
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn open_workspace_rejects_a_manifest_schema_version_newer_than_supported() {
        let workspace = TestWorkspace::new();

        let raw = std::fs::read_to_string(workspace.manifest_path()).expect("read manifest");
        let mut value: serde_json::Value = serde_json::from_str(&raw).expect("parse manifest");
        value["schemaVersion"] = serde_json::Value::from(CURRENT_WORKSPACE_SCHEMA_VERSION + 1);
        std::fs::write(
            workspace.manifest_path(),
            serde_json::to_string_pretty(&value).unwrap(),
        )
        .expect("rewrite manifest with a future schema version");

        let error = open_workspace(workspace.path_string()).expect_err("must be rejected");
        assert_eq!(
            error,
            format!(
                "workspace-schema-too-new:{}:{}",
                CURRENT_WORKSPACE_SCHEMA_VERSION + 1,
                CURRENT_WORKSPACE_SCHEMA_VERSION
            )
        );

        // The manifest on disk must be left exactly as-is — no rewrite ever
        // ran, so the "future" schema version and any newer-build-only
        // content are still there untouched.
        let after = std::fs::read_to_string(workspace.manifest_path()).expect("read manifest");
        let after_value: serde_json::Value = serde_json::from_str(&after).expect("parse manifest");
        assert_eq!(
            after_value["schemaVersion"],
            serde_json::Value::from(CURRENT_WORKSPACE_SCHEMA_VERSION + 1)
        );
    }

    #[test]
    fn open_workspace_still_opens_an_older_schema_version() {
        let workspace = TestWorkspace::new();

        // Simulate a pre-versioning (or otherwise older) manifest. There is
        // no migration ladder yet, so this must open unmodified — no
        // rewrite, no schema_version bump — exactly like today.
        let raw = std::fs::read_to_string(workspace.manifest_path()).expect("read manifest");
        let mut value: serde_json::Value = serde_json::from_str(&raw).expect("parse manifest");
        value["schemaVersion"] = serde_json::Value::from(0u32);
        std::fs::write(
            workspace.manifest_path(),
            serde_json::to_string_pretty(&value).unwrap(),
        )
        .expect("rewrite manifest with an older schema version");

        let manifest = open_workspace(workspace.path_string()).expect("must open");
        assert_eq!(manifest.schema_version, 0);
    }

    #[test]
    fn save_workspace_manifest_cannot_lower_the_notebook_compatibility_gate() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();
        let stale = load_manifest(&path).expect("load stale manifest");
        let mut current = stale.clone();
        current.schema_version = 2;
        save_manifest(&path, &current).expect("raise schema gate");
        let error = save_workspace_manifest(path.clone(), stale)
            .expect_err("schema 1 stale manifest must not overwrite schema 2");
        assert!(error.starts_with("workspace-schema-stale:"));
        assert_eq!(load_manifest(&path).unwrap().schema_version, 2);
    }

    #[test]
    fn open_workspace_still_opens_the_current_schema_version() {
        let workspace = TestWorkspace::new();
        // schema_version is already CURRENT_WORKSPACE_SCHEMA_VERSION from
        // create_workspace — pins that the version gate never rejects `==`.
        let manifest = open_workspace(workspace.path_string()).expect("must open");
        assert_eq!(manifest.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION);
    }

    /// A manifest saved by a hypothetical newer Nevo build with a top-level
    /// field this build doesn't know about must survive a load->save round
    /// trip unchanged, instead of that field being silently dropped the first
    /// time an older build resaves the workspace.
    #[test]
    fn manifest_round_trip_preserves_an_unknown_top_level_field() {
        let workspace = TestWorkspace::new();

        let raw = std::fs::read_to_string(workspace.manifest_path()).expect("read manifest");
        let mut value: serde_json::Value = serde_json::from_str(&raw).expect("parse manifest");
        value["futureFeatureFlag"] = serde_json::Value::from("from-a-newer-build");
        std::fs::write(
            workspace.manifest_path(),
            serde_json::to_string_pretty(&value).unwrap(),
        )
        .expect("rewrite manifest with an unknown field");

        let manifest = load_workspace_manifest(workspace.path_string()).expect("load manifest");
        assert_eq!(
            manifest.extra.get("futureFeatureFlag"),
            Some(&serde_json::Value::from("from-a-newer-build"))
        );

        save_workspace_manifest(workspace.path_string(), manifest).expect("save manifest");

        let after = std::fs::read_to_string(workspace.manifest_path()).expect("read manifest");
        let after_value: serde_json::Value = serde_json::from_str(&after).expect("parse manifest");
        assert_eq!(
            after_value["futureFeatureFlag"],
            serde_json::Value::from("from-a-newer-build")
        );
    }

    /// Regression for the real `open_workspace` flow: a restore whose
    /// manifest resync failed (marker kept, per `restore_journal`) must have
    /// its resync applied — and *stick* — the next time the workspace is
    /// opened, even when trash pruning also runs and saves the manifest that
    /// same open. Before the fix, `open_workspace` parsed `workspace.json`
    /// into memory before `recover_pending_restores` ran, returned that
    /// pre-recovery copy to the caller, and — if pruning fired — saved that
    /// same stale copy back over whatever the resync had just written,
    /// silently erasing it (the marker is already gone by then, so nothing
    /// retries it).
    #[test]
    fn open_workspace_reflects_a_manifest_resync_finished_by_recovery_and_survives_trash_pruning() {
        let workspace = TestWorkspace::new();
        let ws = workspace.path_string();

        let note = crate::commands::note::create_note_impl(
            ws.clone(),
            None,
            "Before".to_string(),
            "\u{1F4C4}".to_string(),
        )
        .expect("create note");
        let note_id = note.id.clone();

        // Give the manifest an old trash entry too, so `open_workspace`'s
        // trash-pruning save definitely fires on this same open — that's the
        // path that clobbers a fresh resync if the manifest isn't re-read.
        let manifest_path = workspace.manifest_path();
        let raw = std::fs::read_to_string(&manifest_path).expect("read manifest");
        let mut value: serde_json::Value = serde_json::from_str(&raw).expect("parse manifest");
        let ancient = chrono::Utc::now() - chrono::Duration::days(90);
        value["trash"] = serde_json::json!([{
            "id": "trashed-folder-1",
            "type": "folder",
            "title": "Old folder",
            "deletedAt": ancient.to_rfc3339(),
            "originalParentId": null,
        }]);
        std::fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&value).unwrap(),
        )
        .expect("write manifest with an old trash item");

        // This is the exact pre-recovery manifest state `open_workspace` will
        // read into memory below: note title "Before", one prunable trash
        // item, nothing about the restore yet.
        let pre_recovery_manifest_bytes = std::fs::read(&manifest_path).expect("read manifest");

        // Stage a durable restore to a new title. Corrupting the manifest
        // file makes `commit_note_restore`'s manifest resync fail exactly
        // like a real crash mid-resync would: `note.json` is already
        // authoritative, but the journal marker survives for recovery to
        // finish the resync later.
        let note_json_path = crate::commands::note::note_path(&ws, &note_id).expect("note path");
        let mut note_doc: crate::commands::note::NoteDocument =
            serde_json::from_slice(&std::fs::read(&note_json_path).unwrap()).unwrap();
        note_doc.title = "After".to_string();
        note_doc.updated_at = "2030-01-01T00:00:00+00:00".to_string();
        let payload = serde_json::to_vec_pretty(&note_doc).unwrap();

        std::fs::write(&manifest_path, b"not json").expect("corrupt manifest");
        let outcome =
            crate::commands::note::restore_journal::commit_note_restore(&ws, &note_id, &payload)
                .expect("commit restore");
        assert_eq!(
            outcome,
            crate::commands::note::restore_journal::CommitOutcome::ManifestPending
        );

        let marker_path = std::path::Path::new(&ws)
            .join(".nevo")
            .join("journal")
            .join(format!("restore-{note_id}.json"));
        assert!(marker_path.exists(), "resync failure must keep the marker");

        // Put the manifest back exactly as it was before the failed resync
        // attempt (a real crash would never have touched it at all).
        std::fs::write(&manifest_path, &pre_recovery_manifest_bytes)
            .expect("restore pre-recovery manifest");

        let manifest = open_workspace(ws.clone()).expect("open workspace");

        assert!(
            !marker_path.exists(),
            "open_workspace must finish the deferred resync and clear the marker"
        );

        let returned_title = manifest
            .root_notes
            .iter()
            .find(|n| n.id == note_id)
            .expect("note in returned manifest")
            .title
            .clone();
        assert_eq!(
            returned_title, "After",
            "the manifest open_workspace returns to the caller must reflect the resync, \
             not the stale pre-recovery copy read before recover_pending_restores ran"
        );
        assert!(
            manifest.trash.is_empty(),
            "the old trash item must have been pruned on this same open"
        );

        let on_disk: WorkspaceManifest = serde_json::from_str(
            &std::fs::read_to_string(&manifest_path).expect("read manifest after open"),
        )
        .expect("parse manifest after open");
        let on_disk_title = on_disk
            .root_notes
            .iter()
            .find(|n| n.id == note_id)
            .expect("note in on-disk manifest")
            .title
            .clone();
        assert_eq!(
            on_disk_title, "After",
            "the trash-pruning save must not overwrite the resync with the stale in-memory copy"
        );
        assert!(
            on_disk.trash.is_empty(),
            "the pruning save must persist the pruned trash, not the stale pre-recovery copy"
        );
    }
}
