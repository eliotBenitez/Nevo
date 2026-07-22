mod assets;
mod scanner;
mod session;
mod types;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub use session::NotionImportState;
pub use types::{NotionAssetImportResult, NotionExportManifest};

async fn pick_zip_path(app: AppHandle) -> Result<Option<std::path::PathBuf>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Notion Markdown & CSV export", &["zip"])
        .pick_file(move |selection| {
            let _ = sender.send(selection);
        });
    receiver
        .await
        .map_err(|_| "Notion ZIP picker was closed unexpectedly".to_string())?
        .map(|selection| selection.into_path().map_err(|error| error.to_string()))
        .transpose()
}

#[tauri::command]
pub async fn pick_and_scan_notion_export(
    app: AppHandle,
    state: State<'_, NotionImportState>,
) -> Result<Option<NotionExportManifest>, String> {
    let Some(path) = pick_zip_path(app).await? else {
        return Ok(None);
    };
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || scanner::scan_archive(path, &state))
        .await
        .map_err(|error| error.to_string())?
        .map(Some)
}

#[tauri::command]
pub async fn import_notion_assets(
    state: State<'_, NotionImportState>,
    workspace_path: String,
    session_token: String,
    paths: Vec<String>,
) -> Result<Vec<NotionAssetImportResult>, String> {
    let session = state.get(&session_token)?;
    tauri::async_runtime::spawn_blocking(move || {
        assets::import_assets(workspace_path, session, paths)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn release_notion_import(
    state: State<'_, NotionImportState>,
    session_token: String,
) -> Result<bool, String> {
    state.remove(&session_token)
}

#[cfg(test)]
mod tests;
