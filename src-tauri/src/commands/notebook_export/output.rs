use std::fs::{File, OpenOptions as FsOpenOptions};
#[cfg(target_os = "android")]
use std::io::Read;
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "android")]
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

#[derive(Debug)]
pub(super) enum Destination {
    Path(PathBuf),
    #[cfg(target_os = "android")]
    Uri(FilePath),
}

pub(super) fn validate_file_name(file_name: &str, extension: &str) -> Result<String, String> {
    let name = file_name.trim();
    if name.is_empty()
        || name.len() > 240
        || name.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
        })
        || name.ends_with('.')
        || Path::new(name).file_name().and_then(|value| value.to_str()) != Some(name)
        || !name
            .to_ascii_lowercase()
            .ends_with(&format!(".{}", extension.to_ascii_lowercase()))
    {
        return Err("Invalid export file name".to_string());
    }
    Ok(name.to_string())
}

pub(super) async fn pick_destination(
    app: AppHandle,
    file_name: String,
    filter_name: &'static str,
    extension: &'static str,
) -> Result<Option<Destination>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(file_name)
        .add_filter(filter_name, &[extension])
        .save_file(move |selection| {
            let _ = sender.send(selection);
        });
    let Some(selection) = receiver
        .await
        .map_err(|_| "Export dialog was closed unexpectedly".to_string())?
    else {
        return Ok(None);
    };
    #[cfg(target_os = "android")]
    {
        return Ok(Some(match selection {
            FilePath::Url(url) if url.scheme() == "content" => Destination::Uri(FilePath::Url(url)),
            other => Destination::Path(other.into_path().map_err(|error| error.to_string())?),
        }));
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(Some(Destination::Path(
            selection.into_path().map_err(|error| error.to_string())?,
        )))
    }
}

pub(super) fn write_destination(
    _app: &AppHandle,
    destination: Destination,
    _workspace_path: &str,
    _note_id: &str,
    _extension: &str,
    bytes: &[u8],
) -> Result<(), String> {
    match destination {
        Destination::Path(path) => crate::commands::path_utils::write_atomic(&path, bytes)
            .map_err(|error| error.to_string()),
        #[cfg(target_os = "android")]
        Destination::Uri(uri) => {
            write_android_uri(_app, uri, _workspace_path, _note_id, _extension, bytes)
        }
    }
}

pub(super) fn write_source_destination(
    _app: &AppHandle,
    destination: Destination,
    source: File,
    expected_bytes: u64,
) -> Result<(), String> {
    match destination {
        Destination::Path(path) => copy_file_atomic(source, &path, expected_bytes),
        #[cfg(target_os = "android")]
        Destination::Uri(uri) => copy_to_content_uri(_app, uri, source, expected_bytes),
    }
}

fn copy_file_atomic(mut source: File, target: &Path, expected_bytes: u64) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "Export destination has no parent directory".to_string())?;
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Export destination has an invalid file name".to_string())?;
    let temporary = parent.join(format!(".{name}.{}.tmp", Uuid::new_v4()));
    let mut staged = FsOpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    let copied = std::io::copy(&mut source, &mut staged);
    let result = match copied {
        Ok(copied) if copied == expected_bytes => staged
            .flush()
            .and_then(|_| staged.sync_all())
            .map_err(|error| error.to_string()),
        Ok(_) => Err("Note source changed while it was being exported".to_string()),
        Err(error) => Err(error.to_string()),
    };
    drop(staged);
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    if let Err(error) = crate::commands::path_utils::replace_file_durable(&temporary, target) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn write_android_uri(
    app: &AppHandle,
    uri: FilePath,
    workspace_path: &str,
    note_id: &str,
    extension: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let workspace = crate::commands::path_utils::normalize_workspace_path(workspace_path)?;
    let export_dir = workspace.join(".nevo").join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|error| error.to_string())?;
    let _ = note_id;
    let stage_path = export_dir.join(format!("export-{}.{}", uuid::Uuid::new_v4(), extension));
    crate::commands::path_utils::write_atomic(&stage_path, bytes)
        .map_err(|error| error.to_string())?;
    let source = match std::fs::File::open(&stage_path) {
        Ok(source) => source,
        Err(error) => {
            let _ = std::fs::remove_file(&stage_path);
            return Err(error.to_string());
        }
    };
    let result = copy_to_content_uri(app, uri, source, bytes.len() as u64);
    let _ = std::fs::remove_file(stage_path);
    result
}

#[cfg(target_os = "android")]
fn copy_to_content_uri(
    app: &AppHandle,
    uri: FilePath,
    mut source: impl Read,
    expected_bytes: u64,
) -> Result<(), String> {
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        let mut target = app
            .fs()
            .open(uri.clone(), options)
            .map_err(|error| error.to_string())?;
        let copied = std::io::copy(&mut source, &mut target).map_err(|error| error.to_string())?;
        target.flush().map_err(|error| error.to_string())?;
        if copied != expected_bytes {
            return Err("Android export output was incomplete".to_string());
        }
        Ok(())
    })();
    if let Err(copy_error) = result {
        let mut cleanup_options = OpenOptions::new();
        cleanup_options.write(true).truncate(true);
        match app.fs().open(uri, cleanup_options) {
            Ok(mut partial) => {
                if let Err(cleanup_error) = partial.set_len(0) {
                    return Err(format!(
                        "{copy_error}; unable to clear partial Android PDF output: {cleanup_error}"
                    ));
                }
                if let Err(cleanup_error) = partial.flush() {
                    return Err(format!(
                        "{copy_error}; unable to flush partial Android PDF cleanup: {cleanup_error}"
                    ));
                }
            }
            Err(cleanup_error) => {
                return Err(format!(
                    "{copy_error}; unable to clear partial Android PDF output: {cleanup_error}"
                ));
            }
        }
        return Err(copy_error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_pdf_file_names_without_paths() {
        assert_eq!(
            validate_file_name("Notebook.pdf", "pdf").unwrap(),
            "Notebook.pdf"
        );
        for name in ["../note.pdf", "C:\\temp\\note.pdf", "note", "note.txt"] {
            assert!(validate_file_name(name, "pdf").is_err());
        }
        assert_eq!(
            validate_file_name("note-1.json", "json").unwrap(),
            "note-1.json"
        );
    }

    #[test]
    fn atomically_copies_streamed_raw_source_bytes() {
        let directory = std::env::temp_dir().join(format!("nevo-export-source-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let source_path = directory.join("source.nevo");
        let target_path = directory.join("note.json");
        let original = b"{\"documentKind\":\"future\",\"truncated\":";
        std::fs::write(&source_path, original).unwrap();

        copy_file_atomic(
            File::open(&source_path).unwrap(),
            &target_path,
            original.len() as u64,
        )
        .expect("copy original source bytes");
        assert_eq!(std::fs::read(&target_path).unwrap(), original);
        let leftovers: Vec<_> = std::fs::read_dir(&directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .filter(|name| name.to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty());
        let _ = std::fs::remove_dir_all(directory);
    }
}
