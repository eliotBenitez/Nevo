use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use super::{assets_dir_path, note_context, note_error_context, ImportedImageAsset};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};

fn sanitize_file_stem(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");

    let mut sanitized = String::with_capacity(stem.len());
    for ch in stem.chars() {
        if ch.is_ascii_alphanumeric() {
            sanitized.push(ch.to_ascii_lowercase());
        } else if ch == '-' || ch == '_' {
            sanitized.push(ch);
        } else if ch.is_whitespace() || ch == '.' {
            sanitized.push('-');
        }
    }

    while sanitized.contains("--") {
        sanitized = sanitized.replace("--", "-");
    }

    sanitized.trim_matches('-').to_string()
}

fn normalize_extension(file_name: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();

    let filtered = ext
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(12)
        .collect::<String>();

    if filtered.is_empty() {
        "bin".to_string()
    } else {
        filtered
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    digest
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>()
}

fn find_existing_asset_path(assets_dir: &Path, hash: &str) -> Option<std::path::PathBuf> {
    let prefix = format!("{}-", hash);
    let entries = std::fs::read_dir(assets_dir).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if name.starts_with(&prefix) {
            return Some(path);
        }
    }

    None
}

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
    refs
}

fn normalize_workspace_asset_src(asset_src: &str) -> Result<(String, PathBuf), String> {
    let src = asset_src.strip_prefix("image:").unwrap_or(asset_src);
    let relative = src
        .strip_prefix(".nevo/assets/")
        .ok_or_else(|| "Only workspace assets can be deleted".to_string())?;

    let relative_path = Path::new(relative);
    if relative_path.components().count() != 1 {
        return Err("Asset path must reference a file in .nevo/assets".to_string());
    }

    let filename = match relative_path.components().next() {
        Some(Component::Normal(name)) => name,
        _ => return Err("Invalid asset filename".to_string()),
    };

    let filename = filename
        .to_str()
        .ok_or_else(|| "Asset filename must be valid UTF-8".to_string())?;

    if filename.is_empty()
        || !filename
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_')
    {
        return Err("Invalid asset filename".to_string());
    }

    Ok((
        format!(".nevo/assets/{}", filename),
        Path::new(".nevo").join("assets").join(filename),
    ))
}

#[tauri::command]
pub fn import_image_asset(
    workspace_path: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<ImportedImageAsset, String> {
    let logger = crate::logging::logger();
    if bytes.is_empty() {
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Rejected empty asset payload",
            LogContext::default().with_error(LogError {
                kind: Some("validation".to_string()),
                message: "Image payload is empty".to_string(),
                details: None,
            }),
        );
        return Err("Image payload is empty".to_string());
    }

    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let assets_dir = assets_dir_path(&workspace_path);
    std::fs::create_dir_all(&assets_dir).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Failed to create assets directory",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let hash = hash_bytes(&bytes);
    if let Some(existing_path) = find_existing_asset_path(&assets_dir, &hash) {
        let existing_name = existing_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                let message = "Unable to resolve existing asset path".to_string();
                let _ = logger.error(
                    "tauri.note",
                    "import_image_asset",
                    "Failed to resolve deduplicated asset path",
                    note_error_context(&workspace_path, "path", message.clone()),
                );
                message
            })?;

        let _ = logger.debug(
            "tauri.note",
            "import_image_asset",
            "Reused deduplicated asset",
            diagnostics_enabled,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "fileName": file_name,
                "hash": hash,
                "deduplicated": true,
            })),
        );

        return Ok(ImportedImageAsset {
            src: format!(".nevo/assets/{}", existing_name),
            hash,
            deduplicated: true,
            bytes: bytes.len(),
        });
    }

    let extension = normalize_extension(&file_name);
    let stem = sanitize_file_stem(&file_name);
    let safe_stem = if stem.is_empty() {
        "asset".to_string()
    } else {
        stem
    };
    let final_name = format!("{}-{}.{}", hash, safe_stem, extension);
    let final_path = assets_dir.join(&final_name);
    std::fs::write(&final_path, bytes).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_image_asset",
            "Failed to write imported asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let size_bytes = std::fs::metadata(&final_path)
        .map_err(|error| {
            let message = error.to_string();
            let _ = logger.error(
                "tauri.note",
                "import_image_asset",
                "Failed to read imported asset metadata",
                note_error_context(&workspace_path, "io", message.clone()),
            );
            message
        })?
        .len() as usize;

    let _ = logger.info(
        "tauri.note",
        "import_image_asset",
        "Imported asset into workspace",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "fileName": file_name,
            "hash": hash,
            "deduplicated": false,
            "bytes": size_bytes,
        })),
    );

    Ok(ImportedImageAsset {
        src: format!(".nevo/assets/{}", final_name),
        hash,
        deduplicated: false,
        bytes: size_bytes,
    })
}

/// Import a file into the workspace assets directory.
///
/// The blocking work (whole-file read, SHA-256 hash, write) runs on the
/// blocking thread pool via `spawn_blocking` so the WebKitGTK main thread is
/// never stalled — a synchronous command here froze the UI for large
/// audio/video files in the packaged build.
#[tauri::command]
pub async fn import_asset_by_path(
    workspace_path: String,
    source_path: String,
    file_name: String,
) -> Result<ImportedImageAsset, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_asset_by_path_inner(workspace_path, source_path, file_name)
    })
    .await
    .map_err(|error| error.to_string())?
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

