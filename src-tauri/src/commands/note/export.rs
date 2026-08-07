use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use super::{note_context, note_error_context};
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

const MAX_EXPORT_CONTENT_BYTES: usize = 100 * 1024 * 1024;
const MAX_INLINE_ASSET_BYTES: usize = 100 * 1024 * 1024;

/// An asset supplied by the caller as bytes rather than as a path inside the
/// workspace. Cloud workspaces have no asset directory on disk — their blobs
/// live encrypted on the relay — so the client decrypts them and passes them
/// here.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineExportAsset {
    /// File name to write inside the export's assets folder. Validated as a
    /// bare file name; it never comes from a trusted source.
    name: String,
    bytes_base64: String,
}

/// Rejects anything that is not a plain file name, so a crafted note cannot
/// write outside the export's assets folder.
fn validate_bare_file_name(name: &str, what: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 240
        || name
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\' | ':'))
        || Path::new(name).file_name().and_then(|value| value.to_str()) != Some(name)
    {
        return Err(format!("Invalid export {what}"));
    }
    Ok(())
}

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
    workspace_path: Option<String>,
    default_file_name: String,
    content: String,
    asset_srcs: Vec<String>,
    assets_subfolder_name: String,
    inline_assets: Option<Vec<InlineExportAsset>>,
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
            inline_assets.unwrap_or_default(),
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
    workspace_path: Option<String>,
    default_file_name: String,
    content: String,
    asset_srcs: Vec<String>,
    assets_subfolder_name: String,
    inline_assets: Option<Vec<InlineExportAsset>>,
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
            inline_assets.unwrap_or_default(),
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
    workspace_path: Option<String>,
    export_path: PathBuf,
    content: String,
    asset_srcs: Vec<String>,
    inline_assets: Vec<InlineExportAsset>,
    assets_subfolder_name: String,
    command_name: &str,
    export_kind: &str,
) -> Result<(), String> {
    if content.len() > MAX_EXPORT_CONTENT_BYTES {
        return Err("Export content exceeds the size limit".to_string());
    }
    let logger = crate::logging::logger();

    // A cloud workspace has no directory on disk: it passes no workspace path
    // and supplies its assets as bytes instead. Everything that reads from the
    // workspace is therefore conditional on having one.
    let ws = match &workspace_path {
        Some(raw) => {
            let ws = normalize_workspace_path(raw).inspect_err(|message| {
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
            Some(ws)
        }
        None => {
            if !asset_srcs.is_empty() {
                return Err("Workspace assets require a workspace path".to_string());
            }
            None
        }
    };
    let workspace_path = ws
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default();
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
    if !asset_srcs.is_empty() || !inline_assets.is_empty() {
        let export_dir = export_path.parent().ok_or("Invalid export path")?;
        validate_bare_file_name(&assets_subfolder_name, "asset folder name")?;
        let assets_dir = export_dir.join(assets_subfolder_name);
        std::fs::create_dir_all(&assets_dir).map_err(|error| error.to_string())?;

        // Workspace-relative assets: copied out of `.nevo/assets`, never from
        // anywhere else on disk.
        if !asset_srcs.is_empty() {
            let ws = ws
                .as_ref()
                .ok_or("Workspace assets require a workspace path")?;
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

        // Caller-supplied bytes (cloud workspaces). The name is untrusted, so it
        // is validated as a bare file name before it is joined to the folder.
        let mut inline_total = 0usize;
        for asset in inline_assets {
            validate_bare_file_name(&asset.name, "asset name")?;
            let bytes = base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                &asset.bytes_base64,
            )
            .map_err(|error| format!("asset {}: {}", asset.name, error))?;
            inline_total = inline_total.saturating_add(bytes.len());
            if inline_total > MAX_INLINE_ASSET_BYTES {
                return Err("Export assets exceed the size limit".to_string());
            }
            write_atomic(&assets_dir.join(&asset.name), &bytes)
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
    use super::*;
    use base64::Engine;

    fn inline(name: &str, body: &str) -> InlineExportAsset {
        InlineExportAsset {
            name: name.to_string(),
            bytes_base64: base64::engine::general_purpose::STANDARD.encode(body),
        }
    }

    fn export_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nevo-export-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

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

    #[test]
    fn inline_assets_are_written_without_a_workspace() {
        // The cloud path: no workspace directory exists, assets arrive as bytes.
        let dir = export_dir();
        let export_path = dir.join("Note.md");

        export_note_with_assets(
            None,
            export_path.clone(),
            "# Note\n\n![img](Note_assets/pic.png)\n".to_string(),
            vec![],
            vec![inline("pic.png", "PNGDATA")],
            "Note_assets".to_string(),
            "test",
            "markdown",
        )
        .unwrap();

        assert!(export_path.is_file());
        let asset = dir.join("Note_assets").join("pic.png");
        assert_eq!(std::fs::read_to_string(asset).unwrap(), "PNGDATA");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn inline_asset_names_cannot_escape_the_assets_folder() {
        let dir = export_dir();
        for name in [
            "../escaped.png",
            "nested/pic.png",
            "..\\escaped.png",
            "",
            ".",
        ] {
            let result = export_note_with_assets(
                None,
                dir.join("Note.md"),
                "body".to_string(),
                vec![],
                vec![inline(name, "DATA")],
                "Note_assets".to_string(),
                "test",
                "markdown",
            );
            assert!(result.is_err(), "name {name:?} should have been rejected");
        }
        assert!(!dir.join("escaped.png").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_relative_assets_require_a_workspace_path() {
        let dir = export_dir();
        let result = export_note_with_assets(
            None,
            dir.join("Note.md"),
            "body".to_string(),
            vec![".nevo/assets/pic.png".to_string()],
            vec![],
            "Note_assets".to_string(),
            "test",
            "markdown",
        );
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_missing_workspace_manifest_is_still_rejected() {
        // Passing a path opts into workspace mode, which must stay strict.
        let dir = export_dir();
        let result = export_note_with_assets(
            Some(dir.to_string_lossy().into_owned()),
            dir.join("Note.md"),
            "body".to_string(),
            vec![],
            vec![],
            "Note_assets".to_string(),
            "test",
            "markdown",
        );
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn inline_assets_are_size_capped() {
        let dir = export_dir();
        let huge = base64::engine::general_purpose::STANDARD.encode(vec![0u8; 1024]);
        let assets: Vec<InlineExportAsset> = (0..3)
            .map(|index| InlineExportAsset {
                name: format!("a{index}.bin"),
                bytes_base64: huge.clone(),
            })
            .collect();

        // Well under the cap: accepted.
        assert!(export_note_with_assets(
            None,
            dir.join("Note.md"),
            "body".to_string(),
            vec![],
            assets,
            "Note_assets".to_string(),
            "test",
            "markdown",
        )
        .is_ok());
        let _ = std::fs::remove_dir_all(dir);
    }
}
