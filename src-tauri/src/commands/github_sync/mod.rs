// Native GitHub sync: mirrors the local workspace (the `.nevoz` export file
// set minus installed plugins) into a GitHub repository via a fast-forward
// commit built through the GitHub REST Git Data API.
// Upload-only (no pull/merge). See `docs` for the `nevo.github-sync` plugin.
//
// Style mirrors `commands::workspace::marketplace` for the GitHub REST calls
// (client construction, header set, JSON parsing, async + spawn_blocking for
// filesystem work).

mod api;
mod config;
mod files;
mod sync;

#[cfg(test)]
mod fake_github;
#[cfg(test)]
mod sync_tests;
#[cfg(test)]
mod tests;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use crate::commands::auth::secure_store::secure_store_get;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};

use api::{check_repo_access, github_client, repo_url};
use config::{load_config, validate_repo};
use files::{collect_workspace_files, snapshot_collected_database, CollectedFiles};
use sync::upload_mirror;

const TOKEN_SECRET_KEY: &str = "nevo.github-sync.token";

/// Managed state holding the background auto-sync task, if one is running.
///
/// Uses a plain `std::sync::Mutex` (not `tokio::sync::Mutex`) because every
/// lock is held only long enough to take/replace the `JoinHandle` and is
/// always dropped before any `.await` point, so there's no risk of blocking
/// the async runtime or holding a non-`Send` guard across an await.
#[derive(Default)]
pub struct GithubSyncState {
    task: std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
}

static ACTIVE_SYNCS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

struct SyncRunGuard {
    workspace_path: String,
}

impl SyncRunGuard {
    fn acquire(workspace_path: &str) -> Result<Self, String> {
        let mut active = ACTIVE_SYNCS
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
            .map_err(|_| "GitHub Sync lock poisoned".to_string())?;
        if !active.insert(workspace_path.to_string()) {
            return Err("A GitHub Sync is already running for this workspace".to_string());
        }
        Ok(Self {
            workspace_path: workspace_path.to_string(),
        })
    }
}

impl Drop for SyncRunGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE_SYNCS
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
        {
            active.remove(&self.workspace_path);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub commit_sha: String,
    pub files_count: usize,
    pub synced_at: String,
    #[serde(default)]
    pub skipped_files: Vec<String>,
}

fn sync_state_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/github-sync-state.json")
}

