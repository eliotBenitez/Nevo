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
    // Drawings keep their image references inside `.draw.json` payloads (in
    // `.nevo/assets/`), which the scanners above never visit — so an image used
    // only by a drawing would look unreferenced and get deleted.
    collect_draw_payload_refs(&assets_dir_path(workspace_path), &mut refs);
    refs
}

/// Pull nested `.nevo/assets/...` references out of every `.draw.json` payload in
/// the assets directory. Only the small JSON drawings are read (not binary
/// assets), keeping this cheap.
fn collect_draw_payload_refs(assets_dir: &Path, refs: &mut HashSet<String>) {
    let Ok(entries) = std::fs::read_dir(assets_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_draw = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|name| name.ends_with(".draw.json"))
            .unwrap_or(false);
        if is_draw {
            if let Ok(bytes) = std::fs::read(&path) {
                extract_asset_refs_from_bytes(&bytes, refs);
            }
        }
    }
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

/// Dedupe (by SHA-256) and write raw bytes into the workspace assets directory,
/// returning the workspace-relative `.nevo/assets/...` source. Shared by the
/// bytes/path/URL importers.
fn store_asset_bytes(
    workspace_path: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<ImportedImageAsset, String> {
    let assets_dir = assets_dir_path(workspace_path);
    std::fs::create_dir_all(&assets_dir).map_err(|error| error.to_string())?;

    let hash = hash_bytes(bytes);
    if let Some(existing_path) = find_existing_asset_path(&assets_dir, &hash) {
        let existing_name = existing_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Unable to resolve existing asset path".to_string())?;
        return Ok(ImportedImageAsset {
            src: format!(".nevo/assets/{}", existing_name),
            hash,
            deduplicated: true,
            bytes: bytes.len(),
        });
    }

    let extension = normalize_extension(file_name);
    let stem = sanitize_file_stem(file_name);
    let safe_stem = if stem.is_empty() {
        "asset".to_string()
    } else {
        stem
    };
    let final_name = format!("{}-{}.{}", hash, safe_stem, extension);
    let final_path = assets_dir.join(&final_name);
    std::fs::write(&final_path, bytes).map_err(|error| error.to_string())?;

    Ok(ImportedImageAsset {
        src: format!(".nevo/assets/{}", final_name),
        hash,
        deduplicated: false,
        bytes: bytes.len(),
    })
}

fn extension_from_content_type(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/avif" => Some("avif"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

fn derive_download_file_name(url: &str, content_type: Option<&str>) -> String {
    let path = url.split(|c| c == '?' || c == '#').next().unwrap_or(url);
    let last = path.rsplit('/').next().unwrap_or("");
    if !last.is_empty() && Path::new(last).extension().is_some() {
        return last.to_string();
    }
    let ext = content_type
        .and_then(extension_from_content_type)
        .unwrap_or("png");
    let stem = if last.is_empty() { "image" } else { last };
    format!("{}.{}", stem, ext)
}

/// Download a remote image and import it into the workspace assets directory.
///
/// Pasting an `<img>` from the web only yields a URL; loading that URL directly
/// in the webview often 404s (auth/hotlink/expiring signed URLs), so we fetch
/// the bytes server-side (reqwest follows redirects) and store them locally.
#[tauri::command]
pub async fn import_asset_from_url(
    workspace_path: String,
    url: String,
) -> Result<ImportedImageAsset, String> {
    let logger = crate::logging::logger();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http(s) URLs are supported".to_string());
    }

    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "import_asset_from_url",
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

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/122.0 Safari/537.36",
        )
        .build()
        .map_err(|error| error.to_string())?;
    let response = client.get(&url).send().await.map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "import_asset_from_url",
            "Failed to fetch remote image",
            note_error_context(&workspace_path, "network", message.clone()),
        );
        message
    })?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    // Reject obvious non-images (e.g. a pasted webpage link) so they don't end
    // up as a broken image block. Missing/binary content types are allowed.
    if let Some(content_type) = content_type.as_deref() {
        let main = content_type.split(';').next().unwrap_or("").trim();
        if main.starts_with("text/") {
            return Err(format!(
                "Remote resource is not an image (content-type: {})",
                main
            ));
        }
    }

    let file_name = derive_download_file_name(&url, content_type.as_deref());

    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.is_empty() {
        return Err("Downloaded file is empty".to_string());
    }
    let bytes = bytes.to_vec();

    tauri::async_runtime::spawn_blocking(move || {
        store_asset_bytes(&workspace_path, &file_name, &bytes)
    })
    .await
    .map_err(|error| error.to_string())?
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

