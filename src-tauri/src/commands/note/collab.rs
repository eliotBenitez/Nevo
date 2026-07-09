use std::path::Path;

use tauri::ipc::{InvokeBody, Request, Response};

use crate::commands::path_utils::normalize_workspace_path;

fn yjs_state_path(workspace_path: &str, note_id: &str) -> Result<std::path::PathBuf, String> {
    crate::commands::path_utils::validate_id(note_id)?;
    Ok(Path::new(workspace_path)
        .join(".nevo")
        .join("collab")
        .join(format!("{}.yjs", note_id)))
}

/// Persists the binary Y.Doc update. The bytes are sent from the frontend as a
/// raw request body (ArrayBuffer / Uint8Array) instead of a JSON array of
/// numbers, which avoids the ~3-4× transport overhead of encoding every byte
/// as a JSON number. `workspace_path` and `note_id` are passed via headers.
#[tauri::command]
pub fn save_yjs_state(request: Request) -> Result<(), String> {
    let headers = request.headers();
    let workspace_path = headers
        .get("nv-workspace-path")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "missing nv-workspace-path header".to_string())?
        .to_owned();
    let note_id = headers
        .get("nv-note-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "missing nv-note-id header".to_string())?;

    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.as_slice(),
        _ => return Err("save_yjs_state expects a raw binary body".to_string()),
    };

    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let path = yjs_state_path(&workspace_path, &note_id)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    crate::commands::path_utils::write_atomic(&path, bytes).map_err(|e| e.to_string())
}

/// Loads the persisted Y.Doc bytes and returns them as a raw binary response
/// (ArrayBuffer on the frontend), avoiding JSON-array encoding.
#[tauri::command]
pub fn load_yjs_state(workspace_path: String, note_id: String) -> Result<Response, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let path = yjs_state_path(&workspace_path, &note_id)?;
    if !path.exists() {
        return Ok(Response::new(Vec::new()));
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

/// Removes persisted local editor CRDT state for a note. External content
/// imports update the canonical `.nevo` JSON first; dropping this cache makes
/// the next editor mount rebuild the Y.Doc from that JSON instead of replaying
/// stale editor state over the imported content.
#[tauri::command]
pub fn delete_yjs_state(workspace_path: String, note_id: String) -> Result<bool, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let path = yjs_state_path(&workspace_path, &note_id)?;
    if !path.exists() {
        return Ok(false);
    }
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(true)
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
        .map(|e| {
            matches!(
                e.as_str(),
                "md" | "markdown" | "mdown" | "mkd" | "txt" | "text"
            )
        })
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
