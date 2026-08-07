//! Full local-workspace export/import in Nevo's own `.nevoz` (ZIP-based)
//! format: pack an entire local workspace (`notes/**` + the relevant parts of
//! `.nevo/**`) into a single portable archive, and restore it either as a
//! brand-new workspace or by extracting it to a temp directory that the
//! frontend then merges into the currently open workspace.
//!
//! Encryption: when `password` is supplied, every archive entry (including
//! the header) is AES-256 encrypted via `zip`'s `aes-crypto` feature
//! (`archive_write::entry_options`). Reading transparently decrypts AES- or
//! legacy-ZipCrypto-protected archives (`archive_read.rs`).

mod archive_read;
mod archive_write;
mod collect;
mod header;
mod merge;

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

pub use header::ExportHeader;
// Glob re-export so `merge_workspace_archive`'s Tauri-macro-generated sibling
// item (resolved by `generate_handler!` as `workspace_transfer::<command>`)
// is re-exported alongside the function and `MergeReport`, matching the
// pattern used by `note/mod.rs` for its own command submodules.
pub use merge::*;

use crate::commands::note::pick_export_path;
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::system::pick_workspace_directory;

/// Progress events streamed to the frontend while an export/import runs.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TransferProgress {
    Started {
        total: u64,
    },
    File {
        done: u64,
        total: u64,
    },
    /// Sent once, right after `Started`, when the export is password-protected.
    Encrypting,
    Extracting {
        done: u64,
        total: u64,
    },
    Finished,
}

/// Result of extracting an archive into a temporary directory for a later
/// frontend-driven merge into the currently open workspace.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedArchive {
    pub temp_dir: String,
    pub header: ExportHeader,
}

/// Subdirectory of the app cache dir that holds extracted-but-not-yet-merged
/// archives. `release_workspace_archive_temp` only ever deletes paths inside
/// this root.
const TRANSFER_TEMP_SUBDIR: &str = "workspace-transfer";

async fn pick_archive_path(app: AppHandle) -> Result<Option<PathBuf>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Nevo Workspace Archive", &["nevoz", "zip"])
        .pick_file(move |selection| {
            let _ = sender.send(selection);
        });
    receiver
        .await
        .map_err(|_| "Archive picker was closed unexpectedly".to_string())?
        .map(|selection| selection.into_path().map_err(|error| error.to_string()))
        .transpose()
}

fn transfer_temp_root(app: &AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    Ok(cache_dir.join(TRANSFER_TEMP_SUBDIR))
}

fn run_export(
    root: &std::path::Path,
    export_path: &std::path::Path,
    password: Option<String>,
    on_event: &tauri::ipc::Channel<TransferProgress>,
) -> Result<(), String> {
    let header = header::build_header(root, password.is_some())?;
    let files = collect::collect_full_workspace_files(root)?;
    let file = std::fs::File::create(export_path).map_err(|error| error.to_string())?;
    archive_write::write_workspace_archive(
        file,
        root,
        &files,
        &header,
        password.as_deref(),
        on_event,
    )
}

/// Exports the workspace at `workspace_path` to a `.nevoz` archive the user
/// picks with a save dialog. Returns `Ok(false)` if the dialog was cancelled.
#[tauri::command]
pub async fn export_workspace_archive(
    app: AppHandle,
    workspace_path: String,
    default_file_name: String,
    password: Option<String>,
    on_event: tauri::ipc::Channel<TransferProgress>,
) -> Result<bool, String> {
    let root = normalize_workspace_path(&workspace_path)?;
    if !root.join(".nevo/workspace.json").is_file() {
        return Err("The selected folder is not a Nevo workspace".to_string());
    }
    let Some(export_path) =
        pick_export_path(app, default_file_name, "Nevo Workspace Archive", "nevoz").await?
    else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        run_export(&root, &export_path, password, &on_event)
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(true)
}

