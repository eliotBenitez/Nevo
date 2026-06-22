use super::{note_context, note_error_context};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

#[tauri::command]
pub fn export_note_markdown(
    workspace_path: String,
    export_path: String,
    content: String,
    asset_srcs: Vec<String>,
) -> Result<(), String> {
    export_note_with_assets(
        workspace_path,
        export_path,
        content,
        asset_srcs,
        "export_note_markdown",
        "markdown",
    )
}

#[tauri::command]
pub fn export_note_html(
    workspace_path: String,
    export_path: String,
    content: String,
    asset_srcs: Vec<String>,
) -> Result<(), String> {
    export_note_with_assets(
        workspace_path,
        export_path,
        content,
        asset_srcs,
        "export_note_html",
        "html",
    )
}

fn export_note_with_assets(
    workspace_path: String,
    export_path: String,
    content: String,
    asset_srcs: Vec<String>,
    command_name: &str,
    export_kind: &str,
) -> Result<(), String> {
    let logger = crate::logging::logger();
    let ws = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            command_name,
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = ws.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    std::fs::write(&export_path, content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            command_name,
            &format!("Failed to write {} export", export_kind),
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    if !asset_srcs.is_empty() {
        let export_dir = std::path::Path::new(&export_path)
            .parent()
            .ok_or("invalid export path")?;
        let stem = std::path::Path::new(&export_path)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();
        let assets_dir = export_dir.join(format!("{}_assets", stem));
        std::fs::create_dir_all(&assets_dir).map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.note",
                command_name,
                "Failed to create export asset directory",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?;
        // Asset sources come from the note and must stay inside the workspace.
        // Without this check a crafted note could copy arbitrary files (e.g.
        // "../../.ssh/id_rsa") next to the exported document.
        let canonical_ws = ws.canonicalize().unwrap_or_else(|_| ws.clone());
        for src in asset_srcs {
            let abs_src = ws.join(&src);
            let canonical_src = match abs_src.canonicalize() {
                Ok(p) => p,
                Err(_) => continue,
            };
            if !canonical_src.starts_with(&canonical_ws) || !canonical_src.is_file() {
                continue;
            }
            if let Some(filename) = canonical_src.file_name() {
                let _ = std::fs::copy(&canonical_src, assets_dir.join(filename));
            }
        }
    }
    let _ = logger.info(
        "tauri.note",
        command_name,
        &format!("Exported note {}", export_kind),
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "exportPath": export_path,
        })),
    );
    Ok(())
}

#[tauri::command]
pub fn export_draw_file(
    export_path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    std::fs::write(&export_path, bytes).map_err(|error| error.to_string())
}

/// Write a fully-assembled .docx (built in the webview via the `docx` library)
/// to disk. The document already embeds its images, so no asset copying is
/// needed here.
#[tauri::command]
pub fn export_note_docx(
    export_path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let logger = crate::logging::logger();
    std::fs::write(&export_path, bytes).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "export_note_docx",
            "Failed to write docx export",
            LogContext::default().with_error(LogError {
                kind: Some("io".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })
}

