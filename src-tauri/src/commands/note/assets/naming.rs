use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};

pub(super) fn sanitize_file_stem(file_name: &str) -> String {
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

pub(super) fn normalize_extension(file_name: &str) -> String {
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

pub(super) fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    digest
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>()
}

pub(super) fn find_existing_asset_path(
    assets_dir: &Path,
    hash: &str,
) -> Option<std::path::PathBuf> {
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

pub(super) fn normalize_workspace_asset_src(asset_src: &str) -> Result<(String, PathBuf), String> {
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
