use std::env;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, RwLock};
use uuid::Uuid;

const MAX_WORKSPACE_ASSET_BYTES: u64 = 100 * 1024 * 1024;
static ACTIVE_WORKSPACE_ROOT: LazyLock<RwLock<Option<PathBuf>>> =
    LazyLock::new(|| RwLock::new(None));

/// Write `contents` to `path` atomically: write a temp file in the same
/// directory, then rename it over the target. Rename is atomic on the same
/// filesystem, so a crash mid-write cannot leave a half-written (corrupt) file.
pub fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("tmp");
    let tmp = dir.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&tmp)?;

    let write_result = (|| {
        file.write_all(contents)?;
        file.flush()?;
        file.sync_all()?;
        Ok(())
    })();
    drop(file);

    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&tmp);
        return Err(error);
    }

    let result = replace_file(&tmp, path).and_then(|()| sync_parent_directory(dir));

    match result {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e)
        }
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::rename(source, target)
}

// `std::fs::rename` does not replace an existing file on Windows. Keeping the
// platform-specific fallback here avoids deleting the old file before the new
// one is durable. Tauri's Windows targets provide MoveFileExW through
// windows-sys, and MOVEFILE_REPLACE_EXISTING preserves the atomic replacement
// contract on a single volume.
#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: both pointers reference NUL-terminated UTF-16 buffers that live
    // for the duration of the call. The flags request same-volume replacement.
    let replaced = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        // SAFETY: GetLastError has no preconditions and is read immediately
        // after the failed Win32 call.
        Err(std::io::Error::from_raw_os_error(
            unsafe { GetLastError() } as i32
        ))
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn sync_parent_directory(dir: &Path) -> std::io::Result<()> {
    std::fs::File::open(dir)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent_directory(_dir: &Path) -> std::io::Result<()> {
    Ok(())
}

/// Reject identifiers that could escape their intended directory when used as a
/// path component (e.g. `note-{id}.nevo`, `{id}.yjs`, `{snapshot_id}.json`).
/// Note/snapshot ids are app-generated UUIDs or `timestamp-uuid`, so the only
/// legitimate characters are ASCII alphanumerics, `-` and `_`. This blocks path
/// traversal (`..`, `/`, `\\`) and absolute/drive-letter injection.
pub fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Identifier is empty".to_string());
    }
    if id.len() > 128 {
        return Err("Identifier is too long".to_string());
    }
    if !id
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(format!("Identifier contains invalid characters: {id}"));
    }
    Ok(())
}

fn detect_home_dir() -> Option<PathBuf> {
    if let Some(home) = env::var_os("HOME") {
        if !home.is_empty() {
            return Some(PathBuf::from(home));
        }
    }

    if let Some(user_profile) = env::var_os("USERPROFILE") {
        if !user_profile.is_empty() {
            return Some(PathBuf::from(user_profile));
        }
    }

    None
}

pub fn normalize_workspace_path(workspace_path: &str) -> Result<PathBuf, String> {
    let raw = workspace_path.trim();
    if raw.is_empty() {
        return Err("Workspace path is empty".to_string());
    }

    let used_tilde = raw == "~" || raw.starts_with("~/") || raw.starts_with("~\\");

    let mut resolved = if raw == "~" {
        detect_home_dir().ok_or_else(|| "Unable to resolve home directory".to_string())?
    } else if raw.starts_with("~/") || raw.starts_with("~\\") {
        let home =
            detect_home_dir().ok_or_else(|| "Unable to resolve home directory".to_string())?;
        home.join(&raw[2..])
    } else {
        PathBuf::from(raw)
    };

    if resolved.is_relative() {
        let cwd = env::current_dir().map_err(|e| e.to_string())?;
        resolved = cwd.join(resolved);
    }

    if used_tilde && !resolved.exists() {
        let mut legacy_path = PathBuf::from(raw);
        if legacy_path.is_relative() {
            let cwd = env::current_dir().map_err(|e| e.to_string())?;
            legacy_path = cwd.join(legacy_path);
        }
        if legacy_path.exists() {
            return Ok(legacy_path);
        }
    }

    Ok(resolved)
}

pub fn activate_workspace_root(workspace_path: &Path) -> Result<(), String> {
    let canonical = workspace_path
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace path: {error}"))?;
    if !canonical.join(".nevo/workspace.json").is_file() {
        return Err("Workspace manifest is missing".to_string());
    }
    let mut active = ACTIVE_WORKSPACE_ROOT
        .write()
        .map_err(|_| "Active workspace lock is poisoned".to_string())?;
    *active = Some(canonical);
    Ok(())
}

