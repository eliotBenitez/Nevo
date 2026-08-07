use std::io::{Seek, Write};
use std::path::Path;

use zip::write::{FileOptions, SimpleFileOptions};
use zip::{AesMode, CompressionMethod, ZipWriter};

use super::collect::CollectedFile;
use super::header::{header_json_bytes, ExportHeader, NEVO_EXPORT_HEADER};
use super::TransferProgress;

fn validate_archive_entry_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') {
        return Err(format!("Invalid archive entry name: {name}"));
    }
    if name
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(format!("Invalid archive entry name: {name}"));
    }
    Ok(())
}

/// Builds the per-entry write options: Deflate compression, plus AES-256
/// encryption when a password is supplied. `FileOptions` is `Copy`, so the
/// same value is reused for every entry rather than rebuilt per file.
fn entry_options(password: Option<&str>) -> FileOptions<'_, ()> {
    let base = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    match password {
        Some(password) => base.with_aes_encryption(AesMode::Aes256, password),
        None => base,
    }
}

/// Writes every collected file into a `.nevoz` container, `nevo-export.json`
/// first. When `password` is `Some`, every entry (including the header) is
/// AES-256 encrypted.
pub(super) fn write_workspace_archive<W: Write + Seek>(
    writer: W,
    root: &Path,
    files: &[CollectedFile],
    header: &ExportHeader,
    password: Option<&str>,
    progress: &tauri::ipc::Channel<TransferProgress>,
) -> Result<(), String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Unable to resolve workspace root: {error}"))?;

    let total = files.len() as u64;
    let _ = progress.send(TransferProgress::Started { total });
    if password.is_some() {
        let _ = progress.send(TransferProgress::Encrypting);
    }

    let mut zip = ZipWriter::new(writer);
    let options = entry_options(password);

    zip.start_file(NEVO_EXPORT_HEADER, options)
        .map_err(|error| error.to_string())?;
    zip.write_all(&header_json_bytes(header)?)
        .map_err(|error| error.to_string())?;

    for (index, file) in files.iter().enumerate() {
        validate_archive_entry_name(&file.archive_path)?;

        let metadata = std::fs::symlink_metadata(&file.source_path)
            .map_err(|error| format!("Unable to stat {}: {error}", file.archive_path))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Refusing to export a symlink: {}",
                file.archive_path
            ));
        }
        let canonical_source = file
            .source_path
            .canonicalize()
            .map_err(|error| format!("Unable to resolve {}: {error}", file.archive_path))?;
        if !canonical_source.starts_with(&canonical_root) {
            return Err(format!("{} escapes the workspace root", file.archive_path));
        }

        zip.start_file(&file.archive_path, options)
            .map_err(|error| error.to_string())?;
        let bytes = std::fs::read(&canonical_source)
            .map_err(|error| format!("Unable to read {}: {error}", file.archive_path))?;
        zip.write_all(&bytes).map_err(|error| error.to_string())?;

        let _ = progress.send(TransferProgress::File {
            done: index as u64 + 1,
            total,
        });
    }

    zip.finish().map_err(|error| error.to_string())?;
    let _ = progress.send(TransferProgress::Finished);
    Ok(())
}