fn delete_unreferenced_asset_inner(
    workspace_path: String,
    asset_src: String,
) -> Result<bool, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
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
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);

    let (normalized_src, relative_path) =
        normalize_workspace_asset_src(&asset_src).map_err(|message| {
            let _ = logger.error(
                "tauri.note",
                "delete_unreferenced_asset",
                "Rejected asset delete request",
                note_error_context(&workspace_path, "validation", message.clone()),
            );
            message
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

/// Open a file at the given path using the default OS handler.
/// 
/// This is a fallback for the `opener` plugin which can have restrictive 
/// ACL scopes in Tauri v2.
#[tauri::command]
pub async fn open_file_path(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
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

fn import_asset_by_path_inner(
    workspace_path: String,
    source_path: String,
    file_name: String,
) -> Result<ImportedImageAsset, String> {
    let logger = crate::logging::logger();

    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "import_asset_by_path",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);
    let assets_dir = assets_dir_path(&workspace_path);
    std::fs::create_dir_all(&assets_dir).map_err(|error| error.to_string())?;

    let bytes = std::fs::read(&source_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_asset_by_path",
            "Failed to read source file",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    if bytes.is_empty() {
        return Err("Source file is empty".to_string());
    }

    let hash = hash_bytes(&bytes);
    if let Some(existing_path) = find_existing_asset_path(&assets_dir, &hash) {
        let existing_name = existing_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Unable to resolve existing asset path".to_string())?;

        let _ = logger.debug(
            "tauri.note",
            "import_asset_by_path",
            "Reused deduplicated asset",
            diagnostics_enabled,
            note_context(&workspace_path).with_payload(serde_json::json!({
                "fileName": file_name,
                "hash": hash,
                "deduplicated": true,
            })),
        );

        return Ok(ImportedImageAsset {
            src: format!(".nevo/assets/{}", existing_name),
            hash,
            deduplicated: true,
            bytes: bytes.len(),
        });
    }

    let extension = normalize_extension(&file_name);
    let stem = sanitize_file_stem(&file_name);
    let safe_stem = if stem.is_empty() {
        "asset".to_string()
    } else {
        stem
    };
    let final_name = format!("{}-{}.{}", hash, safe_stem, extension);
    let final_path = assets_dir.join(&final_name);
    std::fs::write(&final_path, &bytes).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_asset_by_path",
            "Failed to write imported asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let size_bytes = bytes.len();

    let _ = logger.info(
        "tauri.note",
        "import_asset_by_path",
        "Imported asset from path into workspace",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "fileName": file_name,
            "hash": hash,
            "deduplicated": false,
            "bytes": size_bytes,
        })),
    );

    Ok(ImportedImageAsset {
        src: format!(".nevo/assets/{}", final_name),
        hash,
        deduplicated: false,
        bytes: size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::note::{create_note, save_note};
    use crate::commands::workspace::create_workspace;
    use chrono::Utc;
    use serde_json::json;
    use uuid::Uuid;

    struct TestWorkspace {
        path: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-assets-{}", Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Assets".to_string(),
                "N".to_string(),
                "violet".to_string(),
            )
            .expect("create workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn write_asset(workspace_path: &str, name: &str) -> std::path::PathBuf {
        let path = assets_dir_path(workspace_path).join(name);
        std::fs::create_dir_all(path.parent().expect("asset parent")).expect("create assets dir");
        std::fs::write(&path, b"image-bytes").expect("write asset");
        path
    }

    #[test]
    fn delete_unreferenced_asset_ignores_old_snapshots_for_removed_cover() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();
        let asset_path = write_asset(&workspace_path, "old-cover.jpg");

        let mut note = create_note(
            workspace_path.clone(),
            None,
            "Cover note".to_string(),
            "📄".to_string(),
        )
        .expect("create note");
        note.cover = Some("image:.nevo/assets/old-cover.jpg".to_string());
        note.updated_at = Utc::now().to_rfc3339();
        save_note(workspace_path.clone(), note.clone()).expect("save note with cover");

        note.cover = None;
        note.updated_at = Utc::now().to_rfc3339();
        save_note(workspace_path.clone(), note).expect("save note without cover");

        let deleted = delete_unreferenced_asset_inner(
            workspace_path,
            ".nevo/assets/old-cover.jpg".to_string(),
        )
        .expect("delete asset");

        assert!(deleted);
        assert!(!asset_path.exists());
    }

    #[test]
    fn delete_unreferenced_asset_keeps_current_note_references() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();
        let asset_path = write_asset(&workspace_path, "shared-cover.jpg");

        let mut note = create_note(
            workspace_path.clone(),
            None,
            "Current reference".to_string(),
            "📄".to_string(),
        )
        .expect("create note");
        note.content = json!({
            "type": "doc",
            "content": [{
                "type": "image_block",
                "attrs": { "src": ".nevo/assets/shared-cover.jpg" }
            }]
        });
        note.updated_at = Utc::now().to_rfc3339();
        save_note(workspace_path.clone(), note).expect("save note");

        let deleted = delete_unreferenced_asset_inner(
            workspace_path,
            "image:.nevo/assets/shared-cover.jpg".to_string(),
        )
        .expect("delete asset");

        assert!(!deleted);
        assert!(asset_path.exists());
    }
}