fn workspace_file_in_root(root: &Path, request_path: &str) -> Result<PathBuf, String> {
    let decoded = percent_encoding::percent_decode_str(request_path.trim_start_matches('/'))
        .decode_utf8()
        .map_err(|_| "Workspace asset path is not valid UTF-8".to_string())?;
    let relative = Path::new(decoded.as_ref());
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("Workspace asset path is unsafe".to_string());
    }
    let mut components = relative.components();
    let first = components.next().and_then(|component| match component {
        std::path::Component::Normal(value) => value.to_str(),
        _ => None,
    });
    let second = components.next().and_then(|component| match component {
        std::path::Component::Normal(value) => value.to_str(),
        _ => None,
    });
    if first != Some(".nevo") || !matches!(second, Some("assets" | "plugins")) {
        return Err("Workspace protocol only exposes assets and plugins".to_string());
    }

    let target = root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("Workspace asset is unavailable: {error}"))?;
    if !target.starts_with(root) || !target.is_file() {
        return Err("Workspace asset escaped the active workspace".to_string());
    }
    let size = target.metadata().map_err(|error| error.to_string())?.len();
    if size > MAX_WORKSPACE_ASSET_BYTES {
        return Err("Workspace asset exceeds the protocol size limit".to_string());
    }
    Ok(target)
}

fn active_workspace_file(request_path: &str) -> Result<PathBuf, String> {
    let active = ACTIVE_WORKSPACE_ROOT
        .read()
        .map_err(|_| "Active workspace lock is poisoned".to_string())?;
    let root = active
        .as_ref()
        .ok_or_else(|| "No active workspace".to_string())?;
    workspace_file_in_root(root, request_path)
}

fn workspace_asset_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

pub fn workspace_asset_response(request_path: &str) -> tauri::http::Response<Vec<u8>> {
    let result = active_workspace_file(request_path).and_then(|path| {
        let content_type = workspace_asset_content_type(&path);
        std::fs::read(path)
            .map(|bytes| (content_type, bytes))
            .map_err(|error| error.to_string())
    });

    match result {
        Ok((content_type, bytes)) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::OK)
            .header(tauri::http::header::CONTENT_TYPE, content_type)
            .header("Access-Control-Allow-Origin", "*")
            .header("X-Content-Type-Options", "nosniff")
            .body(bytes)
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
        Err(message) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .header(
                tauri::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )
            .body(message.into_bytes())
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_id, workspace_file_in_root, write_atomic};

    #[test]
    fn validate_id_accepts_uuids_and_rejects_traversal() {
        assert!(validate_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(validate_id("20240101120000123-abc_DEF").is_ok());

        assert!(validate_id("").is_err());
        assert!(validate_id("../../etc/passwd").is_err());
        assert!(validate_id("note/../secret").is_err());
        assert!(validate_id("a\\b").is_err());
        assert!(validate_id("foo.bar").is_err());
        assert!(validate_id("with space").is_err());
        assert!(validate_id(&"x".repeat(200)).is_err());
    }

    #[test]
    fn write_atomic_writes_and_overwrites_without_leftovers() {
        let dir = std::env::temp_dir().join(format!("nevo_atomic_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("note.json");

        write_atomic(&path, b"hello").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello");

        write_atomic(&path, b"world").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "world");

        let leftover_tmp = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().ends_with(".tmp"));
        assert!(!leftover_tmp, "temp file should be renamed away");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn concurrent_atomic_writes_do_not_share_temp_files() {
        let dir = std::env::temp_dir().join(format!("nevo_atomic_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = std::sync::Arc::new(dir.join("manifest.json"));

        let handles = (0..8)
            .map(|index| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let payload = format!("payload-{index}");
                    write_atomic(&path, payload.as_bytes())
                })
            })
            .collect::<Vec<_>>();

        for handle in handles {
            handle.join().unwrap().unwrap();
        }
        let content = std::fs::read_to_string(&*path).unwrap();
        assert!(content.starts_with("payload-"));
        assert!(!std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().ends_with(".tmp")));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn workspace_protocol_restricts_files_to_active_asset_roots() {
        let dir = std::env::temp_dir().join(format!("nevo_protocol_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join(".nevo/assets")).unwrap();
        std::fs::create_dir_all(dir.join(".nevo/plugins/example")).unwrap();
        std::fs::write(dir.join(".nevo/workspace.json"), "{}").unwrap();
        std::fs::write(dir.join(".nevo/assets/image.png"), b"png").unwrap();
        std::fs::write(dir.join(".nevo/plugins/example/index.js"), b"export {}").unwrap();
        std::fs::write(dir.join("secret.txt"), b"secret").unwrap();
        let root = dir.canonicalize().unwrap();

        assert!(workspace_file_in_root(&root, ".nevo/assets/image.png").is_ok());
        assert!(workspace_file_in_root(&root, ".nevo/plugins/example/index.js").is_ok());
        assert!(workspace_file_in_root(&root, "secret.txt").is_err());
        assert!(workspace_file_in_root(&root, ".nevo/assets/../../../secret.txt").is_err());

        std::fs::remove_dir_all(dir).ok();
    }
}
