use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

use super::naming::{
    find_existing_asset_path, hash_bytes, normalize_extension, sanitize_file_stem,
};
use crate::commands::note::{
    assets_dir_path, note_context, note_error_context, ImportedImageAsset, PickedImportedAsset,
};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

const MAX_LOCAL_ASSET_BYTES: u64 = 100 * 1024 * 1024;

#[tauri::command]
pub fn import_image_asset(
    workspace_path: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<ImportedImageAsset, String> {
    let logger = crate::logging::logger();
    if bytes.is_empty() {
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Rejected empty asset payload",
            LogContext::default().with_error(LogError {
                kind: Some("validation".to_string()),
                message: "Image payload is empty".to_string(),
                details: None,
            }),
        );
        return Err("Image payload is empty".to_string());
    }

    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let assets_dir = assets_dir_path(&workspace_path);
    std::fs::create_dir_all(&assets_dir).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Failed to create assets directory",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let hash = hash_bytes(&bytes);
    if let Some(existing_path) = find_existing_asset_path(&assets_dir, &hash) {
        let existing_name = existing_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                let message = "Unable to resolve existing asset path".to_string();
                let _ = logger.error(
                    "tauri.note",
                    "import_image_asset",
                    "Failed to resolve deduplicated asset path",
                    note_error_context(&workspace_path, "path", message.clone()),
                );
                message
            })?;

        let _ = logger.debug(
            "tauri.note",
            "import_image_asset",
            "Reused deduplicated asset",
            diagnostics_enabled,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "fileName": file_name,
                "hash": hash,
                "deduplicated": true,
            })),
        );

        return Ok(ImportedImageAsset {
            src: format!(".nevo/assets/{}", existing_name),
            hash,
            deduplicated: true,
            bytes: bytes.len(),
        });
    }

    let extension = normalize_extension(&file_name);
    let stem = sanitize_file_stem(&file_name);
    let safe_stem = if stem.is_empty() {
        "asset".to_string()
    } else {
        stem
    };
    let final_name = format!("{}-{}.{}", hash, safe_stem, extension);
    let final_path = assets_dir.join(&final_name);
    std::fs::write(&final_path, bytes).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Failed to write imported asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let size_bytes = std::fs::metadata(&final_path)
        .map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.note",
                "import_image_asset",
                "Failed to read imported asset metadata",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?
        .len() as usize;

    let _ = logger.info(
        "tauri.note",
        "import_image_asset",
        "Imported asset into workspace",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "fileName": file_name,
            "hash": hash,
            "deduplicated": false,
            "bytes": size_bytes,
        })),
    );

    Ok(ImportedImageAsset {
        src: format!(".nevo/assets/{}", final_name),
        hash,
        deduplicated: false,
        bytes: size_bytes,
    })
}

/// Import a file into the workspace assets directory.
///
/// The blocking work (whole-file read, SHA-256 hash, write) runs on the
/// blocking thread pool via `spawn_blocking` so the WebKitGTK main thread is
/// never stalled — a synchronous command here froze the UI for large
/// audio/video files in the packaged build.
async fn pick_asset_path(app: AppHandle, kind: &str) -> Result<Option<PathBuf>, String> {
    let dialog = app.dialog().file();
    let dialog = match kind {
        "image" => dialog.add_filter(
            "Image",
            &["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"],
        ),
        "audio" => dialog.add_filter("Audio", &["mp3", "m4a", "wav", "ogg", "flac", "aac"]),
        "video" => dialog.add_filter("Video", &["mp4", "webm", "ogv", "mov", "mkv", "avi"]),
        "file" => dialog,
        _ => return Err("Unsupported asset picker kind".to_string()),
    };
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog.pick_file(move |selection| {
        let _ = sender.send(selection);
    });
    receiver
        .await
        .map_err(|_| "Asset picker was closed unexpectedly".to_string())?
        .map(|selection| selection.into_path().map_err(|error| error.to_string()))
        .transpose()
}

