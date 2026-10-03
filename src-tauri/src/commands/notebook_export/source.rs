use std::fs::File;
#[cfg(test)]
use std::io::Read;

use serde::Serialize;
use tauri::AppHandle;

use crate::commands::note::{note_lock, note_path};
use crate::commands::path_utils::{normalize_workspace_path, validate_id};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum NoteSourceExportResult {
    Exported,
    Cancelled,
}

#[tauri::command]
pub async fn export_note_source(
    app: AppHandle,
    workspace_path: String,
    note_id: String,
) -> Result<NoteSourceExportResult, String> {
    validate_id(&note_id)?;
    let file_name = format!("note-{note_id}.json");
    let file_name = super::output::validate_file_name(&file_name, "json")?;
    let (source, source_size) = tauri::async_runtime::spawn_blocking(move || {
        open_note_source_file(&workspace_path, &note_id)
    })
    .await
    .map_err(|error| format!("Source read task failed: {error}"))??;

    let Some(destination) =
        super::output::pick_destination(app.clone(), file_name, "Nevo note source", "json").await?
    else {
        return Ok(NoteSourceExportResult::Cancelled);
    };
    tauri::async_runtime::spawn_blocking(move || {
        super::output::write_source_destination(&app, destination, source, source_size)
    })
    .await
    .map_err(|error| format!("Source export task failed: {error}"))??;
    Ok(NoteSourceExportResult::Exported)
}

fn open_note_source_file(workspace_path: &str, note_id: &str) -> Result<(File, u64), String> {
    validate_id(note_id)?;
    let normalized_root = normalize_workspace_path(workspace_path)?;
    let normalized_root_string = normalized_root.to_string_lossy().into_owned();
    let lock = note_lock(&normalized_root_string, note_id);
    let _note_guard = lock.lock().map_err(|error| error.to_string())?;
    let root = normalized_root
        .canonicalize()
        .map_err(|error| format!("Unable to resolve workspace: {error}"))?;
    let manifest_path = root.join(".nevo/workspace.json");
    let manifest = manifest_path
        .canonicalize()
        .map_err(|error| format!("Workspace manifest is unavailable: {error}"))?;
    if !manifest.starts_with(&root) || !manifest.is_file() {
        return Err("Workspace manifest is unavailable".to_string());
    }

    let notes_dir = root
        .join("notes")
        .canonicalize()
        .map_err(|error| format!("Workspace notes directory is unavailable: {error}"))?;
    if !notes_dir.starts_with(&root) || !notes_dir.is_dir() {
        return Err("Workspace notes directory is unavailable".to_string());
    }
    let source_path = note_path(&root.to_string_lossy(), note_id)?;
    let source_type = std::fs::symlink_metadata(&source_path)
        .map_err(|error| format!("Note source is unavailable: {error}"))?;
    if !source_type.is_file() {
        return Err("Note source must be a regular file".to_string());
    }
    let source_path = source_path
        .canonicalize()
        .map_err(|error| format!("Unable to resolve note source: {error}"))?;
    if !source_path.starts_with(&notes_dir) {
        return Err("Note source escaped the workspace notes directory".to_string());
    }
    let source = File::open(source_path).map_err(|error| error.to_string())?;
    let size = source.metadata().map_err(|error| error.to_string())?.len();
    Ok((source, size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    struct TempWorkspace(std::path::PathBuf);

    impl TempWorkspace {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("nevo-note-source-{}", Uuid::new_v4()));
            std::fs::create_dir_all(root.join(".nevo")).unwrap();
            std::fs::create_dir_all(root.join("notes")).unwrap();
            std::fs::write(root.join(".nevo/workspace.json"), b"{}").unwrap();
            Self(root)
        }
    }

    impl Drop for TempWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_malformed_or_future_note_source_bytes_without_parsing_or_rewriting() {
        let workspace = TempWorkspace::new();
        let note_id = "note-raw";
        let source = b"{\"documentKind\":\"future-format\",\"unfinished\":";
        std::fs::write(
            workspace.0.join(format!("notes/note-{note_id}.nevo")),
            source,
        )
        .unwrap();
        let (mut file, size) = open_note_source_file(&workspace.0.to_string_lossy(), note_id)
            .expect("open source without decoding it");
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        assert_eq!(size, source.len() as u64);
        assert_eq!(bytes.as_slice(), source);
    }

    #[test]
    fn rejects_unsafe_note_ids_and_sources_outside_the_notes_directory() {
        let workspace = TempWorkspace::new();
        assert!(open_note_source_file(&workspace.0.to_string_lossy(), "../other").is_err());

        let note_id = "note-link";
        let outside = workspace.0.join("outside.nevo");
        std::fs::write(&outside, b"raw note bytes").unwrap();
        let note_path = workspace.0.join(format!("notes/note-{note_id}.nevo"));
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &note_path).unwrap();
        #[cfg(windows)]
        if std::os::windows::fs::symlink_file(&outside, &note_path).is_err() {
            return;
        }
        assert!(open_note_source_file(&workspace.0.to_string_lossy(), note_id).is_err());
    }

    #[test]
    fn opens_large_source_without_loading_it_into_memory_or_applying_a_size_cap() {
        let workspace = TempWorkspace::new();
        let note_id = "large-note";
        let path = workspace.0.join(format!("notes/note-{note_id}.nevo"));
        let file = File::create(&path).unwrap();
        file.set_len(100 * 1024 * 1024 + 1).unwrap();
        let (_source, size) =
            open_note_source_file(&workspace.0.to_string_lossy(), note_id).unwrap();
        assert_eq!(size, 100 * 1024 * 1024 + 1);
    }
}
