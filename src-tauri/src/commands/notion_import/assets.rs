use std::fs::File;
use std::io::Read;

use zip::ZipArchive;

use super::session::NotionArchiveSession;
use super::types::NotionAssetImportResult;

const MAX_ASSET_BYTES: u64 = 100 * 1024 * 1024;

pub(super) fn import_assets(
    workspace_path: String,
    session: NotionArchiveSession,
    paths: Vec<String>,
) -> Result<Vec<NotionAssetImportResult>, String> {
    let normalized_workspace =
        crate::commands::path_utils::normalize_workspace_path(&workspace_path)?;
    let workspace_path = normalized_workspace.to_string_lossy().into_owned();
    let file = File::open(&session.archive_path)
        .map_err(|error| format!("Unable to reopen ZIP: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid or damaged ZIP: {error}"))?;
    let mut results = Vec::with_capacity(paths.len());

    for relative_path in paths {
        if !session.allowed_assets.contains(&relative_path) {
            results.push(NotionAssetImportResult {
                relative_path,
                asset: None,
                error: Some("Attachment was not allowed by the scanned manifest".to_string()),
            });
            continue;
        }
        let imported = (|| {
            let mut entry = archive
                .by_name(&relative_path)
                .map_err(|error| format!("Attachment is missing from ZIP: {error}"))?;
            if entry.size() > MAX_ASSET_BYTES {
                return Err("Attachment exceeds the maximum import size".to_string());
            }
            let capacity = usize::try_from(entry.size()).unwrap_or(0);
            let mut bytes = Vec::with_capacity(capacity);
            entry
                .by_ref()
                .take(MAX_ASSET_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|error| error.to_string())?;
            if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_ASSET_BYTES {
                return Err("Attachment expanded beyond the maximum import size".to_string());
            }
            let file_name = std::path::Path::new(&relative_path)
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "Attachment has no valid file name".to_string())?;
            crate::commands::note::import_image_asset(
                workspace_path.clone(),
                file_name.to_string(),
                bytes,
            )
        })();
        match imported {
            Ok(asset) => results.push(NotionAssetImportResult {
                relative_path,
                asset: Some(asset),
                error: None,
            }),
            Err(error) => results.push(NotionAssetImportResult {
                relative_path,
                asset: None,
                error: Some(error),
            }),
        }
    }
    Ok(results)
}