/// Persist the JSON payload of a `draw_block` drawing into the workspace
/// assets directory and return the relative `src` path (`.nevo/assets/...`).
///
/// Drawings can be sizable (thousands of stroke points) and are mutated
/// frequently while editing on the canvas — so they live in their own asset
/// file (like images/files) rather than inline in the note document, which is
/// re-serialized wholesale on every save and mirrored into the snapshot
/// history. Naming embeds the stable `draw_id` plus a short content hash so
/// consecutive saves replace the previous payload (one drawing per id).
///
/// The blocking I/O (hash + write) runs on the blocking thread pool via
/// `spawn_blocking` so the WebKitGTK main thread is never stalled.
#[tauri::command]
pub async fn save_draw_asset(
    workspace_path: String,
    draw_id: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_draw_asset_inner(workspace_path, draw_id, bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn save_draw_asset_inner(
    workspace_path: String,
    draw_id: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let logger = crate::logging::logger();
    if bytes.is_empty() {
        let _ = logger.error(
            "tauri.note",
            "save_draw_asset",
            "Rejected empty draw payload",
            LogContext::default().with_error(LogError {
                kind: Some("validation".to_string()),
                message: "Draw payload is empty".to_string(),
                details: None,
            }),
        );
        return Err("Draw payload is empty".to_string());
    }

    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "save_draw_asset",
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
            "save_draw_asset",
            "Failed to create assets directory",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    // Filename: draw-<drawId>-<hashShort>.draw.json — keeps one payload per
    // draw_id (consecutive saves overwrite the same file) while still letting
    // the content-addressed GC scanner discover the reference.
    let hash = hash_bytes(&bytes);
    let hash_short: String = hash.chars().take(16).collect();
    let safe_draw_id = sanitize_file_stem(&draw_id);
    let draw_stem = if safe_draw_id.is_empty() {
        "draw".to_string()
    } else {
        format!("draw-{}", safe_draw_id)
    };
    let final_name = format!("{}-{}.draw.json", draw_stem, hash_short);

    // Remove any previous payload for the same draw_id (different content hash)
    // so we don't accumulate stale copies on every edit.
    let _ = remove_previous_draw_payloads(&assets_dir, &draw_stem, &final_name);

    let final_path = assets_dir.join(&final_name);
    crate::commands::path_utils::write_atomic(&final_path, &bytes).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "save_draw_asset",
            "Failed to write draw asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })?;

    let _ = logger.info(
        "tauri.note",
        "save_draw_asset",
        "Saved draw asset into workspace",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "drawId": draw_id,
            "hash": hash,
            "bytes": bytes.len(),
        })),
    );

    Ok(format!(".nevo/assets/{}", final_name))
}

/// Remove prior `draw-<drawId>-*.draw.json` files except the one matching
/// `keep_name`. Best-effort — stale files left behind are harmless (GC will
/// reap them when the note no longer references the asset).
fn remove_previous_draw_payloads(assets_dir: &Path, draw_stem: &str, keep_name: &str) {
    let Ok(entries) = std::fs::read_dir(assets_dir) else {
        return;
    };
    let prefix = format!("{}-", draw_stem);
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("");
        if name.starts_with(&prefix) && name.ends_with(".draw.json") && name != keep_name {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// Read the JSON payload bytes of a drawing asset back from disk.
///
/// Runs on the blocking thread pool: the draw payload can be large and reads
/// must not stall the WebKitGTK main thread (same rationale as
/// `import_asset_by_path`).
#[tauri::command]
pub async fn read_draw_asset(workspace_path: String, src: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || read_draw_asset_inner(workspace_path, src))
        .await
        .map_err(|error| error.to_string())?
}

fn read_draw_asset_inner(workspace_path: String, src: String) -> Result<Vec<u8>, String> {
    let logger = crate::logging::logger();
    let (relative_src, asset_path) = normalize_workspace_asset_src(&src).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "read_draw_asset",
            "Rejected asset src",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;

    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "read_draw_asset",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;

    let abs_path = workspace_path.join(&asset_path);
    let bytes = std::fs::read(&abs_path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "read_draw_asset",
            "Failed to read draw asset",
            note_context(&workspace_path.to_string_lossy())
                .with_payload(serde_json::json!({
                    "src": relative_src,
                }))
                .with_error(LogError {
                    kind: Some("io".to_string()),
                    message: message.clone(),
                    details: None,
                }),
        );
        message
    })?;

    Ok(bytes)
}

