use std::path::Path;

use crate::commands::path_utils::normalize_workspace_path;

fn yjs_state_path(workspace_path: &str, note_id: &str) -> std::path::PathBuf {
    Path::new(workspace_path)
        .join(".nevo")
        .join("collab")
        .join(format!("{}.yjs", note_id))
}

#[tauri::command]
pub fn save_yjs_state(
    workspace_path: String,
    note_id: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let path = yjs_state_path(&workspace_path, &note_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_yjs_state(workspace_path: String, note_id: String) -> Result<Vec<u8>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let path = yjs_state_path(&workspace_path, &note_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
