// Everything in this module exists only to support the one-time legacy
// `.nevo/collab/<id>.yjs` -> `note.json` migration (see
// `src/core/legacy-yjs/migrateWorkspaceYjs.ts`, driven from
// `migrateLegacyYjsState` in `src/stores/workspace.ts`) and the workspace's
// own bookkeeping around it. `note.json` is a note's sole source of truth;
// the editor no longer reads or writes a Y.Doc. Once the legacy migration
// path is removed in a later release, this whole module goes with it.

use chrono::Utc;
use std::path::Path;

use tauri::ipc::Response;

use crate::commands::path_utils::normalize_workspace_path;

pub(crate) fn yjs_state_path(
    workspace_path: &str,
    note_id: &str,
) -> Result<std::path::PathBuf, String> {
    crate::commands::path_utils::validate_id(note_id)?;
    Ok(Path::new(workspace_path)
        .join(".nevo")
        .join("collab")
        .join(format!("{}.yjs", note_id)))
}

/// Loads the persisted Y.Doc bytes and returns them as a raw binary response
/// (ArrayBuffer on the frontend), avoiding JSON-array encoding.
#[tauri::command]
pub async fn load_yjs_state(workspace_path: String, note_id: String) -> Result<Response, String> {
    let bytes =
        tauri::async_runtime::spawn_blocking(move || load_yjs_state_impl(workspace_path, note_id))
            .await
            .map_err(|error| error.to_string())??;
    Ok(Response::new(bytes))
}

fn load_yjs_state_impl(workspace_path: String, note_id: String) -> Result<Vec<u8>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let path = yjs_state_path(&workspace_path, &note_id)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    std::fs::read(&path).map_err(|e| e.to_string())
}

fn collab_dir_path(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path).join(".nevo").join("collab")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveLegacyCollabDirResult {
    pub archived: bool,
    pub archive_path: Option<String>,
}

/// Renames the whole `.nevo/collab` directory aside as a timestamped backup —
/// a BACKUP, never a delete — once the frontend's `migrateWorkspaceYjs` has
/// folded every note's Y.Doc content into `note.json`. A no-op (not an error)
/// when `.nevo/collab` does not exist: a fresh workspace, or a workspace this
/// already ran against.
///
/// `note_ids` should be every note id the caller migrated (e.g.
/// `collectWorkspaceNoteIds`): each one's write lock is held for the duration
/// of the rename, the same guard `save_note` takes for a single note, so this
/// cannot race an in-flight save for any note being archived.
#[tauri::command]
pub async fn archive_legacy_collab_dir(
    workspace_path: String,
    note_ids: Vec<String>,
) -> Result<ArchiveLegacyCollabDirResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        archive_legacy_collab_dir_impl(workspace_path, note_ids)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Cheap existence check the frontend uses to skip the whole
/// `migrateWorkspaceYjs` pass (including its dynamic `yjs` import and one
/// `load_yjs_state` IPC call per note) once a workspace has already been
/// migrated and `archive_legacy_collab_dir` has renamed `.nevo/collab` away.
/// `true` only when `.nevo/collab` exists as a directory.
#[tauri::command]
pub async fn has_legacy_collab_dir(workspace_path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || has_legacy_collab_dir_impl(workspace_path))
        .await
        .map_err(|error| error.to_string())?
}

fn has_legacy_collab_dir_impl(workspace_path: String) -> Result<bool, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    Ok(collab_dir_path(&workspace_path).is_dir())
}

fn archive_legacy_collab_dir_impl(
    workspace_path: String,
    note_ids: Vec<String>,
) -> Result<ArchiveLegacyCollabDirResult, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();

    let mut ids = note_ids;
    for id in &ids {
        crate::commands::path_utils::validate_id(id)?;
    }
    ids.sort();
    ids.dedup();

    // Hold every note's write lock for the duration of the rename so this
    // cannot race an in-flight `save_note` for any note being archived. The
    // locks (and their guards) are kept alive until the end of this function.
    let note_locks: Vec<_> = ids
        .iter()
        .map(|id| super::note_lock(&workspace_path, id))
        .collect();
    let _note_guards = note_locks
        .iter()
        .map(|lock| lock.lock().map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, _>>()?;

    let source = collab_dir_path(&workspace_path);
    if !source.exists() {
        return Ok(ArchiveLegacyCollabDirResult {
            archived: false,
            archive_path: None,
        });
    }

    let nevo_dir = Path::new(&workspace_path).join(".nevo");
    let timestamp = Utc::now().timestamp();
    let mut suffix = 0u32;
    let (backup_name, backup_path) = loop {
        let name = if suffix == 0 {
            format!("collab-legacy-{timestamp}")
        } else {
            format!("collab-legacy-{timestamp}-{suffix}")
        };
        let candidate = nevo_dir.join(&name);
        if !candidate.exists() {
            break (name, candidate);
        }
        suffix += 1;
    };

    std::fs::rename(&source, &backup_path).map_err(|e| e.to_string())?;
    // Best-effort: the directory is already safely moved regardless of
    // whether the directory-entry fsync below lands.
    let _ = crate::commands::path_utils::sync_parent_directory(&nevo_dir);

    Ok(ArchiveLegacyCollabDirResult {
        archived: true,
        archive_path: Some(format!(".nevo/{backup_name}")),
    })
}

