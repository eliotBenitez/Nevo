use std::collections::HashSet;
use std::path::Path;

use super::paths::{
    assets_dir_path, notes_dir_path, settings_path, snapshots_dir_path, workspace_context,
    workspace_error_context,
};
use super::plugins::list_plugins;
use super::settings::is_extended_diagnostics_enabled;
use super::types::{FolderMeta, WorkspaceCleanupReport, WorkspaceDiagnostics, WorkspaceManifest};
use crate::commands::path_utils::normalize_workspace_path;
use crate::logging::{LogContext, LogError};

fn count_folders(tree: &[FolderMeta]) -> usize {
    tree.iter()
        .map(|folder| 1 + count_folders(&folder.children))
        .sum()
}

fn count_notes(tree: &[FolderMeta]) -> usize {
    tree.iter()
        .map(|folder| folder.notes.len() + count_notes(&folder.children))
        .sum()
}

fn count_files_in_dir(dir: &Path) -> usize {
    if !dir.exists() {
        return 0;
    }

    std::fs::read_dir(dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() {
                count_files_in_dir(&path)
            } else {
                1
            }
        })
        .sum()
}

fn dir_size_bytes(dir: &Path) -> u64 {
    if !dir.exists() {
        return 0;
    }

    std::fs::read_dir(dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() {
                dir_size_bytes(&path)
            } else {
                std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
            }
        })
        .sum()
}

fn prune_snapshot_files(
    dir: &Path,
    keep_per_note: usize,
) -> Result<WorkspaceCleanupReport, String> {
    if !dir.exists() {
        return Ok(WorkspaceCleanupReport {
            removed_files: 0,
            bytes_freed: 0,
        });
    }

    let mut report = WorkspaceCleanupReport {
        removed_files: 0,
        bytes_freed: 0,
    };
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let note_dir = entry.path();
        if !note_dir.is_dir() {
            continue;
        }

        let mut files = std::fs::read_dir(&note_dir)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|file| file.path())
            .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
            .collect::<Vec<_>>();
        files.sort_by(|a, b| b.cmp(a));

        for path in files.into_iter().skip(keep_per_note) {
            report.bytes_freed += std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            report.removed_files += 1;
        }
    }

    Ok(report)
}

/// Extract every `.nevo/assets/<filename>` reference from raw bytes.
/// Works for JSON note files and for the binary Yjs CRDT state alike, since the
/// asset path is stored as plain UTF-8 in all of them. An asset filename is the
/// run of `[A-Za-z0-9._-]` characters following the prefix.
fn extract_asset_refs_from_bytes(bytes: &[u8], refs: &mut HashSet<String>) {
    const NEEDLE: &str = ".nevo/assets/";
    let text = String::from_utf8_lossy(bytes);
    let mut search_from = 0usize;
    while let Some(rel) = text[search_from..].find(NEEDLE) {
        let after = search_from + rel + NEEDLE.len();
        let name: String = text[after..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
            .collect();
        if !name.is_empty() {
            refs.insert(format!(".nevo/assets/{}", name));
        }
        search_from = after.max(search_from + 1);
    }
}

fn collect_asset_refs_recursive(path: &Path, refs: &mut HashSet<String>) {
    if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                collect_asset_refs_recursive(&entry.path(), refs);
            }
        }
    } else if path.is_file() {
        if let Ok(bytes) = std::fs::read(path) {
            extract_asset_refs_from_bytes(&bytes, refs);
        }
    }
}

/// Collect all referenced assets across every content source. The editor's live
/// content lives in the Yjs CRDT state (`.nevo/collab`), which can be ahead of the
/// serialized `.nevo` note JSON — scanning only the notes dir wrongly treats
/// Yjs-only assets (e.g. freshly added video/audio) as orphaned and deletes them.
fn collect_referenced_assets(workspace_path: &str) -> Result<HashSet<String>, String> {
    let mut refs = HashSet::new();
    collect_asset_refs_recursive(&notes_dir_path(workspace_path), &mut refs);
    let nevo_dir = Path::new(workspace_path).join(".nevo");
    collect_asset_refs_recursive(&nevo_dir.join("collab"), &mut refs);
    collect_asset_refs_recursive(&nevo_dir.join("snapshots"), &mut refs);
    collect_asset_refs_recursive(&nevo_dir.join("boards"), &mut refs);
    // Drawings keep their image references inside `.draw.json` payloads, which
    // live in `.nevo/assets/` — a directory none of the scanners above visit.
    // Without this, an image used only by a drawing looks orphaned and gets
    // reaped on cleanup (the drawing survives via the note's `src`, but its
    // embedded images vanish on app re-entry).
    collect_draw_payload_refs(&assets_dir_path(workspace_path), &mut refs);
    Ok(refs)
}