async fn import_selected_asset(
    workspace_path: String,
    source_path: PathBuf,
) -> Result<PickedImportedAsset, String> {
    let file_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Selected asset has no valid file name".to_string())?
        .to_string();
    let source_path = source_path.to_string_lossy().into_owned();
    let imported_file_name = file_name.clone();
    let asset = tauri::async_runtime::spawn_blocking(move || {
        import_asset_by_path_inner(workspace_path, source_path, imported_file_name)
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(PickedImportedAsset { asset, file_name })
}

#[tauri::command]
pub async fn pick_and_import_asset(
    app: AppHandle,
    workspace_path: String,
    kind: String,
) -> Result<Option<PickedImportedAsset>, String> {
    let Some(source_path) = pick_asset_path(app, &kind).await? else {
        return Ok(None);
    };
    import_selected_asset(workspace_path, source_path)
        .await
        .map(Some)
}

fn clipboard_image_path(text: &str) -> Option<PathBuf> {
    let value = text.lines().find(|line| !line.trim().is_empty())?.trim();
    let path = if value.starts_with("file://") {
        reqwest::Url::parse(value).ok()?.to_file_path().ok()?
    } else {
        let candidate = PathBuf::from(value);
        if !candidate.is_absolute() {
            return None;
        }
        candidate
    };
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "avif" | "bmp"
    )
    .then_some(path)
}

#[tauri::command]
pub async fn import_clipboard_image_path(
    app: AppHandle,
    workspace_path: String,
) -> Result<Option<PickedImportedAsset>, String> {
    let text = app
        .clipboard()
        .read_text()
        .map_err(|error| error.to_string())?;
    let Some(source_path) = clipboard_image_path(&text) else {
        return Ok(None);
    };
    import_selected_asset(workspace_path, source_path)
        .await
        .map(Some)
}

fn import_asset_by_path_inner(
    workspace_path: String,
    source_path: String,
    file_name: String,
) -> Result<ImportedImageAsset, String> {
    let logger = crate::logging::logger();

    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "import_asset_by_path",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let assets_dir = assets_dir_path(&workspace_path);
    std::fs::create_dir_all(&assets_dir).map_err(|error| error.to_string())?;

    let metadata = std::fs::metadata(&source_path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_LOCAL_ASSET_BYTES {
        return Err("Selected asset is not a file or exceeds the size limit".to_string());
    }
    let bytes = std::fs::read(&source_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_asset_by_path",
            "Failed to read source file",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    if bytes.is_empty() {
        return Err("Source file is empty".to_string());
    }

    let hash = hash_bytes(&bytes);
    if let Some(existing_path) = find_existing_asset_path(&assets_dir, &hash) {
        let existing_name = existing_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Unable to resolve existing asset path".to_string())?;

        let _ = logger.debug(
            "tauri.note",
            "import_asset_by_path",
            "Reused deduplicated asset",
            diagnostics_enabled,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "fileName": file_name,
                "hash": hash,
                "deduplicated": true,
            })),
        );

        return Ok(ImportedImageAsset {
            src: format!(".nevo/assets/{}", existing_name),
            hash,
            deduplicated: true,
            bytes: bytes.len(),
        });
    }

    let extension = normalize_extension(&file_name);
    let stem = sanitize_file_stem(&file_name);
    let safe_stem = if stem.is_empty() {
        "asset".to_string()
    } else {
        stem
    };
    let final_name = format!("{}-{}.{}", hash, safe_stem, extension);
    let final_path = assets_dir.join(&final_name);
    std::fs::write(&final_path, &bytes).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_asset_by_path",
            "Failed to write imported asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let size_bytes = bytes.len();

    let _ = logger.info(
        "tauri.note",
        "import_asset_by_path",
        "Imported asset from path into workspace",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "fileName": file_name,
            "hash": hash,
            "deduplicated": false,
            "bytes": size_bytes,
        })),
    );

    Ok(ImportedImageAsset {
        src: format!(".nevo/assets/{}", final_name),
        hash,
        deduplicated: false,
        bytes: size_bytes,
    })
}
