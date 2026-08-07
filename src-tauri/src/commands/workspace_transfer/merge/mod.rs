//! Merges a `.nevoz`/`.zip` archive into the currently open local workspace:
//! extracts the archive to a temp directory (reusing the same extractor as
//! import-as-new), then copies its notes/folders/assets/V2-databases into the
//! current workspace under freshly allocated ids, nesting the imported tree
//! under a new "Imported: <name>" root folder. Runs entirely in Rust — the
//! frontend has no filesystem access to the extracted temp directory, and
//! shuttling note content + asset bytes + SQLite rows over IPC for TS-side
//! orchestration would be both slow and unnecessary, since id-remap is pure
//! `serde_json::Value` manipulation.
//!
//! Deferred (reported via `MergeReport`, not imported): standalone kanban
//! boards and per-note snapshot history (see `extras::count_deferred`).
//! `.nevo/collab/*.yjs` is never copied — the editor rebuilds each note's
//! Y.Doc from its `.nevo` JSON on first open, and the old CRDT state refers
//! to pre-remap ids anyway.

mod assets;
mod databases;
mod extras;
mod idmap;
mod manifest_merge;
mod notes;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use super::TransferProgress;
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::WorkspaceManifest;

/// Reported back to the frontend so it can toast an honest summary — merge
/// always succeeds-or-fails as a whole (no partial-merge state is exposed),
/// but not everything in the archive is imported (see the module doc).
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MergeReport {
    pub imported_notes: u64,
    pub imported_folders: u64,
    pub imported_assets: u64,
    pub imported_databases: u64,
    pub skipped_boards: u64,
    pub skipped_snapshots: u64,
}

/// RAII guard that deletes an extracted-archive temp directory on drop,
/// success or failure alike. Merge owns its temp directory end-to-end
/// (unlike `extract_workspace_archive_to_temp`, whose caller is responsible
/// for `release_workspace_archive_temp`), so cleanup must happen here.
struct TempDirGuard(PathBuf);

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn run_merge(
    temp_dir: &Path,
    current_root: &Path,
    on_event: &tauri::ipc::Channel<TransferProgress>,
) -> Result<MergeReport, String> {
    let imported_manifest_path = temp_dir.join(".nevo").join("workspace.json");
    let imported_manifest_json = std::fs::read_to_string(&imported_manifest_path)
        .map_err(|error| format!("Unable to read the imported workspace manifest: {error}"))?;
    let imported_manifest: WorkspaceManifest = serde_json::from_str(&imported_manifest_json)
        .map_err(|error| format!("Imported workspace manifest is not valid JSON: {error}"))?;

    let mut maps = idmap::build_id_maps(&imported_manifest);
    let current_root_string = current_root.to_string_lossy().into_owned();

    let imported_notes = notes::copy_and_remap_notes(
        temp_dir,
        current_root,
        &imported_manifest,
        &mut maps,
        on_event,
    )?;

    databases::copy_database_records(temp_dir, current_root, &maps.databases)?;
    let imported_assets = assets::copy_new_assets(temp_dir, current_root)?;
    let (skipped_boards, skipped_snapshots) = extras::count_deferred(temp_dir);
    extras::merge_graph_index(temp_dir, current_root, &maps);
    extras::copy_templates(temp_dir, current_root);

    let imported_folders =
        manifest_merge::merge_manifest_tree(&current_root_string, &imported_manifest, &maps)?;

    let _ = on_event.send(TransferProgress::Finished);

    Ok(MergeReport {
        imported_notes,
        imported_folders,
        imported_assets,
        imported_databases: maps.databases.len() as u64,
        skipped_boards,
        skipped_snapshots,
    })
}

/// Opens the archive picker, extracts the chosen archive to a temp directory,
/// and merges it into the local workspace at `current_workspace_path`.
/// Returns `Ok(None)` if the archive picker was cancelled. The temp
/// directory is always removed before returning, success or error alike.
#[tauri::command]
pub async fn merge_workspace_archive(
    app: AppHandle,
    current_workspace_path: String,
    password: Option<String>,
    on_event: tauri::ipc::Channel<TransferProgress>,
) -> Result<Option<MergeReport>, String> {
    let current_root = normalize_workspace_path(&current_workspace_path)?;
    if !current_root.join(".nevo/workspace.json").is_file() {
        return Err("The currently open workspace is not a local Nevo workspace".to_string());
    }

    let Some(archive_path) = super::pick_archive_path(app.clone()).await? else {
        return Ok(None);
    };
    let temp_root = super::transfer_temp_root(&app)?;

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<MergeReport, String> {
        std::fs::create_dir_all(&temp_root).map_err(|error| error.to_string())?;
        let dest = temp_root.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dest).map_err(|error| error.to_string())?;
        let _cleanup = TempDirGuard(dest.clone());

        super::archive_read::extract_archive(&archive_path, &dest, password.as_deref(), &on_event)?;
        run_merge(&dest, &current_root, &on_event)
    })
    .await
    .map_err(|error| error.to_string())??;

    Ok(Some(result))
}
