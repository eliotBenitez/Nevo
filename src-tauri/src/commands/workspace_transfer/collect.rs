use std::path::{Path, PathBuf};

/// Sanity cap on the combined size of every source file collected for export.
/// Prevents an accidental multi-hundred-GB workspace (or a symlink loop that
/// slipped past the symlink check) from silently filling the export disk.
const MAX_TOTAL_SOURCE_BYTES: u64 = 20 * 1024 * 1024 * 1024;

/// A workspace file staged for the archive: its forward-slash path inside the
/// `.nevoz` container plus where to read its bytes from on disk.
#[derive(Debug, Clone)]
pub(super) struct CollectedFile {
    pub archive_path: String,
    pub source_path: PathBuf,
    /// Recorded for a possible future byte-level progress readout; the
    /// current writer only reports file-count progress.
    #[allow(dead_code)]
    pub size: u64,
}

#[derive(Debug, Default)]
struct Collector {
    files: Vec<CollectedFile>,
    total_bytes: u64,
}

fn relative_archive_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/"))
}

fn push_file(root: &Path, path: &Path, collector: &mut Collector) -> Result<(), String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let size = metadata.len();
    collector.total_bytes = collector
        .total_bytes
        .checked_add(size)
        .ok_or_else(|| "Workspace export size overflowed".to_string())?;
    if collector.total_bytes > MAX_TOTAL_SOURCE_BYTES {
        return Err("Workspace exceeds the export size limit".to_string());
    }
    collector.files.push(CollectedFile {
        archive_path: relative_archive_path(root, path)?,
        source_path: path.to_path_buf(),
        size,
    });
    Ok(())
}

/// Walks `dir` recursively, pushing every regular file found. Symlinks
/// (files or directories) are skipped rather than followed, so a link
/// pointing outside the workspace cannot smuggle unrelated files into the
/// archive or create an infinite walk.
fn collect_dir_recursive(root: &Path, dir: &Path, collector: &mut Collector) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            collect_dir_recursive(root, &path, collector)?;
        } else if file_type.is_file() {
            push_file(root, &path, collector)?;
        }
    }
    Ok(())
}

/// Collects every file that makes up a full local-workspace backup: note
/// content, the workspace/settings manifests, the database, and the
/// recursive `.nevo` subdirectories that hold user data. Deliberately never
/// walks `.nevo/github`, `.nevo/marketplace`, or `folders/` — those are
/// host-specific or transient and are excluded simply by not being listed
/// below.
pub(super) fn collect_full_workspace_files(root: &Path) -> Result<Vec<CollectedFile>, String> {
    // Fold the database WAL into the main file so its committed rows are
    // captured by the copy below. Best-effort: a checkpoint failure must not
    // abort the export of everything else.
    let _ = crate::commands::database::checkpoint_database(root);

    let mut collector = Collector::default();

    let notes_dir = root.join("notes");
    if notes_dir.is_dir() {
        for entry in std::fs::read_dir(&notes_dir).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            let file_type = entry.file_type().map_err(|error| error.to_string())?;
            if file_type.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("nevo")
            {
                push_file(root, &path, &mut collector)?;
            }
        }
    }

    for relative in [
        ".nevo/workspace.json",
        ".nevo/settings.json",
        ".nevo/custom.css",
        ".nevo/databases.sqlite",
    ] {
        let path = root.join(relative);
        if path.is_file() {
            push_file(root, &path, &mut collector)?;
        }
    }

    for relative in [
        ".nevo/assets",
        ".nevo/boards",
        ".nevo/snapshots",
        ".nevo/templates",
        ".nevo/index",
        ".nevo/plugins",
        ".nevo/collab",
    ] {
        collect_dir_recursive(root, &root.join(relative), &mut collector)?;
    }

    Ok(collector.files)
}
