use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use uuid::Uuid;
use zip::ZipArchive;

use super::session::{NotionArchiveSession, NotionImportState};
use super::types::{
    NotionDocumentKind, NotionExportAsset, NotionExportDocument, NotionExportManifest,
    NotionExportSkipped,
};

const MAX_ARCHIVE_ENTRIES: usize = 20_000;
const MAX_ENTRY_DEPTH: usize = 32;
const MAX_DOCUMENT_BYTES: u64 = 10 * 1024 * 1024;
const MAX_ASSET_BYTES: u64 = 100 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_DOCUMENT_BYTES: u64 = 200 * 1024 * 1024;

fn normalized_entry_path(entry: &zip::read::ZipFile<'_>) -> Result<String, String> {
    if entry.name().contains('\\') {
        return Err("ZIP entries with backslash paths are not supported".to_string());
    }
    let enclosed = entry
        .enclosed_name()
        .ok_or_else(|| format!("ZIP entry has an unsafe path: {}", entry.name()))?;
    let depth = enclosed.components().count();
    if depth == 0 || depth > MAX_ENTRY_DEPTH {
        return Err(format!(
            "ZIP entry exceeds the path depth limit: {}",
            entry.name()
        ));
    }
    Ok(enclosed
        .components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn is_symlink(entry: &zip::read::ZipFile<'_>) -> bool {
    entry
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
}

fn document_kind(path: &str) -> Option<NotionDocumentKind> {
    match Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("md" | "markdown") => Some(NotionDocumentKind::Markdown),
        Some("csv") => Some(NotionDocumentKind::Csv),
        _ => None,
    }
}

fn is_ignored_notion_file(path: &str) -> bool {
    matches!(
        Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("html" | "htm")
    )
}

pub(super) fn scan_archive(
    archive_path: PathBuf,
    state: &NotionImportState,
) -> Result<NotionExportManifest, String> {
    let canonical_path = archive_path
        .canonicalize()
        .map_err(|error| format!("Unable to open the selected ZIP: {error}"))?;
    if !canonical_path.is_file() {
        return Err("Selected Notion export is not a file".to_string());
    }

    let file =
        File::open(&canonical_path).map_err(|error| format!("Unable to read ZIP: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid or damaged ZIP: {error}"))?;
    if archive.len() == 0 || archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("Notion ZIP is empty or exceeds the entry limit".to_string());
    }

    let mut seen = HashSet::with_capacity(archive.len());
    let mut documents = Vec::new();
    let mut assets = Vec::new();
    let mut skipped = Vec::new();
    let mut total_size = 0_u64;
    let mut total_document_size = 0_u64;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let relative_path = normalized_entry_path(&entry)?;
        if !seen.insert(relative_path.clone()) {
            return Err(format!("ZIP contains a duplicate entry: {relative_path}"));
        }
        if is_symlink(&entry) {
            return Err(format!("ZIP contains a symbolic link: {relative_path}"));
        }
        if entry.is_dir() {
            continue;
        }

        total_size = total_size
            .checked_add(entry.size())
            .ok_or_else(|| "ZIP uncompressed size overflowed".to_string())?;
        if total_size > MAX_TOTAL_UNCOMPRESSED_BYTES {
            return Err("Notion ZIP exceeds the total uncompressed size limit".to_string());
        }

        if let Some(kind) = document_kind(&relative_path) {
            let next_document_size = total_document_size
                .checked_add(entry.size())
                .ok_or_else(|| "ZIP document size overflowed".to_string())?;
            if entry.size() > MAX_DOCUMENT_BYTES || next_document_size > MAX_TOTAL_DOCUMENT_BYTES {
                skipped.push(NotionExportSkipped {
                    relative_path,
                    reason: "document or combined document content exceeds the size limit"
                        .to_string(),
                });
                continue;
            }
            let capacity = usize::try_from(entry.size()).unwrap_or(0);
            let mut bytes = Vec::with_capacity(capacity);
            entry
                .by_ref()
                .take(MAX_DOCUMENT_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|error| format!("Unable to read ZIP document: {error}"))?;
            if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_DOCUMENT_BYTES {
                skipped.push(NotionExportSkipped {
                    relative_path,
                    reason: "document expanded beyond the size limit".to_string(),
                });
                continue;
            }
            total_document_size = next_document_size;
            match String::from_utf8(bytes) {
                Ok(content) => documents.push(NotionExportDocument {
                    relative_path,
                    kind,
                    content,
                    size: entry.size(),
                }),
                Err(_) => skipped.push(NotionExportSkipped {
                    relative_path,
                    reason: "document is not UTF-8".to_string(),
                }),
            }
        } else if is_ignored_notion_file(&relative_path) {
            skipped.push(NotionExportSkipped {
                relative_path,
                reason: "HTML export entry is not imported".to_string(),
            });
        } else if entry.size() > MAX_ASSET_BYTES {
            skipped.push(NotionExportSkipped {
                relative_path,
                reason: "attachment exceeds the size limit".to_string(),
            });
        } else {
            assets.push(NotionExportAsset {
                relative_path,
                size: entry.size(),
            });
        }
    }

    if documents.is_empty() {
        return Err("The ZIP contains no supported Markdown or CSV documents".to_string());
    }
    documents.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    assets.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    let allowed_assets = assets
        .iter()
        .map(|asset| asset.relative_path.clone())
        .collect();
    let token = Uuid::new_v4().to_string();
    state.insert(
        token.clone(),
        NotionArchiveSession {
            archive_path: canonical_path.clone(),
            allowed_assets,
        },
    )?;
    let export_name = canonical_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Notion export")
        .to_string();

    Ok(NotionExportManifest {
        session_token: token,
        export_name,
        documents,
        assets,
        skipped,
    })
}
