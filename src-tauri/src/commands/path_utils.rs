use std::env;
use std::path::PathBuf;

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