/// Max size for a text file imported through `read_text_file` (25 MiB).
const MAX_TEXT_IMPORT_BYTES: u64 = 25 * 1024 * 1024;

/// `read_text_file` backs the "import external markdown" flow, where the user
/// picks a file through the OS dialog, so it cannot be restricted to the
/// workspace. To limit the blast radius of a hostile caller (e.g. via XSS) we
/// only read regular text files of a bounded size and reject everything else
/// (no `~/.ssh/id_rsa`, no multi-GB reads, no special files).
fn read_text_file_path(p: &Path) -> Result<String, String> {
    let allowed_ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .map(|e| {
            matches!(
                e.as_str(),
                "md" | "markdown" | "mdown" | "mkd" | "txt" | "text"
            )
        })
        .unwrap_or(false);
    if !allowed_ext {
        return Err("Only text files (.md/.markdown/.txt) can be imported".to_string());
    }

    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Not a regular file".to_string());
    }
    if meta.len() > MAX_TEXT_IMPORT_BYTES {
        return Err("File is too large to import".to_string());
    }

    std::fs::read_to_string(p).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedTextFile {
    content: String,
    file_name: String,
}

#[tauri::command]
pub async fn pick_and_read_text_file(
    app: tauri::AppHandle,
) -> Result<Option<PickedTextFile>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(
            "Markdown or text",
            &["md", "markdown", "mdown", "mkd", "txt", "text"],
        )
        .pick_file(move |file| {
            let _ = sender.send(file);
        });
    let Some(file) = receiver
        .await
        .map_err(|_| "File picker closed unexpectedly".to_string())?
    else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|_| "Selected file is not accessible as a local path".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let content = read_text_file_path(&path)?;
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled.md")
            .to_string();
        Ok(Some(PickedTextFile { content, file_name }))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    struct TestDir {
        path: std::path::PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-collab-{}", Uuid::new_v4()));
            std::fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn has_legacy_collab_dir_reports_existence_and_absence() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();

        assert!(!has_legacy_collab_dir_impl(workspace_path.clone()).unwrap());

        let collab_dir = collab_dir_path(&workspace_path);
        std::fs::create_dir_all(&collab_dir).unwrap();
        assert!(has_legacy_collab_dir_impl(workspace_path).unwrap());
    }

    #[test]
    fn archive_legacy_collab_dir_renames_an_existing_dir() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();
        let collab_dir = collab_dir_path(&workspace_path);
        std::fs::create_dir_all(&collab_dir).unwrap();
        std::fs::write(collab_dir.join("note-1.yjs"), b"legacy-bytes").unwrap();

        let result =
            archive_legacy_collab_dir_impl(workspace_path.clone(), vec!["note-1".to_string()])
                .expect("archive");

        assert!(result.archived);
        let archive_path = result.archive_path.expect("archive_path");
        assert!(archive_path.starts_with(".nevo/collab-legacy-"));
        assert!(
            !collab_dir.exists(),
            "the original .nevo/collab dir must be moved, not copied"
        );
        let archived_note = Path::new(&workspace_path)
            .join(&archive_path)
            .join("note-1.yjs");
        assert_eq!(std::fs::read(&archived_note).unwrap(), b"legacy-bytes");
    }

    #[test]
    fn archive_legacy_collab_dir_is_a_noop_when_absent() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();

        let result = archive_legacy_collab_dir_impl(workspace_path, Vec::new()).expect("archive");

        assert!(!result.archived);
        assert!(result.archive_path.is_none());
    }

    #[test]
    fn archive_legacy_collab_dir_does_not_clobber_an_existing_archive() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();
        let collab_dir = collab_dir_path(&workspace_path);
        std::fs::create_dir_all(&collab_dir).unwrap();
        std::fs::write(collab_dir.join("note-1.yjs"), b"first-run").unwrap();

        let first = archive_legacy_collab_dir_impl(workspace_path.clone(), Vec::new())
            .expect("first archive");
        assert!(first.archived);

        // A second `.nevo/collab` reappears (e.g. the app was reopened and the
        // editor wrote a fresh one) and gets archived again in the same run.
        std::fs::create_dir_all(&collab_dir).unwrap();
        std::fs::write(collab_dir.join("note-2.yjs"), b"second-run").unwrap();

        let second = archive_legacy_collab_dir_impl(workspace_path.clone(), Vec::new())
            .expect("second archive");
        assert!(second.archived);

        assert_ne!(first.archive_path, second.archive_path);
        let first_path = Path::new(&workspace_path).join(first.archive_path.unwrap());
        let second_path = Path::new(&workspace_path).join(second.archive_path.unwrap());
        assert!(first_path.join("note-1.yjs").exists());
        assert!(second_path.join("note-2.yjs").exists());
    }

    #[test]
    fn archive_legacy_collab_dir_rejects_an_invalid_note_id() {
        let dir = TestDir::new();
        let workspace_path = dir.path_string();

        let result = archive_legacy_collab_dir_impl(workspace_path, vec!["../escape".to_string()]);

        assert!(result.is_err());
    }
}
