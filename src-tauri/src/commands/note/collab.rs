use std::path::Path;

use crate::commands::path_utils::normalize_workspace_path;

fn yjs_state_path(workspace_path: &str, note_id: &str) -> Result<std::path::PathBuf, String> {
    crate::commands::path_utils::validate_id(note_id)?;
    Ok(Path::new(workspace_path)
        .join(".nevo")
        .join("collab")
        .join(format!("{}.yjs", note_id)))
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
    let path = yjs_state_path(&workspace_path, &note_id)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    crate::commands::path_utils::write_atomic(&path, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_yjs_state(workspace_path: String, note_id: String) -> Result<Vec<u8>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let path = yjs_state_path(&workspace_path, &note_id)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Max size for a text file imported through `read_text_file` (25 MiB).
const MAX_TEXT_IMPORT_BYTES: u64 = 25 * 1024 * 1024;

/// `read_text_file` backs the "import external markdown" flow, where the user
/// picks a file through the OS dialog, so it cannot be restricted to the
/// workspace. To limit the blast radius of a hostile caller (e.g. via XSS) we
/// only read regular text files of a bounded size and reject everything else
/// (no `~/.ssh/id_rsa`, no multi-GB reads, no special files).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);

    let allowed_ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .map(|e| matches!(e.as_str(), "md" | "markdown" | "mdown" | "mkd" | "txt" | "text"))
        .unwrap_or(false);
    if !allowed_ext {
        return Err("Only text files (.md/.markdown/.txt) can be imported".to_string());
    }

    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Not a regular file".to_string());
    }
    if meta.len() > MAX_TEXT_IMPORT_BYTES {
        return Err("File is too large to import".to_string());
    }

    std::fs::read_to_string(p).map_err(|e| e.to_string())
}