/// Read the latest drawing payload for a `draw_id`, ignoring the `src` recorded
/// in the note document. This recovers a drawing whose note reference went
/// stale — e.g. the app was closed straight from the canvas, so the freshly
/// written asset's `src` never reached the note (the editor pane that applies
/// the update is unmounted while the canvas is open). `save_draw_asset` keeps
/// exactly one `draw-<drawId>-<hash>.draw.json` per id on disk, so the most
/// recently modified match is the current drawing.
#[tauri::command]
pub async fn read_latest_draw_asset(
    workspace_path: String,
    draw_id: String,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_latest_draw_asset_inner(workspace_path, draw_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn read_latest_draw_asset_inner(
    workspace_path: String,
    draw_id: String,
) -> Result<Vec<u8>, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).map_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "read_latest_draw_asset",
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
    let assets_dir = assets_dir_path(&workspace_path);

    let safe_draw_id = sanitize_file_stem(&draw_id);
    if safe_draw_id.is_empty() {
        return Err("Invalid draw id".to_string());
    }
    let prefix = format!("draw-{}-", safe_draw_id);

    let Ok(entries) = std::fs::read_dir(&assets_dir) else {
        return Err("No drawing payload found".to_string());
    };
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("");
        if name.starts_with(&prefix) && name.ends_with(".draw.json") {
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            if best.as_ref().map_or(true, |(t, _)| mtime >= *t) {
                best = Some((mtime, path));
            }
        }
    }

    let Some((_, path)) = best else {
        return Err("No drawing payload found".to_string());
    };
    std::fs::read(&path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.note",
            "read_latest_draw_asset",
            "Failed to read draw asset",
            note_error_context(&workspace_path, "io", message.clone()),
        );
        message
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::note::{create_note_impl, save_note_impl};
    use crate::commands::workspace::create_workspace;
    use chrono::Utc;
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn derive_download_file_name_uses_url_extension() {
        assert_eq!(
            derive_download_file_name("https://example.com/a/b/pic.PNG?token=1", None),
            "pic.PNG"
        );
    }

    #[test]
    fn derive_download_file_name_falls_back_to_content_type() {
        assert_eq!(
            derive_download_file_name(
                "https://example.com/user-attachments/assets/uuid",
                Some("image/jpeg; charset=binary")
            ),
            "uuid.jpg"
        );
        assert_eq!(
            derive_download_file_name("https://example.com/download", None),
            "download.png"
        );
    }

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

        let mut note = create_note_impl(
            workspace_path.clone(),
            None,
            "Cover note".to_string(),
            "📄".to_string(),
        )
        .expect("create note");
        note.cover = Some("image:.nevo/assets/old-cover.jpg".to_string());
        note.updated_at = Utc::now().to_rfc3339();
        save_note_impl(workspace_path.clone(), note.clone()).expect("save note with cover");

        note.cover = None;
        note.updated_at = Utc::now().to_rfc3339();
        save_note_impl(workspace_path.clone(), note).expect("save note without cover");

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

        let mut note = create_note_impl(
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
        save_note_impl(workspace_path.clone(), note).expect("save note");

        let deleted = delete_unreferenced_asset_inner(
            workspace_path,
            "image:.nevo/assets/shared-cover.jpg".to_string(),
        )
        .expect("delete asset");

        assert!(!deleted);
        assert!(asset_path.exists());
    }

    #[test]
    fn delete_unreferenced_asset_keeps_images_referenced_by_a_drawing() {
        // Regression: an image inserted into a draw_block is referenced only from
        // inside the drawing's `.draw.json` payload (which lives in .nevo/assets).
        // The ref scanner must read those payloads, otherwise the image looks
        // orphaned and gets reaped while the drawing still uses it.
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();
        let image_path = write_asset(&workspace_path, "pasted-pic.png");

        // Persist a drawing whose payload references the image by assetSrc.
        let payload = br#"{"version":1,"strokes":[{"type":"image","points":[{"x":0,"y":0},{"x":10,"y":10}],"color":"transparent","size":1,"assetSrc":".nevo/assets/pasted-pic.png"}]}"#.to_vec();
        save_draw_asset_inner(workspace_path.clone(), "draw-img".to_string(), payload)
            .expect("save draw asset");

        let deleted = delete_unreferenced_asset_inner(
            workspace_path,
            ".nevo/assets/pasted-pic.png".to_string(),
        )
        .expect("delete asset");

        assert!(
            !deleted,
            "image referenced by a drawing must not be deleted"
        );
        assert!(image_path.exists());
    }

    #[test]
    fn save_draw_asset_writes_and_returns_relative_src() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();

        let payload = br#"{"version":1,"strokes":[]}"#.to_vec();
        let src = save_draw_asset_inner(
            workspace_path.clone(),
            "draw-abc".to_string(),
            payload.clone(),
        )
        .expect("save draw asset");

        assert!(src.starts_with(".nevo/assets/draw-draw-abc-"));
        assert!(src.ends_with(".draw.json"));

        // The file must exist on disk under <workspace>/.nevo/assets/.
        let abs = std::path::Path::new(&workspace_path).join(&src);
        assert!(abs.exists(), "draw asset file should exist at {abs:?}");
    }

    #[test]
    fn read_draw_asset_round_trips_saved_payload() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();

        let payload = br#"{"version":1,"strokes":[{"type":"line"}]}"#.to_vec();
        let src = save_draw_asset_inner(
            workspace_path.clone(),
            "draw-xyz".to_string(),
            payload.clone(),
        )
        .expect("save draw asset");

        let read = read_draw_asset_inner(workspace_path, src).expect("read draw asset");
        assert_eq!(read, payload);
    }

    #[test]
    fn read_latest_draw_asset_recovers_by_id_when_src_is_stale() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();

        // First save → src #1. Then a second save with different content replaces
        // the file (new content-hash name), making src #1 stale on disk.
        let stale_src = save_draw_asset_inner(
            workspace_path.clone(),
            "draw-recover".to_string(),
            br#"{"version":1,"strokes":[{"type":"line"}]}"#.to_vec(),
        )
        .expect("first save");
        let current = br#"{"version":1,"strokes":[{"type":"rectangle"}]}"#.to_vec();
        save_draw_asset_inner(
            workspace_path.clone(),
            "draw-recover".to_string(),
            current.clone(),
        )
        .expect("second save");

        // Reading by the stale src now fails (the file was reaped)...
        assert!(read_draw_asset_inner(workspace_path.clone(), stale_src).is_err());
        // ...but reading by draw_id recovers the current payload.
        let read = read_latest_draw_asset_inner(workspace_path, "draw-recover".to_string())
            .expect("read latest by id");
        assert_eq!(read, current);
    }

    #[test]
    fn read_latest_draw_asset_errors_when_no_payload_exists() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();
        assert!(read_latest_draw_asset_inner(workspace_path, "draw-missing".to_string()).is_err());
    }

    #[test]
    fn save_draw_asset_replaces_previous_payload_for_same_id() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();

        let first = save_draw_asset_inner(
            workspace_path.clone(),
            "draw-repl".to_string(),
            br#"{"v":1}"#.to_vec(),
        )
        .expect("save first");
        let second = save_draw_asset_inner(
            workspace_path.clone(),
            "draw-repl".to_string(),
            br#"{"v":2}"#.to_vec(),
        )
        .expect("save second");

        // Different content → different file name (hash suffix differs).
        assert_ne!(first, second);

        // Only one payload for this draw_id must remain on disk.
        let assets_dir = std::path::Path::new(&workspace_path)
            .join(".nevo")
            .join("assets");
        let remaining: Vec<_> = std::fs::read_dir(&assets_dir)
            .expect("read assets dir")
            .flatten()
            .filter(|e| {
                e.file_name()
                    .to_str()
                    .map(|n| n.starts_with("draw-draw-repl-") && n.ends_with(".draw.json"))
                    .unwrap_or(false)
            })
            .collect();
        assert_eq!(remaining.len(), 1, "stale payload should have been removed");
    }

    #[test]
    fn save_draw_asset_rejects_empty_payload() {
        let workspace = TestWorkspace::new();
        let result = save_draw_asset_inner(
            workspace.path_string(),
            "draw-empty".to_string(),
            Vec::new(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn read_draw_asset_rejects_non_asset_path() {
        let workspace = TestWorkspace::new();
        let result = read_draw_asset_inner(workspace.path_string(), "/etc/passwd".to_string());
        assert!(result.is_err());
    }
}
