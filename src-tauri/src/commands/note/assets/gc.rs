use std::collections::HashSet;
use std::path::Path;

use super::naming::normalize_workspace_asset_src;
use crate::commands::note::{assets_dir_path, note_context, note_error_context};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

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

fn collect_current_asset_refs(workspace_path: &str) -> HashSet<String> {
    let mut refs = HashSet::new();
    collect_asset_refs_recursive(&Path::new(workspace_path).join("notes"), &mut refs);
    let nevo_dir = Path::new(workspace_path).join(".nevo");
    collect_asset_refs_recursive(&nevo_dir.join("collab"), &mut refs);
    collect_asset_refs_recursive(&nevo_dir.join("boards"), &mut refs);
    // Drawings and visual mind maps can keep nested asset references inside
    // their JSON payloads (in `.nevo/assets/`), which the scanners above never
    // visit — so an image used only there would look unreferenced and get
    // deleted.
    collect_json_payload_refs(&assets_dir_path(workspace_path), &mut refs);
    refs
}

/// Pull nested `.nevo/assets/...` references out of JSON editor payloads in the
/// assets directory. Only small JSON payloads are read (not binary assets),
/// keeping this cheap.
fn collect_json_payload_refs(assets_dir: &Path, refs: &mut HashSet<String>) {
    let Ok(entries) = std::fs::read_dir(assets_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_editor_payload = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|name| name.ends_with(".draw.json"))
            .unwrap_or(false);
        if is_editor_payload {
            if let Ok(bytes) = std::fs::read(&path) {
                extract_asset_refs_from_bytes(&bytes, refs);
            }
        }
    }
}

#[tauri::command]
pub async fn delete_unreferenced_asset(
    workspace_path: String,
    asset_src: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        delete_unreferenced_asset_inner(workspace_path, asset_src)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) fn delete_unreferenced_asset_inner(
    workspace_path: String,
    asset_src: String,
) -> Result<bool, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "delete_unreferenced_asset",
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

    let (normalized_src, relative_path) =
        normalize_workspace_asset_src(&asset_src).inspect_err(|message| {
            let _ = logger.error(
                "tauri.note",
                "delete_unreferenced_asset",
                "Rejected asset delete request",
                note_error_context(&workspace_path, "validation", message.clone()),
            );
        })?;

    let refs = collect_current_asset_refs(&workspace_path);
    if refs.contains(&normalized_src) {
        let _ = logger.debug(
            "tauri.note",
            "delete_unreferenced_asset",
            "Skipped referenced asset delete",
            diagnostics_enabled,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "assetSrc": normalized_src,
            })),
        );
        return Ok(false);
    }

    let asset_path = Path::new(&workspace_path).join(relative_path);
    if !asset_path.exists() {
        return Ok(false);
    }

    let asset_root = assets_dir_path(&workspace_path);
    let canonical_root = asset_root
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let canonical_asset = asset_path
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !canonical_asset.starts_with(canonical_root) || !canonical_asset.is_file() {
        return Err("Asset path is outside workspace assets".to_string());
    }

    std::fs::remove_file(&canonical_asset).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "delete_unreferenced_asset",
            "Failed to remove asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let _ = logger.info(
        "tauri.note",
        "delete_unreferenced_asset",
        "Deleted unreferenced asset",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "assetSrc": normalized_src,
        })),
    );

    Ok(true)
}

#[tauri::command]
pub async fn open_workspace_asset(workspace_path: String, asset_src: String) -> Result<(), String> {
    let workspace = normalize_workspace_path(&workspace_path)?;
    if !workspace.join(".nevo/workspace.json").is_file() {
        return Err("Workspace manifest is missing".to_string());
    }
    let (_, relative_path) = normalize_workspace_asset_src(&asset_src)?;
    let assets_root = workspace
        .join(".nevo/assets")
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let path = workspace
        .join(relative_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !path.starts_with(&assets_root) || !path.is_file() {
        return Err("Asset path escapes the active workspace".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&path)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
