use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use super::archive_read::{extract_archive, read_archive_header};
use super::archive_write::write_workspace_archive;
use super::collect::{collect_full_workspace_files, CollectedFile};
use super::header::{
    build_header, header_json_bytes, validate_header, ExportHeader, ExportWorkspaceMeta,
};
use super::TransferProgress;

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

fn noop_channel() -> tauri::ipc::Channel<TransferProgress> {
    tauri::ipc::Channel::new(|_| Ok(()))
}

fn sample_header() -> ExportHeader {
    ExportHeader {
        format_version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: "2026-01-01T00:00:00Z".to_string(),
        encrypted: false,
        workspace: ExportWorkspaceMeta {
            id: "ws".to_string(),
            name: "Test".to_string(),
            glyph: "N".to_string(),
            gradient: "violet".to_string(),
            schema_version: 1,
        },
    }
}

/// Writes a minimal, hand-built (not through `write_workspace_archive`) zip
/// so the reader's own defenses (zip-slip, symlink, duplicate entries) can be
/// exercised in isolation.
fn write_raw_zip(path: &Path, header_bytes: &[u8], extra_entry: Option<(&str, &[u8])>) {
    let file = File::create(path).expect("create zip");
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file(super::header::NEVO_EXPORT_HEADER, options)
        .expect("start header entry");
    zip.write_all(header_bytes).expect("write header entry");
    if let Some((name, bytes)) = extra_entry {
        zip.start_file(name, options).expect("start extra entry");
        zip.write_all(bytes).expect("write extra entry");
    }
    zip.finish().expect("finish zip");
}

fn build_fake_workspace(root: &Path) {
    fs::create_dir_all(root.join("notes")).unwrap();
    fs::create_dir_all(root.join(".nevo/assets")).unwrap();
    fs::create_dir_all(root.join(".nevo/boards")).unwrap();
    fs::create_dir_all(root.join(".nevo/github")).unwrap();
    fs::create_dir_all(root.join(".nevo/marketplace")).unwrap();
    fs::create_dir_all(root.join(".nevo/collab")).unwrap();
    fs::create_dir_all(root.join(".nevo/collab-legacy-1234567890")).unwrap();
    fs::create_dir_all(root.join("folders")).unwrap();

    fs::write(
        root.join(".nevo/workspace.json"),
        // schemaVersion must stay <= CURRENT_WORKSPACE_SCHEMA_VERSION, or
        // build_header/validate_header (the workspace-schema-too-new gate)
        // rejects this fixture before the archive round trip even starts.
        br#"{"id":"ws-fake","name":"Fake","glyph":"N","gradient":"violet","schemaVersion":1,"createdAt":"2026-01-01T00:00:00Z","rootOrder":[],"tree":[],"rootNotes":[]}"#,
    )
    .unwrap();
    fs::write(root.join(".nevo/settings.json"), b"{}").unwrap();
    fs::write(root.join("notes/note-1.nevo"), b"note one content").unwrap();
    fs::write(root.join(".nevo/assets/pic.png"), b"png-bytes").unwrap();
    fs::write(root.join(".nevo/boards/board-1.json"), b"{}").unwrap();
    fs::write(root.join(".nevo/github/token.json"), b"secret-token").unwrap();
    fs::write(root.join(".nevo/marketplace/tx.json"), b"tx").unwrap();
    fs::write(root.join(".nevo/collab/note-1.yjs"), b"legacy-ydoc").unwrap();
    fs::write(
        root.join(".nevo/collab-legacy-1234567890/note-1.yjs"),
        b"archived-legacy-ydoc",
    )
    .unwrap();
    fs::write(root.join("folders/leftover"), b"legacy").unwrap();
}

