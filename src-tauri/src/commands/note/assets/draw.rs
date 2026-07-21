use std::path::{Path, PathBuf};

use super::naming::{hash_bytes, normalize_workspace_asset_src, sanitize_file_stem};
use crate::commands::note::{assets_dir_path, note_context, note_error_context};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

/// Persist the JSON payload of a `draw_block` drawing into the workspace
/// assets directory and return the relative `src` path (`.nevo/assets/...`).
///
/// Drawings can be sizable (thousands of stroke points) and are mutated
/// frequently while editing on the canvas — so they live in their own asset
/// file (like images/files) rather than inline in the note document, which is
/// re-serialized wholesale on every save and mirrored into the snapshot
/// history. Naming embeds the stable `draw_id` plus a short content hash so
/// consecutive saves replace the previous payload (one drawing per id).
///
/// The blocking I/O (hash + write) runs on the blocking thread pool via
/// `spawn_blocking` so the WebKitGTK main thread is never stalled.
#[tauri::command]
pub async fn save_draw_asset(
    workspace_path: String,
    draw_id: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_draw_asset_inner(workspace_path, draw_id, bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) fn save_draw_asset_inner(
    workspace_path: String,
    draw_id: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let logger = crate::logging::logger();
    if bytes.is_empty() {
        let _ = logger.error(
            "tauri.note",
            "save_draw_asset",
            "Rejected empty draw payload",
            LogContext::default().with_error(LogError {
                kind: Some("validation".to_string()),
                message: "Draw payload is empty".to_string(),
                details: None,
            }),
        );
        return Err("Draw payload is empty".to_string());
    }

    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_draw_asset",
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
            "save_draw_asset",
            "Failed to create assets directory",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    // Filename: draw-<drawId>-<hashShort>.draw.json — keeps one payload per
    // draw_id (consecutive saves overwrite the same file) while still letting
    // the content-addressed GC scanner discover the reference.
    let hash = hash_bytes(&bytes);
    let hash_short: String = hash.chars().take(16).collect();
    let safe_draw_id = sanitize_file_stem(&draw_id);
    let draw_stem = if safe_draw_id.is_empty() {
        "draw".to_string()
    } else {
        format!("draw-{}", safe_draw_id)
    };
    let final_name = format!("{}-{}.draw.json", draw_stem, hash_short);

    // Remove any previous payload for the same draw_id (different content hash)
    // so we don't accumulate stale copies on every edit.
    remove_previous_draw_payloads(&assets_dir, &draw_stem, &final_name);

    let final_path = assets_dir.join(&final_name);
    crate::commands::path_utils::write_atomic(&final_path, &bytes).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "save_draw_asset",
            "Failed to write draw asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let _ = logger.info(
        "tauri.note",
        "save_draw_asset",
        "Saved draw asset into workspace",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "drawId": draw_id,
            "hash": hash,
            "bytes": bytes.len(),
        })),
    );

    Ok(format!(".nevo/assets/{}", final_name))
}

/// Remove prior `draw-<drawId>-*.draw.json` files except the one matching
/// `keep_name`. Best-effort — stale files left behind are harmless (GC will
/// reap them when the note no longer references the asset).
fn remove_previous_draw_payloads(assets_dir: &Path, draw_stem: &str, keep_name: &str) {
    let Ok(entries) = std::fs::read_dir(assets_dir) else {
        return;
    };
    let prefix = format!("{}-", draw_stem);
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("");
        if name.starts_with(&prefix) && name.ends_with(".draw.json") && name != keep_name {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// Read the JSON payload bytes of a drawing asset back from disk.
///
/// Runs on the blocking thread pool: the draw payload can be large and reads
/// must not stall the WebKitGTK main thread (same rationale as
/// `import_asset_by_path`).
#[tauri::command]
pub async fn read_draw_asset(workspace_path: String, src: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || read_draw_asset_inner(workspace_path, src))
        .await
        .map_err(|error| error.to_string())?
}

pub(super) fn read_draw_asset_inner(
    workspace_path: String,
    src: String,
) -> Result<Vec<u8>, String> {
    let logger = crate::logging::logger();
    let (relative_src, asset_path) =
        normalize_workspace_asset_src(&src).inspect_err(|message| {
            let _ = logger.error(
                "tauri.note",
                "read_draw_asset",
                "Rejected asset src",
                LogContext::default().with_error(LogError {
                    kind: Some("path".to_string()),
                    message: message.clone(),
                    details: None,
                }),
            );
        })?;

    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "read_draw_asset",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;

    let abs_path = workspace_path.join(&asset_path);
    let bytes = std::fs::read(&abs_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "read_draw_asset",
            "Failed to read draw asset",
            note_context(&workspace_path.to_string_lossy())
                .with_payload(serde_json::json!({
                    "src": relative_src,
                }))
                .with_error(LogError {
                    kind: Some("io".to_string()),
                    message: message.clone(),
                    details: None,
                }),
        );
        message
    })?;

    Ok(bytes)
}

/// Read the latest drawing payload for a `draw_id`, ignoring the `src` recorded
/// in the note document. This recovers a drawing whose note reference went
/// stale — e.g. the app was closed straight from the canvas, so the freshly
/// written asset's `src` never reached the note (the editor pane that applies
/// the update is unmounted while the canvas is open). `save_draw_asset` keeps
/// exactly one `draw-<drawId>-<hash>.draw.json` per id on disk, so the most
/// recently modified match is the current drawing.
#[tauri::command]
pub async fn read_latest_draw_asset(
    workspace_path: String,
    draw_id: String,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_latest_draw_asset_inner(workspace_path, draw_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) fn read_latest_draw_asset_inner(
    workspace_path: String,
    draw_id: String,
) -> Result<Vec<u8>, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "read_latest_draw_asset",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let assets_dir = assets_dir_path(&workspace_path);

    let safe_draw_id = sanitize_file_stem(&draw_id);
    if safe_draw_id.is_empty() {
        return Err("Invalid draw id".to_string());
    }
    let prefix = format!("draw-{}-", safe_draw_id);

    let Ok(entries) = std::fs::read_dir(&assets_dir) else {
        return Err("No drawing payload found".to_string());
    };
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("");
        if name.starts_with(&prefix) && name.ends_with(".draw.json") {
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            if best.as_ref().is_none_or(|(t, _)| mtime >= *t) {
                best = Some((mtime, path));
            }
        }
    }

    let Some((_, path)) = best else {
        return Err("No drawing payload found".to_string());
    };
    std::fs::read(&path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "read_latest_draw_asset",
            "Failed to read draw asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })
}
