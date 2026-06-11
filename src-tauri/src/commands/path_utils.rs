use std::env;
use std::path::{Path, PathBuf};

/// Write `contents` to `path` atomically: write a temp file in the same
/// directory, then rename it over the target. Rename is atomic on the same
/// filesystem, so a crash mid-write cannot leave a half-written (corrupt) file.
pub fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("tmp");
    let tmp = dir.join(format!(".{}.{}.tmp", file_name, std::process::id()));
    std::fs::write(&tmp, contents)?;
    match std::fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e)
        }
    }
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

#[cfg(test)]
mod tests {
    use super::{validate_id, write_atomic};

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
        let dir = std::env::temp_dir().join(format!("nevo_atomic_{}", std::process::id()));
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
}
