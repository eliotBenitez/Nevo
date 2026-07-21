use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use super::{note_context, note_error_context};
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

const MAX_EXPORT_CONTENT_BYTES: usize = 100 * 1024 * 1024;

fn validate_default_file_name(default_file_name: &str, extension: &str) -> Result<String, String> {
    let name = default_file_name.trim();
    if name.is_empty()
        || name.len() > 240
        || name
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\' | ':'))
        || Path::new(name).file_name().and_then(|value| value.to_str()) != Some(name)
        || !name
            .to_ascii_lowercase()
            .ends_with(&format!(".{}", extension.to_ascii_lowercase()))
    {
        return Err("Invalid export file name".to_string());
    }
    Ok(name.to_string())
}

pub(crate) async fn pick_export_path(
    app: AppHandle,
    default_file_name: String,
    filter_name: &'static str,
    extension: &'static str,
) -> Result<Option<PathBuf>, String> {
    let default_file_name = validate_default_file_name(&default_file_name, extension)?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(default_file_name)
        .add_filter(filter_name, &[extension])
        .save_file(move |selection| {
            let _ = sender.send(selection);
        });
    receiver
        .await
        .map_err(|_| "Export dialog was closed unexpectedly".to_string())?
        .map(|selection| selection.into_path().map_err(|error| error.to_string()))
        .transpose()
}

#[tauri::command]
pub async fn export_note_markdown(
    app: AppHandle,
    workspace_path: String,
    default_file_name: String,
    content: String,
    asset_srcs: Vec<String>,
    assets_subfolder_name: String,
) -> Result<bool, String> {
    let Some(export_path) = pick_export_path(app, default_file_name, "Markdown", "md").await?
    else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        export_note_with_assets(
            workspace_path,
            export_path,
            content,
            asset_srcs,
            assets_subfolder_name,
            "export_note_markdown",
            "markdown",
        )
    })
    .await
    .map_err(|error| format!("Export task failed: {error}"))??;
    Ok(true)
}

#[tauri::command]
pub async fn export_note_html(
    app: AppHandle,
    workspace_path: String,
    default_file_name: String,
    content: String,
    asset_srcs: Vec<String>,
    assets_subfolder_name: String,
) -> Result<bool, String> {
    let Some(export_path) = pick_export_path(app, default_file_name, "HTML", "html").await? else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        export_note_with_assets(
            workspace_path,
            export_path,
            content,
            asset_srcs,
            assets_subfolder_name,
            "export_note_html",
            "html",
        )
    })
    .await
    .map_err(|error| format!("Export task failed: {error}"))??;
    Ok(true)
}

fn export_note_with_assets(
    workspace_path: String,
    export_path: PathBuf,
    content: String,
    asset_srcs: Vec<String>,
    assets_subfolder_name: String,
    command_name: &str,
    export_kind: &str,
) -> Result<(), String> {
    if content.len() > MAX_EXPORT_CONTENT_BYTES {
        return Err("Export content exceeds the size limit".to_string());
    }
    let logger = crate::logging::logger();
    let ws = normalize_workspace_path(&workspace_path).inspect_err(|message| {
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
    })?;
    if !ws.join(".nevo/workspace.json").is_file() {
        return Err("Workspace manifest is missing".to_string());
    }
    let workspace_path = ws.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    write_atomic(&export_path, content.as_bytes()).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            command_name,
            &format!("Failed to write {export_kind} export"),
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;
    if !asset_srcs.is_empty() {
        let export_dir = export_path.parent().ok_or("Invalid export path")?;
        if assets_subfolder_name.is_empty()
            || assets_subfolder_name
                .chars()
                .any(|character| character.is_control() || matches!(character, '/' | '\\' | ':'))
            || Path::new(&assets_subfolder_name)
                .file_name()
                .and_then(|value| value.to_str())
                != Some(assets_subfolder_name.as_str())
        {
            return Err("Invalid export asset folder name".to_string());
        }
        let assets_dir = export_dir.join(assets_subfolder_name);
        std::fs::create_dir_all(&assets_dir).map_err(|error| error.to_string())?;
        let canonical_ws = ws.canonicalize().map_err(|error| error.to_string())?;
        let canonical_assets = canonical_ws
            .join(".nevo/assets")
            .canonicalize()
            .map_err(|error| error.to_string())?;
        for src in asset_srcs {
            if !src.starts_with(".nevo/assets/") {
                return Err("Export asset is outside the workspace asset directory".to_string());
            }
            let canonical_src = ws
                .join(&src)
                .canonicalize()
                .map_err(|error| error.to_string())?;
            if !canonical_src.starts_with(&canonical_assets) || !canonical_src.is_file() {
                return Err("Export asset escaped the workspace".to_string());
            }
            let filename = canonical_src
                .file_name()
                .ok_or_else(|| "Export asset has no file name".to_string())?;
            std::fs::copy(&canonical_src, assets_dir.join(filename))
                .map_err(|error| error.to_string())?;
        }
    }
    let _ = logger.info(
        "tauri.note",
        command_name,
        &format!("Exported note {export_kind}"),
        diagnostics_enabled,
        note_context(&workspace_path),
    );
    Ok(())
}

#[tauri::command]
pub async fn export_draw_file(
    app: AppHandle,
    default_file_name: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    if bytes.len() > MAX_EXPORT_CONTENT_BYTES {
        return Err("Drawing export exceeds the size limit".to_string());
    }
    let extension = Path::new(&default_file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Drawing export requires an extension".to_string())?;
    let (filter, extension) = match extension.as_str() {
        "png" => ("PNG", "png"),
        "svg" => ("SVG", "svg"),
        _ => return Err("Unsupported drawing export format".to_string()),
    };
    let Some(export_path) = pick_export_path(app, default_file_name, filter, extension).await?
    else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || write_atomic(&export_path, &bytes))
        .await
        .map_err(|error| format!("Export task failed: {error}"))?
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn export_note_docx(
    app: AppHandle,
    default_file_name: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    if bytes.len() > MAX_EXPORT_CONTENT_BYTES {
        return Err("DOCX export exceeds the size limit".to_string());
    }
    let Some(export_path) = pick_export_path(app, default_file_name, "Word", "docx").await? else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || write_atomic(&export_path, &bytes))
        .await
        .map_err(|error| format!("Export task failed: {error}"))?
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::validate_default_file_name;

    #[test]
    fn export_file_names_are_leaf_names_with_expected_extensions() {
        assert_eq!(
            validate_default_file_name("Research.md", "md").unwrap(),
            "Research.md"
        );
        assert!(validate_default_file_name("../../secret.md", "md").is_err());
        assert!(validate_default_file_name("/tmp/secret.md", "md").is_err());
        assert!(validate_default_file_name("C:\\temp\\secret.md", "md").is_err());
        assert!(validate_default_file_name("note.html", "md").is_err());
    }
}
