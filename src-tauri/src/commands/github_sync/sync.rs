//! The upload itself: reuse blobs already in the branch, push additive
//! checkpoint commits during long uploads, then commit the full mirror tree.

use chrono::Utc;
use std::collections::HashMap;

use super::api::{
    create_blob, create_commit, create_tree, get_base_commit_sha, get_base_tree, update_ref,
};
use super::config::GithubSyncConfig;
use super::files::{git_blob_sha, RepoFile, MAX_BLOB_BYTES};
use super::SyncResult;

/// Uploaded-blob count after which an additive checkpoint commit is pushed,
/// so a first sync that hits GitHub's content-creation rate limits keeps its
/// progress: the next run finds those blobs in the branch tree and skips them.
pub(super) const CHECKPOINT_BLOBS: usize = 100;

/// Mirror `files` onto `config.branch` as a fast-forward commit, skipped when
/// the tree is unchanged. Files that grew past `MAX_BLOB_BYTES` since
/// collection are appended to `skipped`.
pub(super) async fn upload_mirror(
    client: &reqwest::Client,
    repo_url: &str,
    config: &GithubSyncConfig,
    files: &[RepoFile],
    skipped: &mut Vec<String>,
) -> Result<SyncResult, String> {
    let mut parent = get_base_commit_sha(client, repo_url, &config.branch).await?;
    let (base_tree_sha, base_blobs) = match parent.as_deref() {
        Some(sha) => match get_base_tree(client, repo_url, sha).await? {
            Some((tree_sha, blobs)) => (Some(tree_sha), blobs),
            None => (None, HashMap::new()),
        },
        None => (None, HashMap::new()),
    };

    let mut tree_entries = Vec::with_capacity(files.len());
    let mut checkpoint_entries = Vec::new();
    let mut checkpoint_tree = base_tree_sha.clone();
    let mut checkpointed = false;
    for file in files {
        let source_path = file.source_path.clone();
        let bytes = tauri::async_runtime::spawn_blocking(move || std::fs::read(source_path))
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string())?;
        // The file may have been rewritten since collection (autosave):
        // upload the bytes read now, re-checking only the size limit.
        if bytes.len() as u64 > MAX_BLOB_BYTES {
            skipped.push(file.path.clone());
            continue;
        }
        let local_sha = git_blob_sha(&bytes);
        let blob_sha = if base_blobs.get(&file.path) == Some(&local_sha) {
            local_sha
        } else {
            let sha = create_blob(client, repo_url, &bytes).await?;
            checkpoint_entries.push((file.path.clone(), sha.clone()));
            sha
        };
        tree_entries.push((file.path.clone(), blob_sha));

        if checkpoint_entries.len() >= CHECKPOINT_BLOBS {
            let tree = create_tree(
                client,
                repo_url,
                &checkpoint_entries,
                checkpoint_tree.as_deref(),
            )
            .await?;
            let commit = create_commit(
                client,
                repo_url,
                &format!("{} (partial)", config.commit_message),
                &tree,
                parent.as_deref(),
            )
            .await?;
            update_ref(client, repo_url, &config.branch, &commit, parent.is_some()).await?;
            parent = Some(commit);
            checkpoint_tree = Some(tree);
            checkpoint_entries.clear();
            checkpointed = true;
        }
    }

    let tree_sha = create_tree(client, repo_url, &tree_entries, None).await?;
    let commit_sha = match parent.as_deref() {
        // Nothing changed since the last backup: keep the branch head
        // instead of adding an empty commit on every auto-sync tick.
        Some(head) if !checkpointed && base_tree_sha.as_deref() == Some(tree_sha.as_str()) => {
            head.to_string()
        }
        _ => {
            let commit_sha = create_commit(
                client,
                repo_url,
                &config.commit_message,
                &tree_sha,
                parent.as_deref(),
            )
            .await?;
            update_ref(
                client,
                repo_url,
                &config.branch,
                &commit_sha,
                parent.is_some(),
            )
            .await?;
            commit_sha
        }
    };

    Ok(SyncResult {
        commit_sha,
        files_count: tree_entries.len(),
        synced_at: Utc::now().to_rfc3339(),
        skipped_files: skipped.clone(),
    })
}
