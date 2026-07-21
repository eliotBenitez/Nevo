use super::naming::{
    find_existing_asset_path, hash_bytes, normalize_extension, sanitize_file_stem,
};
use crate::commands::note::{assets_dir_path, ImportedImageAsset};

/// Dedupe (by SHA-256) and write raw bytes into the workspace assets directory,
/// returning the workspace-relative `.nevo/assets/...` source. Shared by the
/// bytes/path/URL importers.
pub(super) fn store_asset_bytes(
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