const SYNC_RESULT_EVENT: &str = "github-sync-result";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResultEvent {
    ok: bool,
    auto: bool,
    commit_sha: Option<String>,
    files_count: Option<usize>,
    skipped_files: Vec<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStateFile {
    last_result: Option<SyncResult>,
    last_error: Option<String>,
    synced_at: String,
}

fn write_sync_state(
    workspace_path: &str,
    result: Option<&SyncResult>,
    error: Option<&str>,
) -> Result<(), String> {
    let state = SyncStateFile {
        last_result: result.cloned(),
        last_error: error.map(str::to_string),
        synced_at: Utc::now().to_rfc3339(),
    };
    let content = serde_json::to_string_pretty(&state).map_err(|error| error.to_string())?;
    write_atomic(&sync_state_path(workspace_path), content.as_bytes())
        .map_err(|error| error.to_string())
}

/// Mirror the workspace's tracked files onto `config.branch` as one
/// fast-forward commit (skipped when the tree is unchanged), then record the
/// outcome in the sync-state file and emit a `github-sync-result` event for
/// the UI. Split out from the `#[tauri::command]` wrapper so the background
/// auto-sync task can call it directly. `auto` marks timer-driven runs so the
/// UI can stay quiet on routine successes.
async fn perform_sync(
    app: AppHandle,
    workspace_path: String,
    auto: bool,
) -> Result<SyncResult, String> {
    let _sync_guard = SyncRunGuard::acquire(&workspace_path)?;
    let config = load_config(&workspace_path)?;
    let token = secure_store_get(app.clone(), TOKEN_SECRET_KEY.to_string())
        .await?
        .ok_or_else(|| "GitHub token is not set".to_string())?;

    let workspace_for_collect = workspace_path.clone();
    let (collected, _database_snapshot) = tauri::async_runtime::spawn_blocking(move || {
        let mut collected = collect_workspace_files(&workspace_for_collect)?;
        let snapshot = snapshot_collected_database(&workspace_for_collect, &mut collected)?;
        Ok::<_, String>((collected, snapshot))
    })
    .await
    .map_err(|error| error.to_string())??;
    let CollectedFiles { files, mut skipped } = collected;

    let client = github_client(&token)?;

    let sync_outcome = upload_mirror(
        &client,
        &repo_url(&config.repo),
        &config,
        &files,
        &mut skipped,
    )
    .await;

    let event = match &sync_outcome {
        Ok(result) => {
            let _ = write_sync_state(&workspace_path, Some(result), None);
            SyncResultEvent {
                ok: true,
                auto,
                commit_sha: Some(result.commit_sha.clone()),
                files_count: Some(result.files_count),
                skipped_files: result.skipped_files.clone(),
                error: None,
            }
        }
        Err(error) => {
            let _ = write_sync_state(&workspace_path, None, Some(error));
            SyncResultEvent {
                ok: false,
                auto,
                commit_sha: None,
                files_count: None,
                skipped_files: skipped.clone(),
                error: Some(error.clone()),
            }
        }
    };
    let _ = app.emit(SYNC_RESULT_EVENT, event);

    sync_outcome
}

#[tauri::command]
pub async fn github_sync_test_connection(app: AppHandle, repo: String) -> Result<bool, String> {
    let repo = repo.trim();
    validate_repo(repo)?;
    let token = secure_store_get(app, TOKEN_SECRET_KEY.to_string())
        .await?
        .ok_or_else(|| "GitHub token is not set".to_string())?;
    let client = github_client(&token)?;
    check_repo_access(&client, &repo_url(repo)).await
}

#[tauri::command]
pub async fn github_sync_now(app: AppHandle, workspace_path: String) -> Result<SyncResult, String> {
    perform_sync(app, workspace_path, false).await
}

/// Start (or restart) a background task that periodically re-runs
/// `perform_sync` every `interval_minutes` minutes. Any previously running
/// auto-sync task is aborted first, so calling this again (e.g. after the
/// user changes the interval) always converges to a single active timer.
#[tauri::command]
pub async fn github_sync_start_auto(
    app: AppHandle,
    state: tauri::State<'_, GithubSyncState>,
    workspace_path: String,
    interval_minutes: u64,
) -> Result<(), String> {
    {
        let mut guard = state
            .task
            .lock()
            .map_err(|_| "GitHub Sync state lock poisoned".to_string())?;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }

    let minutes = interval_minutes.clamp(1, 1440);
    let task_app = app.clone();
    let task_workspace_path = workspace_path.clone();
    let handle = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(minutes * 60));
        // The first tick fires immediately; skip it so enabling auto-sync
        // doesn't trigger a sync right away, only after the first full
        // interval has elapsed.
        ticker.tick().await;
        loop {
            ticker.tick().await;
            let _ = perform_sync(task_app.clone(), task_workspace_path.clone(), true).await;
        }
    });

    let mut guard = state
        .task
        .lock()
        .map_err(|_| "GitHub Sync state lock poisoned".to_string())?;
    *guard = Some(handle);
    Ok(())
}

/// Stop the background auto-sync task, if one is running.
#[tauri::command]
pub fn github_sync_stop_auto(state: tauri::State<'_, GithubSyncState>) -> Result<(), String> {
    let mut guard = state
        .task
        .lock()
        .map_err(|_| "GitHub Sync state lock poisoned".to_string())?;
    if let Some(handle) = guard.take() {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn github_sync_get_status(workspace_path: String) -> Result<serde_json::Value, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)
        .map(|path| path.to_string_lossy().into_owned())?;
    let path = sync_state_path(&workspace_path);
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str::<serde_json::Value>(&content).map_err(|error| error.to_string())
}