#[test]
fn collect_write_and_extract_round_trip_preserves_files_and_excludes_host_specific_dirs() {
    let temp = TempDir::new("nevo-transfer-roundtrip");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);

    let header = build_header(&root, false).expect("build header");
    let files = collect_full_workspace_files(&root).expect("collect files");

    let archive_path = temp.path.join("export.nevoz");
    let file = File::create(&archive_path).expect("create archive file");
    write_workspace_archive(file, &root, &files, &header, None, &noop_channel())
        .expect("write archive");

    let dest = temp.path.join("restored");
    fs::create_dir_all(&dest).unwrap();
    let restored_header =
        extract_archive(&archive_path, &dest, None, &noop_channel()).expect("extract archive");

    assert_eq!(restored_header.workspace.id, "ws-fake");
    assert_eq!(
        fs::read_to_string(dest.join("notes/note-1.nevo")).unwrap(),
        "note one content"
    );
    assert_eq!(
        fs::read(dest.join(".nevo/assets/pic.png")).unwrap(),
        b"png-bytes"
    );
    assert_eq!(
        fs::read(dest.join(".nevo/boards/board-1.json")).unwrap(),
        b"{}"
    );
    assert!(fs::read_to_string(dest.join(".nevo/workspace.json"))
        .unwrap()
        .contains("ws-fake"));

    // Host-specific / transient dirs were never collected, so they cannot
    // appear in the archive or the restored workspace.
    assert!(!dest.join(".nevo/github").exists());
    assert!(!dest.join(".nevo/marketplace").exists());
    assert!(!dest.join("folders").exists());
    // Neither is legacy Y.Doc state: `notes/*.nevo` is a note's source of
    // truth, and a not-yet-migrated `.nevo/collab` or an archived
    // `.nevo/collab-legacy-*` backup is neither needed nor safe to restore
    // as if it were still authoritative.
    assert!(!dest.join(".nevo/collab").exists());
    assert!(!dest.join(".nevo/collab-legacy-1234567890").exists());
}

#[test]
fn extract_rejects_schema_one_notebook_before_writing_any_workspace_files() {
    let temp = TempDir::new("nevo-transfer-notebook-gate");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);
    fs::write(
        root.join("notes/notebook.nevo"),
        br#"{"id":"notebook","documentKind":"notebook","notebook":{"version":1,"pages":[]}}"#,
    )
    .unwrap();
    let header = build_header(&root, false).expect("header");
    let files = collect_full_workspace_files(&root).expect("workspace files");
    let archive_path = temp.path.join("schema-one-notebook.nevoz");
    write_workspace_archive(
        File::create(&archive_path).expect("create archive"),
        &root,
        &files,
        &header,
        None,
        &noop_channel(),
    )
    .expect("write archive");

    let dest = temp.path.join("restored");
    fs::create_dir_all(&dest).unwrap();
    let error = extract_archive(&archive_path, &dest, None, &noop_channel())
        .expect_err("schema-one notebook archive must be rejected");
    assert!(error.contains("schema version 2"));
    assert!(!dest.join(".nevo/workspace.json").exists());
    assert!(!dest.join("notes/notebook.nevo").exists());
}

#[test]
fn extract_rejects_header_manifest_schema_mismatch_before_writing() {
    let temp = TempDir::new("nevo-transfer-schema-mismatch");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);
    let mut header = build_header(&root, false).expect("header");
    header.workspace.schema_version = 2;
    let files = collect_full_workspace_files(&root).expect("workspace files");
    let archive_path = temp.path.join("mismatched-schema.nevoz");
    write_workspace_archive(
        File::create(&archive_path).expect("create archive"),
        &root,
        &files,
        &header,
        None,
        &noop_channel(),
    )
    .expect("write archive");

    let dest = temp.path.join("restored");
    fs::create_dir_all(&dest).unwrap();
    let error = extract_archive(&archive_path, &dest, None, &noop_channel())
        .expect_err("mismatched schema must be rejected");
    assert!(error.contains("does not match"));
    assert!(!dest.join(".nevo/workspace.json").exists());
}

#[test]
fn extract_preserves_notebook_payload_unknown_fields_byte_for_byte() {
    let temp = TempDir::new("nevo-transfer-notebook-roundtrip");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);
    let manifest_path = root.join(".nevo/workspace.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["schemaVersion"] = serde_json::json!(2);
    fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    let notebook_bytes = br#"{"id":"notebook","title":"Ink","icon":"N","folderId":null,"createdAt":"today","updatedAt":"today","properties":null,"content":{"type":"doc","content":[]},"documentKind":"notebook","notebook":{"version":1,"futureNotebookField":{"keep":[1,2]},"pages":[{"id":"page","width":595.28,"height":841.89,"paper":{"kind":"plain","futurePaperField":true},"objects":[],"futurePageField":"retained"}]},"futureNoteField":{"nested":"retained"}}"#;
    fs::write(root.join("notes/notebook.nevo"), notebook_bytes).unwrap();
    let header = build_header(&root, false).expect("header");
    let files = collect_full_workspace_files(&root).expect("workspace files");
    let archive_path = temp.path.join("notebook.nevoz");
    write_workspace_archive(
        File::create(&archive_path).expect("create archive"),
        &root,
        &files,
        &header,
        None,
        &noop_channel(),
    )
    .expect("write archive");

    let dest = temp.path.join("restored");
    fs::create_dir_all(&dest).unwrap();
    extract_archive(&archive_path, &dest, None, &noop_channel()).expect("extract archive");
    assert_eq!(
        fs::read(dest.join("notes/notebook.nevo")).unwrap(),
        notebook_bytes.as_slice()
    );
}

