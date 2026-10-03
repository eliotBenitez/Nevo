use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::commands::path_utils::replace_file_durable;

const MAX_CONFIG_BYTES: u64 = 8 * 1024 * 1024;

fn reject_symlink_ancestors(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Agent configuration path is invalid".to_string())?;
    for directory in parent.ancestors() {
        let metadata = match fs::symlink_metadata(directory) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err("Could not inspect agent configuration directory".to_string()),
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("Agent configuration directory must not be a symlink".to_string());
        }
    }
    Ok(())
}

pub fn read_existing(path: &Path) -> Result<Option<Vec<u8>>, String> {
    reject_symlink_ancestors(path)?;
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Could not inspect agent configuration".to_string()),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Agent configuration must be a regular file".to_string());
    }
    if metadata.len() > MAX_CONFIG_BYTES {
        return Err("Agent configuration is too large".to_string());
    }
    fs::read(path)
        .map(Some)
        .map_err(|_| "Could not read agent configuration".to_string())
}

fn backup_path(path: &Path) -> Result<PathBuf, String> {
    let name = path
        .file_name()
        .ok_or_else(|| "Agent configuration path is invalid".to_string())?
        .to_string_lossy();
    Ok(path.with_file_name(format!("{name}.nevo-backup")))
}

fn verify_existing_backup(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "Could not inspect existing agent configuration backup".to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Existing agent configuration backup is not a regular file".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("Existing agent configuration backup is not owner-only".to_string());
        }
    }
    Ok(())
}

fn owner_only_file(path: &Path) -> Result<std::fs::File, String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(path)
        .map_err(|_| "Could not create agent configuration file".to_string())
}

fn preserve_mode(file: &std::fs::File, path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(path) {
            let mode = metadata.permissions().mode() & 0o777;
            file.set_permissions(fs::Permissions::from_mode(mode))
                .map_err(|_| "Could not preserve agent configuration permissions".to_string())?;
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (file, path);
    }
    Ok(())
}

pub fn replace_if_unchanged(
    path: &Path,
    original: Option<&[u8]>,
    updated: &[u8],
) -> Result<(), String> {
    if original == Some(updated) {
        return Ok(());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Agent configuration path is invalid".to_string())?;
    reject_symlink_ancestors(path)?;
    fs::create_dir_all(parent)
        .map_err(|_| "Could not create agent configuration directory".to_string())?;
    if read_existing(path)?.as_deref() != original {
        return Err("Agent configuration changed while Nevo was editing it".to_string());
    }
    if let Some(original) = original {
        let backup = backup_path(path)?;
        match owner_only_file(&backup) {
            Ok(mut file) => {
                if file
                    .write_all(original)
                    .and_then(|_| file.sync_all())
                    .is_err()
                {
                    drop(file);
                    let _ = fs::remove_file(&backup);
                    return Err("Could not back up agent configuration".to_string());
                }
            }
            Err(_) if backup.exists() => verify_existing_backup(&backup)?,
            Err(error) => return Err(error),
        }
    }
    let name = path
        .file_name()
        .ok_or_else(|| "Agent configuration path is invalid".to_string())?
        .to_string_lossy();
    let temp = parent.join(format!(".{name}.{}.tmp", uuid::Uuid::new_v4()));
    let mut file = owner_only_file(&temp)?;
    let write_result = (|| {
        file.write_all(updated)
            .and_then(|_| file.sync_all())
            .map_err(|_| "Could not write agent configuration".to_string())?;
        preserve_mode(&file, path)
    })();
    drop(file);
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    // External clients that do not cooperate with Nevo's in-process lock can
    // still race this final check and the atomic rename. Keep the original backup.
    if read_existing(path)?.as_deref() != original {
        let _ = fs::remove_file(&temp);
        return Err("Agent configuration changed while Nevo was editing it".to_string());
    }
    let result = replace_file_durable(&temp, path)
        .map_err(|_| "Could not replace agent configuration".to_string());
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
