use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use uuid::Uuid;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipWriter};

use super::assets::import_assets;
use super::scanner::scan_archive;
use super::session::NotionImportState;
use crate::commands::workspace::create_workspace;

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(prefix: &str) -> Self {
        let path = std::env::temp_dir().join(format!("{prefix}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temp directory");
        Self { path }
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn write_zip(path: &Path, entries: &[(&str, &[u8], Option<u32>)]) {
    let file = File::create(path).expect("create zip");
    let mut writer = ZipWriter::new(file);
    for (name, bytes, mode) in entries {
        let mut options = FileOptions::default().compression_method(CompressionMethod::Stored);
        if let Some(mode) = mode {
            options = options.unix_permissions(*mode);
        }
        writer.start_file(*name, options).expect("start zip entry");
        writer.write_all(bytes).expect("write zip entry");
    }
    writer.finish().expect("finish zip");
}

#[test]
fn scans_nested_markdown_csv_and_assets() {
    let temp = TempDir::new("nevo-notion-scan");
    let zip_path = temp.path.join("Team Export.zip");
    write_zip(
        &zip_path,
        &[
            (
                "Projects/Alpha abcdef1234567890abcdef1234567890.md",
                b"# Alpha",
                None,
            ),
            (
                "Projects/Tasks 1234567890abcdef1234567890abcdef.csv",
                b"Name,Done\nOne,true",
                None,
            ),
            ("Projects/Alpha/image.png", b"png", None),
        ],
    );
    let state = NotionImportState::default();

    let manifest = scan_archive(zip_path, &state).expect("scan archive");

    assert_eq!(manifest.export_name, "Team Export");
    assert_eq!(manifest.documents.len(), 2);
    assert_eq!(manifest.assets.len(), 1);
    assert!(state.get(&manifest.session_token).is_ok());
}

#[test]
fn rejects_damaged_unsafe_duplicate_and_symlink_archives() {
    let temp = TempDir::new("nevo-notion-invalid");
    let state = NotionImportState::default();
    let damaged = temp.path.join("damaged.zip");
    fs::write(&damaged, b"not a zip").expect("write damaged zip");
    assert!(scan_archive(damaged, &state).is_err());

    let unsafe_zip = temp.path.join("unsafe.zip");
    write_zip(&unsafe_zip, &[("../escape.md", b"bad", None)]);
    assert!(scan_archive(unsafe_zip, &state).is_err());

    let absolute_zip = temp.path.join("absolute.zip");
    write_zip(&absolute_zip, &[("/absolute.md", b"bad", None)]);
    assert!(scan_archive(absolute_zip, &state).is_err());

    let duplicate_zip = temp.path.join("duplicate.zip");
    write_zip(
        &duplicate_zip,
        &[("Page.md", b"one", None), ("Page.md", b"two", None)],
    );
    assert!(scan_archive(duplicate_zip, &state).is_err());

    let symlink_zip = temp.path.join("symlink.zip");
    let file = File::create(&symlink_zip).expect("create symlink zip");
    let mut writer = ZipWriter::new(file);
    writer
        .add_symlink("link.md", "target.md", FileOptions::default())
        .expect("add symlink");
    writer.finish().expect("finish symlink zip");
    assert!(scan_archive(symlink_zip, &state).is_err());

    let deep_zip = temp.path.join("deep.zip");
    let deep_name = format!("{}/Page.md", vec!["folder"; 33].join("/"));
    write_zip(&deep_zip, &[(deep_name.as_str(), b"too deep", None)]);
    assert!(scan_archive(deep_zip, &state).is_err());
}

#[test]
fn rejects_unsupported_exports_and_skips_oversized_documents() {
    let temp = TempDir::new("nevo-notion-limits");
    let state = NotionImportState::default();
    let pdf_only = temp.path.join("pdf-only.zip");
    write_zip(&pdf_only, &[("Export.pdf", b"pdf", None)]);
    assert!(scan_archive(pdf_only, &state).is_err());

    let oversized = temp.path.join("oversized.zip");
    let large_markdown = vec![b'x'; 10 * 1024 * 1024 + 1];
    write_zip(
        &oversized,
        &[
            ("Large.md", large_markdown.as_slice(), None),
            ("Valid.csv", b"Name\nOne", None),
        ],
    );
    let manifest = scan_archive(oversized, &state).expect("scan with skipped document");
    assert_eq!(manifest.documents.len(), 1);
    assert_eq!(manifest.skipped.len(), 1);
}

#[test]
fn imports_allowed_assets_as_a_batch_and_rejects_unknown_paths() {
    let temp = TempDir::new("nevo-notion-assets");
    let zip_path = temp.path.join("Export.zip");
    write_zip(
        &zip_path,
        &[
            ("Page.md", b"# Page", None),
            ("files/manual.pdf", b"pdf bytes", None),
        ],
    );
    let state = NotionImportState::default();
    let manifest = scan_archive(zip_path, &state).expect("scan archive");
    let session = state.get(&manifest.session_token).expect("session");
    let workspace = temp.path.join("workspace");
    create_workspace(
        workspace.to_string_lossy().into_owned(),
        "Workspace".to_string(),
        "N".to_string(),
        "linear-gradient(#000, #111)".to_string(),
    )
    .expect("create workspace");

    let results = import_assets(
        workspace.to_string_lossy().into_owned(),
        session,
        vec![
            "files/manual.pdf".to_string(),
            "not-allowed.pdf".to_string(),
        ],
    )
    .expect("batch import");

    assert!(results[0].asset.is_some());
    assert!(results[1].error.is_some());
}

#[test]
fn released_and_unknown_tokens_are_rejected() {
    let state = NotionImportState::default();
    assert!(state.get("unknown").is_err());
    assert!(!state.remove("unknown").expect("remove unknown"));

    let temp = TempDir::new("nevo-notion-release");
    let zip_path = temp.path.join("Export.zip");
    write_zip(&zip_path, &[("Page.md", b"Page", None)]);
    let manifest = scan_archive(zip_path, &state).expect("scan archive");
    assert!(state
        .remove(&manifest.session_token)
        .expect("release session"));
    assert!(state.get(&manifest.session_token).is_err());
}