#[test]
fn write_workspace_archive_rejects_a_source_file_outside_the_workspace_root() {
    let temp = TempDir::new("nevo-transfer-write-escape");
    let root = temp.path.join("workspace");
    fs::create_dir_all(&root).unwrap();
    fs::write(temp.path.join("outside.txt"), b"secret").unwrap();

    let files = vec![CollectedFile {
        archive_path: "outside.txt".to_string(),
        source_path: temp.path.join("outside.txt"),
        size: 6,
    }];
    let mut buffer = std::io::Cursor::new(Vec::new());
    let result = write_workspace_archive(
        &mut buffer,
        &root,
        &files,
        &sample_header(),
        None,
        &noop_channel(),
    );
    assert!(
        result.is_err(),
        "a source path escaping the workspace root must be rejected"
    );
}

#[test]
fn write_and_extract_round_trip_with_aes_password_succeeds_with_the_correct_password() {
    let temp = TempDir::new("nevo-transfer-aes-roundtrip");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);

    let header = build_header(&root, true).expect("build header");
    let files = collect_full_workspace_files(&root).expect("collect files");

    let archive_path = temp.path.join("export.nevoz");
    let file = File::create(&archive_path).expect("create archive file");
    write_workspace_archive(
        file,
        &root,
        &files,
        &header,
        Some("CorrectHorse"),
        &noop_channel(),
    )
    .expect("write an AES-256 encrypted archive");

    let dest = temp.path.join("restored");
    fs::create_dir_all(&dest).unwrap();
    let restored_header =
        extract_archive(&archive_path, &dest, Some("CorrectHorse"), &noop_channel())
            .expect("the correct password must decrypt and extract the archive");

    assert_eq!(restored_header.workspace.id, "ws-fake");
    assert!(restored_header.encrypted);
    assert_eq!(
        fs::read_to_string(dest.join("notes/note-1.nevo")).unwrap(),
        "note one content"
    );
    assert_eq!(
        fs::read(dest.join(".nevo/assets/pic.png")).unwrap(),
        b"png-bytes"
    );
}

#[test]
fn extract_archive_rejects_a_wrong_password_on_an_aes_encrypted_archive() {
    let temp = TempDir::new("nevo-transfer-aes-wrong");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);

    let header = build_header(&root, true).expect("build header");
    let files = collect_full_workspace_files(&root).expect("collect files");
    let archive_path = temp.path.join("export.nevoz");
    let file = File::create(&archive_path).expect("create archive file");
    write_workspace_archive(
        file,
        &root,
        &files,
        &header,
        Some("CorrectHorse"),
        &noop_channel(),
    )
    .expect("write an AES-256 encrypted archive");

    let dest = temp.path.join("restored");
    fs::create_dir_all(&dest).unwrap();
    let result = extract_archive(&archive_path, &dest, Some("WrongPassword"), &noop_channel());
    assert!(result.is_err(), "a wrong password must be rejected");
}

#[test]
fn extract_archive_rejects_a_missing_password_on_an_aes_encrypted_archive() {
    let temp = TempDir::new("nevo-transfer-aes-missing");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);

    let header = build_header(&root, true).expect("build header");
    let files = collect_full_workspace_files(&root).expect("collect files");
    let archive_path = temp.path.join("export.nevoz");
    let file = File::create(&archive_path).expect("create archive file");
    write_workspace_archive(
        file,
        &root,
        &files,
        &header,
        Some("CorrectHorse"),
        &noop_channel(),
    )
    .expect("write an AES-256 encrypted archive");

    let dest = temp.path.join("restored");
    fs::create_dir_all(&dest).unwrap();
    let result = extract_archive(&archive_path, &dest, None, &noop_channel());
    assert!(result.is_err(), "a missing password must be rejected");
}