/// Pull nested `.nevo/assets/...` references out of every `.draw.json` payload in
/// the assets directory. Only the small JSON drawings are read (not the binary
/// assets), so this stays cheap even on large workspaces.
fn collect_draw_payload_refs(assets_dir: &Path, refs: &mut HashSet<String>) {
    let Ok(entries) = std::fs::read_dir(assets_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_draw = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|name| name.ends_with(".draw.json"))
            .unwrap_or(false);
        if is_draw {
            if let Ok(bytes) = std::fs::read(&path) {
                extract_asset_refs_from_bytes(&bytes, refs);
            }
        }
    }
}

// Offload to a blocking thread: recursively scans assets/snapshots/collab and
// computes directory sizes, which would otherwise freeze the UI thread on large
// workspaces (see AGENTS.md "Platform Gotchas").
#[tauri::command]
pub async fn get_workspace_diagnostics(
    workspace_path: String,
) -> Result<WorkspaceDiagnostics, String> {
    tauri::async_runtime::spawn_blocking(move || get_workspace_diagnostics_sync(workspace_path))
        .await
        .map_err(|e| e.to_string())?
}

fn get_workspace_diagnostics_sync(workspace_path: String) -> Result<WorkspaceDiagnostics, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "get_workspace_diagnostics",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_str = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_str);
    let manifest_path = Path::new(&workspace_str).join(".nevo/workspace.json");
    let manifest_content = std::fs::read_to_string(&manifest_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.workspace",
            "get_workspace_diagnostics",
            "Failed to read workspace manifest",
            workspace_error_context(&workspace_str, "io", message.clone()),
        );
        message
    })?;
    let manifest =
        serde_json::from_str::<WorkspaceManifest>(&manifest_content).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.workspace",
                "get_workspace_diagnostics",
                "Failed to parse workspace manifest",
                workspace_error_context(&workspace_str, "serde", message.clone()),
            );
            message
        })?;

    let notes_dir = notes_dir_path(&workspace_str);
    let assets_dir = assets_dir_path(&workspace_str);
    let snapshots_dir = snapshots_dir_path(&workspace_str);
    let nevo_dir = Path::new(&workspace_str).join(".nevo");
    let logs_path = logger
        .log_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default();

    let diagnostics = WorkspaceDiagnostics {
        workspace_path: workspace_str.clone(),
        notes_folder_path: notes_dir.to_string_lossy().into_owned(),
        assets_folder_path: assets_dir.to_string_lossy().into_owned(),
        nevo_folder_path: nevo_dir.to_string_lossy().into_owned(),
        settings_path: settings_path(&workspace_str).to_string_lossy().into_owned(),
        logs_path,
        note_count: manifest.root_notes.len() + count_notes(&manifest.tree),
        folder_count: count_folders(&manifest.tree),
        plugin_count: list_plugins(workspace_str.clone())?.len(),
        snapshot_count: count_files_in_dir(&snapshots_dir),
        asset_count: count_files_in_dir(&assets_dir),
        workspace_bytes: dir_size_bytes(Path::new(&workspace_str)),
        notes_bytes: dir_size_bytes(&notes_dir),
        assets_bytes: dir_size_bytes(&assets_dir),
        snapshots_bytes: dir_size_bytes(&snapshots_dir),
    };

    let _ = logger.debug(
        "tauri.workspace",
        "get_workspace_diagnostics",
        "Collected workspace diagnostics",
        diagnostics_enabled,
        workspace_context(&workspace_str).with_payload(serde_json::json!({
            "noteCount": diagnostics.note_count,
            "pluginCount": diagnostics.plugin_count,
            "snapshotCount": diagnostics.snapshot_count,
        })),
    );

    Ok(diagnostics)
}

#[tauri::command]
pub fn prune_workspace_snapshots(
    workspace_path: String,
    keep_per_note: u32,
) -> Result<WorkspaceCleanupReport, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "prune_workspace_snapshots",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_path);
    let report = prune_snapshot_files(
        &snapshots_dir_path(&workspace_path),
        keep_per_note.max(1) as usize,
    )
    .map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "prune_workspace_snapshots",
            "Failed to prune workspace snapshots",
            workspace_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    let _ = logger.info(
        "tauri.workspace",
        "prune_workspace_snapshots",
        "Pruned workspace snapshots",
        diagnostics_enabled,
        workspace_context(&workspace_path).with_payload(serde_json::json!({
            "removedFiles": report.removed_files,
            "bytesFreed": report.bytes_freed,
            "keepPerNote": keep_per_note.max(1),
        })),
    );
    Ok(report)
}

