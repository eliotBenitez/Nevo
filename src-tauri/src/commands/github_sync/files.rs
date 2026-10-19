//! Which workspace files a GitHub backup uploads, and the git blob id used
//! to skip files already stored in the repository.

use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};

use crate::commands::database::snapshot_database;
use crate::commands::workspace_transfer::collect::collect_full_workspace_files;

/// Files larger than this are skipped instead of uploaded. The GitHub Git Data
/// blob API (`POST /git/blobs`) returns a `504 Gateway Timeout` well before its
/// hard 40 MiB limit, and base64 encoding inflates the payload by ~33%, so a
/// single oversized asset would otherwise abort the whole sync.
pub(super) const MAX_BLOB_BYTES: u64 = 25 * 1024 * 1024;
pub(super) const MAX_SYNC_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RepoFile {
    pub(super) path: String,
    pub(super) source_path: PathBuf,
}

/// Outcome of walking the workspace: the files to upload plus the relative
/// paths of any files skipped because they exceed `MAX_BLOB_BYTES`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct CollectedFiles {
    pub(super) files: Vec<RepoFile>,
    pub(super) skipped: Vec<String>,
}

/// Directories the full-workspace export walks but a GitHub backup leaves
/// out: installed plugin code is reinstallable and can be large.
const EXCLUDED_PREFIXES: &[&str] = &[".nevo/plugins/"];

pub(super) const DATABASE_PATH: &str = ".nevo/databases.sqlite";

/// Reuses the `.nevoz` export collector (which skips symlinks, so nothing
/// outside the workspace can be uploaded) and applies the GitHub size limits.
pub(super) fn collect_workspace_files(workspace_path: &str) -> Result<CollectedFiles, String> {
    let mut collected = CollectedFiles::default();
    let mut total_bytes = 0u64;
    for file in collect_full_workspace_files(Path::new(workspace_path))? {
        if EXCLUDED_PREFIXES
            .iter()
            .any(|prefix| file.archive_path.starts_with(prefix))
        {
            continue;
        }
        if file.size > MAX_BLOB_BYTES {
            collected.skipped.push(file.archive_path);
            continue;
        }
        total_bytes = total_bytes.saturating_add(file.size);
        if total_bytes > MAX_SYNC_BYTES {
            return Err("Workspace files exceed the 512 MiB GitHub Sync limit".to_string());
        }
        collected.files.push(RepoFile {
            path: file.archive_path,
            source_path: file.source_path,
        });
    }
    Ok(collected)
}

/// Temporary `VACUUM INTO` copy of `databases.sqlite`, deleted on drop.
pub(super) struct DatabaseSnapshot(pub(super) PathBuf);

impl Drop for DatabaseSnapshot {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Points the collected database entry at a consistent snapshot instead of
/// the live file, which the app may be writing while it is uploaded.
pub(super) fn snapshot_collected_database(
    workspace_path: &str,
    collected: &mut CollectedFiles,
) -> Result<Option<DatabaseSnapshot>, String> {
    let Some(index) = collected
        .files
        .iter()
        .position(|file| file.path == DATABASE_PATH)
    else {
        return Ok(None);
    };
    let snapshot = DatabaseSnapshot(
        std::env::temp_dir().join(format!("nevo-github-sync-{}.sqlite", uuid::Uuid::new_v4())),
    );
    if !snapshot_database(Path::new(workspace_path), &snapshot.0)? {
        collected.files.remove(index);
        return Ok(None);
    }
    collected.files[index].source_path = snapshot.0.clone();
    Ok(Some(snapshot))
}

/// Compute the git blob object id for `bytes`: SHA-1 over the git blob header
/// (`blob <len>\0`) followed by the raw content. This equals the `sha` GitHub
/// reports for a blob in a tree, so a matching id means the file is already
/// stored in the repo and does not need re-uploading.
pub(super) fn git_blob_sha(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", bytes.len()).as_bytes());
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}
