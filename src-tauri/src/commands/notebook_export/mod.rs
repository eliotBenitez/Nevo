mod images;
mod output;
mod render;
mod source;

use serde::Serialize;
use tauri::AppHandle;

use crate::commands::note::load_note_impl;
use crate::commands::note::notebook::{validate_note_for_write, DocumentFormat};
use crate::commands::path_utils::normalize_workspace_path;

pub use render::NotebookExportPage;
use render::{render_notebook_pdf, validate_export_pages};
pub use source::*;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum NotebookPdfExportResult {
    Exported,
    Cancelled,
}

#[tauri::command]
pub async fn export_notebook_pdf(
    app: AppHandle,
    workspace_path: String,
    note_id: String,
    file_name: String,
    pages: Vec<NotebookExportPage>,
) -> Result<NotebookPdfExportResult, String> {
    let filename = output::validate_file_name(&file_name, "pdf")?;
    let pages = tauri::async_runtime::spawn_blocking(move || {
        validate_export_pages(&pages)?;
        Ok::<_, String>(pages)
    })
    .await
    .map_err(|error| format!("PDF validation task failed: {error}"))??;
    let workspace_for_validation = workspace_path.clone();
    let note_id_for_validation = note_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let note = load_note_impl(workspace_for_validation, note_id_for_validation)?;
        if validate_note_for_write(&note)? != DocumentFormat::Notebook {
            return Err(
                "unsupported-format: PDF export is only supported for notebooks".to_string(),
            );
        }
        Ok::<_, String>(())
    })
    .await
    .map_err(|error| format!("PDF source validation task failed: {error}"))??;
    let Some(destination) = output::pick_destination(app.clone(), filename, "PDF", "pdf").await?
    else {
        return Ok(NotebookPdfExportResult::Cancelled);
    };
    tauri::async_runtime::spawn_blocking(move || {
        let root = normalize_workspace_path(&workspace_path)?
            .canonicalize()
            .map_err(|error| format!("Failed to resolve workspace path: {error}"))?;
        let pdf = render_notebook_pdf(pages, &root)?;
        output::write_destination(&app, destination, &workspace_path, &note_id, "pdf", &pdf)
    })
    .await
    .map_err(|error| format!("PDF export task failed: {error}"))??;
    Ok(NotebookPdfExportResult::Exported)
}