#[test]
fn read_archive_header_decrypts_just_the_header_of_an_aes_encrypted_archive() {
    let temp = TempDir::new("nevo-transfer-aes-header-only");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);

    let header = build_header(&root, true).expect("build header");
    let files = collect_full_workspace_files(&root).expect("collect files");
    let archive_path = temp.path.join("export.nevoz");
    let file = File::create(&archive_path).expect("create archive file");
    write_workspace_archive(
        file,
        &root,
        &files,
        &header,
        Some("CorrectHorse"),
        &noop_channel(),
    )
    .expect("write an AES-256 encrypted archive");

    let parsed = read_archive_header(&archive_path, Some("CorrectHorse"))
        .expect("the correct password must decrypt the header");
    assert_eq!(parsed.workspace.id, "ws-fake");
    assert!(parsed.encrypted);

    assert!(read_archive_header(&archive_path, Some("WrongPassword")).is_err());
    assert!(read_archive_header(&archive_path, None).is_err());
}

#[test]
fn extract_archive_rejects_zip_slip_entries() {
    let temp = TempDir::new("nevo-transfer-slip");
    let archive_path = temp.path.join("archive.nevoz");
    let header_bytes = header_json_bytes(&sample_header()).unwrap();
    write_raw_zip(
        &archive_path,
        &header_bytes,
        Some(("../evil.txt", b"pwned")),
    );

    let dest = temp.path.join("dest");
    fs::create_dir_all(&dest).unwrap();
    let result = extract_archive(&archive_path, &dest, None, &noop_channel());
    assert!(result.is_err(), "a zip-slip entry must be rejected");
    assert!(!temp.path.join("evil.txt").exists());
}

#[test]
fn extract_archive_rejects_symlink_entries() {
    let temp = TempDir::new("nevo-transfer-symlink");
    let archive_path = temp.path.join("archive.nevoz");

    let file = File::create(&archive_path).unwrap();
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file(super::header::NEVO_EXPORT_HEADER, options)
        .unwrap();
    zip.write_all(&header_json_bytes(&sample_header()).unwrap())
        .unwrap();
    zip.add_symlink(
        "notes/link.nevo",
        "target.nevo",
        SimpleFileOptions::default(),
    )
    .expect("add symlink entry");
    zip.finish().unwrap();

    let dest = temp.path.join("dest");
    fs::create_dir_all(&dest).unwrap();
    let result = extract_archive(&archive_path, &dest, None, &noop_channel());
    assert!(result.is_err(), "a symlink entry must be rejected");
}

#[test]
fn validate_header_rejects_garbage_and_unsupported_versions() {
    assert!(validate_header(b"not json").is_err());
    assert!(validate_header(br#"{"unexpected":"shape"}"#).is_err());

    let mut future = sample_header();
    future.format_version += 1;
    let bytes = header_json_bytes(&future).unwrap();
    assert!(validate_header(&bytes).is_err());
}

#[test]
fn validate_header_rejects_a_workspace_schema_version_newer_than_this_build_supports() {
    use crate::commands::workspace::CURRENT_WORKSPACE_SCHEMA_VERSION;

    let mut future = sample_header();
    future.workspace.schema_version = CURRENT_WORKSPACE_SCHEMA_VERSION + 1;
    let bytes = header_json_bytes(&future).unwrap();

    let error = validate_header(&bytes).expect_err("a newer workspace schema must be rejected");
    assert_eq!(
        error,
        format!(
            "workspace-schema-too-new:{}:{}",
            CURRENT_WORKSPACE_SCHEMA_VERSION + 1,
            CURRENT_WORKSPACE_SCHEMA_VERSION
        )
    );
}

#[test]
fn validate_header_accepts_the_current_format_version() {
    let bytes = header_json_bytes(&sample_header()).unwrap();
    let parsed = validate_header(&bytes).expect("current format version must validate");
    assert_eq!(parsed.workspace.id, "ws");
}

#[test]
fn collect_full_workspace_files_excludes_host_specific_and_transient_dirs() {
    let temp = TempDir::new("nevo-transfer-collect");
    let root = temp.path.join("workspace");
    build_fake_workspace(&root);

    let files = collect_full_workspace_files(&root).unwrap();
    let paths: Vec<_> = files.iter().map(|f| f.archive_path.as_str()).collect();

    assert!(paths.contains(&"notes/note-1.nevo"));
    assert!(paths.contains(&".nevo/workspace.json"));
    assert!(paths.contains(&".nevo/assets/pic.png"));
    assert!(!paths.iter().any(|p| p.starts_with(".nevo/github")));
    assert!(!paths.iter().any(|p| p.starts_with(".nevo/marketplace")));
    assert!(!paths.iter().any(|p| p.starts_with("folders")));
    assert!(
        !paths.iter().any(|p| p.starts_with(".nevo/collab")),
        "neither .nevo/collab nor a .nevo/collab-legacy-* backup should be exported"
    );
}
