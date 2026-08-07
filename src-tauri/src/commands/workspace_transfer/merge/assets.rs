//! Copies newly-seen asset files from an extracted archive into the current
//! workspace's `.nevo/assets/**` (including `assets/draw/**`), deduplicating
//! by filename.

use std::path::Path;

use crate::commands::path_utils::write_atomic;

/// Assets are content-addressed (`<sha256>-<stem>.<ext>`), so a destination
/// file that already exists under the same name is byte-identical — that is
/// the dedup step, not a conflict to resolve. `src` attributes inside note
/// content are never rewritten, since the asset path convention
/// (`.nevo/assets/<name>`) does not change. Returns the number of files
/// actually copied (i.e. not already present).
pub(super) fn copy_new_assets(temp_dir: &Path, current_root: &Path) -> Result<u64, String> {
    let source_root = temp_dir.join(".nevo").join("assets");
    if !source_root.is_dir() {
        return Ok(0);
    }
    let dest_root = current_root.join(".nevo").join("assets");
    let mut copied = 0u64;
    copy_dir(&source_root, &dest_root, &mut copied)?;
    Ok(copied)
}

/// Paths are joined only from OS-reported `DirEntry::file_name()` components
/// (a single path segment, never a parsed string), so the destination can
/// never escape `dest_dir`'s subtree regardless of archive content.
fn copy_dir(source_dir: &Path, dest_dir: &Path, copied: &mut u64) -> Result<(), String> {
    let entries = std::fs::read_dir(source_dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        let dest_path = dest_dir.join(entry.file_name());
        if file_type.is_dir() {
            std::fs::create_dir_all(&dest_path).map_err(|error| error.to_string())?;
            copy_dir(&entry.path(), &dest_path, copied)?;
        } else if file_type.is_file() {
            if dest_path.exists() {
                continue;
            }
            if let Some(parent) = dest_path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let bytes = std::fs::read(entry.path()).map_err(|error| error.to_string())?;
            write_atomic(&dest_path, &bytes).map_err(|error| error.to_string())?;
            *copied += 1;
        }
    }
    Ok(())
}