#[tauri::command]
pub fn cleanup_orphaned_assets(workspace_path: String) -> Result<WorkspaceCleanupReport, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "cleanup_orphaned_assets",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_str = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = is_extended_diagnostics_enabled(&workspace_str);
    let assets_dir = assets_dir_path(&workspace_str);
    if !assets_dir.exists() {
        return Ok(WorkspaceCleanupReport {
            removed_files: 0,
            bytes_freed: 0,
        });
    }

    let refs = collect_referenced_assets(&workspace_str).map_err(|message| {
        let _ = logger.error(
            "tauri.workspace",
            "cleanup_orphaned_assets",
            "Failed to collect referenced assets",
            workspace_error_context(&workspace_str, "io", message.clone()),
        );
        message
    })?;
    let mut report = WorkspaceCleanupReport {
        removed_files: 0,
        bytes_freed: 0,
    };

    for entry in std::fs::read_dir(&assets_dir)
        .map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.workspace",
                "cleanup_orphaned_assets",
                "Failed to read assets directory",
                workspace_error_context(&workspace_str, "io", message.clone()),
            );
            message
        })?
        .flatten()
    {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|value| value.to_str()) {
            Some(name) => name,
            None => continue,
        };
        let relative = format!(".nevo/assets/{}", name);
        if refs.contains(&relative) {
            continue;
        }

        report.bytes_freed += std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
        std::fs::remove_file(&path).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.workspace",
                "cleanup_orphaned_assets",
                "Failed to remove orphaned asset",
                workspace_error_context(&workspace_str, "io", message.clone()),
            );
            message
        })?;
        report.removed_files += 1;
    }

    let _ = logger.info(
        "tauri.workspace",
        "cleanup_orphaned_assets",
        "Cleaned up orphaned assets",
        diagnostics_enabled,
        workspace_context(&workspace_str).with_payload(serde_json::json!({
            "removedFiles": report.removed_files,
            "bytesFreed": report.bytes_freed,
        })),
    );

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::note::{create_note, save_note};
    use crate::commands::workspace::create_workspace;
    use chrono::Utc;
    use serde_json::json;
    use uuid::Uuid;

    struct TestWorkspace {
        path: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-maint-{}", Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Maint".to_string(),
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

    #[test]
    fn cleanup_keeps_images_referenced_only_by_a_drawing() {
        // Regression: re-entering the app reaped draw_block images because their
        // only reference lives inside the drawing's `.draw.json` payload, which
        // the asset scanner never read.
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();
        let assets_dir = assets_dir_path(&workspace_path);
        std::fs::create_dir_all(&assets_dir).expect("create assets dir");

        // The image asset + the drawing payload that references it, both in assets.
        let image_path = assets_dir.join("pasted-pic.png");
        std::fs::write(&image_path, b"png-bytes").expect("write image");
        let draw_name = "draw-d1-abc.draw.json";
        std::fs::write(
            assets_dir.join(draw_name),
            br#"{"version":1,"strokes":[{"type":"image","points":[{"x":0,"y":0},{"x":9,"y":9}],"color":"transparent","size":1,"assetSrc":".nevo/assets/pasted-pic.png"}]}"#,
        )
        .expect("write draw payload");

        // A note references the drawing payload so the `.draw.json` itself survives.
        let mut note = create_note(
            workspace_path.clone(),
            None,
            "Has drawing".to_string(),
            "📄".to_string(),
        )
        .expect("create note");
        note.content = json!({
            "type": "doc",
            "content": [{
                "type": "draw_block",
                "attrs": { "drawId": "d1", "src": format!(".nevo/assets/{}", draw_name), "svgPreview": "", "title": "" }
            }]
        });
        note.updated_at = Utc::now().to_rfc3339();
        save_note(workspace_path.clone(), note).expect("save note");

        cleanup_orphaned_assets(workspace_path).expect("cleanup");

        assert!(image_path.exists(), "drawing image must survive cleanup");
        assert!(assets_dir.join(draw_name).exists(), "drawing payload must survive");
    }
}