fn validate_destination_is_available(dest: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|error| error.to_string())?;
    if dest.join(".nevo/workspace.json").is_file() {
        return Err("The selected folder already contains a Nevo workspace".to_string());
    }
    let mut entries = std::fs::read_dir(dest).map_err(|error| error.to_string())?;
    if entries.next().is_some() {
        return Err("Choose an empty folder for the new workspace".to_string());
    }
    Ok(())
}

fn run_import_as_new(
    archive_path: PathBuf,
    password: Option<String>,
    dest: PathBuf,
    on_event: &tauri::ipc::Channel<TransferProgress>,
) -> Result<String, String> {
    validate_destination_is_available(&dest)?;
    archive_read::extract_archive(&archive_path, &dest, password.as_deref(), on_event)?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Imports a `.nevoz`/`.zip` archive as a brand-new workspace: open-dialog for
/// the archive, validate its header (fails fast on a bad file or wrong
/// password before asking for a destination), folder-picker for an empty
/// destination, then extract. Returns the new workspace path, or `None` if
/// either dialog was cancelled.
#[tauri::command]
pub async fn import_workspace_archive_as_new(
    app: AppHandle,
    password: Option<String>,
    on_event: tauri::ipc::Channel<TransferProgress>,
) -> Result<Option<String>, String> {
    let Some(archive_path) = pick_archive_path(app.clone()).await? else {
        return Ok(None);
    };

    {
        let archive_path = archive_path.clone();
        let password = password.clone();
        tauri::async_runtime::spawn_blocking(move || {
            archive_read::read_archive_header(&archive_path, password.as_deref())
        })
        .await
        .map_err(|error| error.to_string())??;
    }

    let Some(destination) = pick_workspace_directory(app).await? else {
        return Ok(None);
    };
    let dest_path = normalize_workspace_path(&destination)?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_import_as_new(archive_path, password, dest_path, &on_event)
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(Some(result))
}

fn run_extract_to_temp(
    archive_path: PathBuf,
    password: Option<String>,
    temp_root: PathBuf,
    on_event: &tauri::ipc::Channel<TransferProgress>,
) -> Result<ExtractedArchive, String> {
    std::fs::create_dir_all(&temp_root).map_err(|error| error.to_string())?;
    let dest = temp_root.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&dest).map_err(|error| error.to_string())?;
    let header =
        archive_read::extract_archive(&archive_path, &dest, password.as_deref(), on_event)?;
    Ok(ExtractedArchive {
        temp_dir: dest.to_string_lossy().into_owned(),
        header,
    })
}

/// Extracts a `.nevoz`/`.zip` archive into a fresh subdirectory of the app
/// cache dir, for a later frontend-driven merge into the currently open
/// workspace. Returns `None` if the archive picker was cancelled. Callers
/// must eventually call `release_workspace_archive_temp` with the returned
/// `temp_dir` to clean it up.
#[tauri::command]
pub async fn extract_workspace_archive_to_temp(
    app: AppHandle,
    password: Option<String>,
    on_event: tauri::ipc::Channel<TransferProgress>,
) -> Result<Option<ExtractedArchive>, String> {
    let Some(archive_path) = pick_archive_path(app.clone()).await? else {
        return Ok(None);
    };
    let temp_root = transfer_temp_root(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_extract_to_temp(archive_path, password, temp_root, &on_event)
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(Some(result))
}

fn remove_temp_dir(app: &AppHandle, temp_dir: &str) -> Result<(), String> {
    let root = transfer_temp_root(app)?;
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Unable to resolve the transfer temp root: {error}"))?;
    let target = PathBuf::from(temp_dir);
    let canonical_target = target
        .canonicalize()
        .map_err(|error| format!("Unable to resolve the temp directory: {error}"))?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(
            "Refusing to remove a path outside the workspace-transfer temp root".to_string(),
        );
    }
    std::fs::remove_dir_all(&canonical_target).map_err(|error| error.to_string())
}

/// Deletes a directory previously returned by `extract_workspace_archive_to_temp`.
/// Refuses to remove anything outside `app_cache_dir/workspace-transfer/`.
#[tauri::command]
pub async fn release_workspace_archive_temp(
    app: AppHandle,
    temp_dir: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_temp_dir(&app, &temp_dir))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests;
