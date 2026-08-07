use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use zip::read::ZipFile;
use zip::result::ZipError;
use zip::ZipArchive;

use super::header::{validate_header, ExportHeader, NEVO_EXPORT_HEADER};
use super::TransferProgress;
use crate::commands::path_utils::write_atomic;

const MAX_ARCHIVE_ENTRIES: usize = 200_000;
const MAX_ENTRY_DEPTH: usize = 64;
/// Workspaces can carry large media libraries and long snapshot history, so
/// this cap is generous; it only exists to stop a maliciously crafted archive
/// (a "zip bomb") from exhausting disk space during extraction.
const MAX_TOTAL_UNCOMPRESSED_BYTES: u64 = 20 * 1024 * 1024 * 1024;

fn normalized_entry_path(entry: &ZipFile<'_, File>) -> Result<String, String> {
    if entry.name().contains('\\') {
        return Err("Archive entries with backslash paths are not supported".to_string());
    }
    let enclosed = entry
        .enclosed_name()
        .ok_or_else(|| format!("Archive entry has an unsafe path: {}", entry.name()))?;
    let depth = enclosed.components().count();
    if depth == 0 || depth > MAX_ENTRY_DEPTH {
        return Err(format!(
            "Archive entry exceeds the path depth limit: {}",
            entry.name()
        ));
    }
    Ok(enclosed
        .components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn is_symlink(entry: &ZipFile<'_, File>) -> bool {
    entry
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
}

fn open_archive(path: &Path) -> Result<ZipArchive<File>, String> {
    let file = File::open(path).map_err(|error| format!("Unable to open archive: {error}"))?;
    ZipArchive::new(file).map_err(|error| format!("Invalid or damaged Nevo archive: {error}"))
}

/// Reads and (if needed) decrypts a single entry's bytes by index.
///
/// - No password supplied, entry not encrypted: reads normally.
/// - No password supplied, entry encrypted: a clear "password required" error
///   (distinct from "wrong password") so the frontend can prompt instead of
///   just failing.
/// - Password supplied: wrong password surfaces as a distinct error
///   (`ZipError::InvalidPassword`) from any other archive corruption.
fn read_entry_bytes_by_index(
    archive: &mut ZipArchive<File>,
    index: usize,
    password: Option<&str>,
) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let result = match password {
        Some(password) => archive.by_index_decrypt(index, password.as_bytes()),
        None => archive.by_index(index),
    };
    match result {
        Ok(mut entry) => {
            entry
                .read_to_end(&mut buffer)
                .map_err(|error| error.to_string())?;
        }
        Err(ZipError::InvalidPassword) => return Err("Incorrect archive password".to_string()),
        Err(ZipError::UnsupportedArchive(ZipError::PASSWORD_REQUIRED)) => {
            return Err("This archive is password-protected; a password is required".to_string());
        }
        Err(error) => return Err(error.to_string()),
    }
    Ok(buffer)
}

/// Same as `read_entry_bytes_by_index`, but looks the entry up by name. Used
/// only for the header entry, which must be located before any per-index
/// iteration has happened.
fn read_entry_bytes_by_name(
    archive: &mut ZipArchive<File>,
    name: &str,
    password: Option<&str>,
) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let result = match password {
        Some(password) => archive.by_name_decrypt(name, password.as_bytes()),
        None => archive.by_name(name),
    };
    match result {
        Ok(mut entry) => {
            entry
                .read_to_end(&mut buffer)
                .map_err(|error| error.to_string())?;
        }
        Err(ZipError::InvalidPassword) => return Err("Incorrect archive password".to_string()),
        Err(ZipError::UnsupportedArchive(ZipError::PASSWORD_REQUIRED)) => {
            return Err("This archive is password-protected; a password is required".to_string());
        }
        Err(ZipError::FileNotFound) => {
            return Err("The selected file is not a Nevo workspace archive".to_string())
        }
        Err(error) => return Err(error.to_string()),
    }
    Ok(buffer)
}

/// Reads and validates just the `nevo-export.json` entry, without extracting
/// anything else. Used to fail fast (bad file / wrong password / unsupported
/// version) before the caller commits to a destination folder.
pub(super) fn read_archive_header(
    path: &Path,
    password: Option<&str>,
) -> Result<ExportHeader, String> {
    let mut archive = open_archive(path)?;
    let bytes = read_entry_bytes_by_name(&mut archive, NEVO_EXPORT_HEADER, password)?;
    validate_header(&bytes)
}

/// Extracts every entry of a `.nevoz` archive into `dest`. The header entry
/// is read and validated first so a bad file / password / version is
/// reported before any file is written. Every write goes through
/// `write_atomic`; entries are rejected on zip-slip, symlink, duplicate-name,
/// or size-limit grounds before their bytes are ever decompressed.
pub(super) fn extract_archive(
    archive_path: &Path,
    dest: &Path,
    password: Option<&str>,
    progress: &tauri::ipc::Channel<TransferProgress>,
) -> Result<ExportHeader, String> {
    let dest = dest
        .canonicalize()
        .map_err(|error| format!("Unable to resolve destination: {error}"))?;

    let mut archive = open_archive(archive_path)?;
    if archive.is_empty() || archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("Archive is empty or exceeds the entry limit".to_string());
    }

    let header_bytes = read_entry_bytes_by_name(&mut archive, NEVO_EXPORT_HEADER, password)?;
    let header = validate_header(&header_bytes)?;

    let total = archive.len() as u64;
    let _ = progress.send(TransferProgress::Extracting { done: 0, total });

    let mut seen = HashSet::with_capacity(archive.len());
    let mut total_uncompressed = 0_u64;

    for index in 0..archive.len() {
        let entry_info = {
            let entry = archive
                .by_index_raw(index)
                .map_err(|error| error.to_string())?;
            if entry.is_dir() {
                None
            } else {
                Some((
                    normalized_entry_path(&entry)?,
                    is_symlink(&entry),
                    entry.size(),
                ))
            }
        };
        let Some((relative_path, is_symlink, entry_size)) = entry_info else {
            continue;
        };
        if is_symlink {
            return Err(format!("Archive contains a symbolic link: {relative_path}"));
        }
        if !seen.insert(relative_path.clone()) {
            return Err(format!(
                "Archive contains a duplicate entry: {relative_path}"
            ));
        }
        total_uncompressed = total_uncompressed
            .checked_add(entry_size)
            .ok_or_else(|| "Archive uncompressed size overflowed".to_string())?;
        if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES {
            return Err("Archive exceeds the total uncompressed size limit".to_string());
        }

        let bytes = read_entry_bytes_by_index(&mut archive, index, password)?;
        let target = dest.join(&relative_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        write_atomic(&target, &bytes).map_err(|error| error.to_string())?;

        let _ = progress.send(TransferProgress::Extracting {
            done: index as u64 + 1,
            total,
        });
    }

    let _ = progress.send(TransferProgress::Finished);
    Ok(header)
}
