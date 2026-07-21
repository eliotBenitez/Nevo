use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

use super::paths::{
    notes_dir_path, settings_path, snapshots_dir_path, workspace_context, workspace_error_context,
};
use super::plugins::ensure_bundled_system_plugins;
use super::settings::{is_extended_diagnostics_enabled, read_workspace_settings};
use super::types::{WorkspaceManifest, WorkspaceSettings};
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
        schema_version: 1,
        created_at: Utc::now().to_rfc3339(),
        root_order: vec![],
        tree: vec![],
        root_notes: vec![],
        trash: vec![],
        sidebar_note_order: vec![],
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
    ensure_bundled_system_plugins(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "open_workspace",
            "Failed to install bundled plugins",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
    })?;
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
