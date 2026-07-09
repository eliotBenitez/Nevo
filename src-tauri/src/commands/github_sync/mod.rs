// Native GitHub sync: mirrors the local workspace (notes, assets, boards,
// snapshots, and workspace/settings JSON) into a GitHub repository via a
// single force-pushed commit built through the GitHub REST Git Data API.
// Upload-only (no pull/merge). See `docs` for the `nevo.github-sync` plugin.
//
// Style mirrors `commands::workspace::marketplace` for the GitHub REST calls
// (client construction, header set, JSON parsing, async + spawn_blocking for
// filesystem work).

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use crate::commands::auth::secure_store_get;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};

const PLUGIN_ID: &str = "nevo.github-sync";
const TOKEN_SECRET_KEY: &str = "nevo.github-sync.token";
const GITHUB_API: &str = "https://api.github.com";
const USER_AGENT: &str = "Nevo";

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

#[derive(Debug, Clone, PartialEq, Eq)]
struct GithubSyncConfig {
    repo: String,
    branch: String,
    commit_message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RepoFile {
    path: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub commit_sha: String,
    pub files_count: usize,
    pub synced_at: String,
}

#[derive(Debug, Deserialize)]
struct GitRefResponse {
    object: GitRefObject,
}

#[derive(Debug, Deserialize)]
struct GitRefObject {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitBlobResponse {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitTreeResponse {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitCommitResponse {
    sha: String,
}

fn settings_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/settings.json")
}

fn sync_state_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/github-sync-state.json")
}

fn load_config(workspace_path: &str) -> Result<GithubSyncConfig, String> {
    let workspace_path =
        normalize_workspace_path(workspace_path).map(|path| path.to_string_lossy().into_owned())?;
    let path = settings_path(&workspace_path);
    if !path.exists() {
        return Err("GitHub Sync is not configured".to_string());
    }

    let content = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let raw =
        serde_json::from_str::<serde_json::Value>(&content).map_err(|error| error.to_string())?;

    let plugin_settings = raw
        .get("pluginSettings")
        .and_then(|value| value.get(PLUGIN_ID))
        .and_then(|value| value.as_object())
        .ok_or_else(|| "GitHub Sync is not configured".to_string())?;

    let repo = plugin_settings
        .get("repo")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "GitHub Sync repository is not configured".to_string())?
        .to_string();

    let branch = plugin_settings
        .get("branch")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("main")
        .to_string();

    let commit_message = plugin_settings
        .get("commitMessage")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Nevo backup")
        .to_string();

    Ok(GithubSyncConfig {
        repo,
        branch,
        commit_message,
    })
}

/// Walk `dir` recursively and push every file found (skipping subdirectories
/// entries only, no filtering) as a `RepoFile` with a path relative to
/// `workspace_root`, using forward slashes regardless of platform.
fn collect_dir_recursive(
    workspace_root: &Path,
    dir: &Path,
    files: &mut Vec<RepoFile>,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_dir_recursive(workspace_root, &path, files)?;
        } else if path.is_file() {
            push_file(workspace_root, &path, files)?;
        }
    }
    Ok(())
}

fn push_file(workspace_root: &Path, path: &Path, files: &mut Vec<RepoFile>) -> Result<(), String> {
    let relative = path
        .strip_prefix(workspace_root)
        .map_err(|error| error.to_string())?;
    let relative_str = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    files.push(RepoFile {
        path: relative_str,
        bytes,
    });
    Ok(())
}

fn collect_workspace_files(workspace_path: &str) -> Result<Vec<RepoFile>, String> {
    let root = Path::new(workspace_path);
    let mut files = Vec::new();

    let notes_dir = root.join("notes");
    if notes_dir.exists() {
        for entry in std::fs::read_dir(&notes_dir).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("nevo") {
                push_file(root, &path, &mut files)?;
            }
        }
    }

    for relative in [".nevo/workspace.json", ".nevo/settings.json"] {
        let path = root.join(relative);
        if path.is_file() {
            push_file(root, &path, &mut files)?;
        }
    }

    for relative in [".nevo/assets", ".nevo/boards", ".nevo/snapshots"] {
        collect_dir_recursive(root, &root.join(relative), &mut files)?;
    }

    Ok(files)
}

fn github_client(token: &str) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|error| error.to_string())?,
    );
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static(USER_AGENT),
    );
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(
        "X-GitHub-Api-Version",
        reqwest::header::HeaderValue::from_static("2022-11-28"),
    );

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|error| error.to_string())
}

async fn github_error(response: reqwest::Response, url: &str) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    format!("GitHub API {} at {}: {}", status, url, body)
}

async fn get_base_commit_sha(
    client: &reqwest::Client,
    repo: &str,
    branch: &str,
) -> Result<Option<String>, String> {
    let url = format!("{}/repos/{}/git/ref/heads/{}", GITHUB_API, repo, branch);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().is_success() {
        let payload = response
            .json::<GitRefResponse>()
            .await
            .map_err(|error| error.to_string())?;
        Ok(Some(payload.object.sha))
    } else if response.status().as_u16() == 404 || response.status().as_u16() == 409 {
        Ok(None)
    } else {
        Err(github_error(response, &url).await)
    }
}

async fn create_blob(client: &reqwest::Client, repo: &str, bytes: &[u8]) -> Result<String, String> {
    let url = format!("{}/repos/{}/git/blobs", GITHUB_API, repo);
    let body = serde_json::json!({
        "content": STANDARD.encode(bytes),
        "encoding": "base64",
    });
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(github_error(response, &url).await);
    }
    let payload = response
        .json::<GitBlobResponse>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(payload.sha)
}

async fn create_tree(
    client: &reqwest::Client,
    repo: &str,
    entries: &[(String, String)],
) -> Result<String, String> {
    let url = format!("{}/repos/{}/git/trees", GITHUB_API, repo);
    let tree = entries
        .iter()
        .map(|(path, blob_sha)| {
            serde_json::json!({
                "path": path,
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha,
            })
        })
        .collect::<Vec<_>>();
    let body = serde_json::json!({ "tree": tree });
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(github_error(response, &url).await);
    }
    let payload = response
        .json::<GitTreeResponse>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(payload.sha)
}

async fn create_commit(
    client: &reqwest::Client,
    repo: &str,
    message: &str,
    tree_sha: &str,
    parent_sha: Option<&str>,
) -> Result<String, String> {
    let url = format!("{}/repos/{}/git/commits", GITHUB_API, repo);
    let parents = parent_sha.map(|sha| vec![sha]).unwrap_or_default();
    let body = serde_json::json!({
        "message": message,
        "tree": tree_sha,
        "parents": parents,
    });
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(github_error(response, &url).await);
    }
    let payload = response
        .json::<GitCommitResponse>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(payload.sha)
}

async fn update_ref(
    client: &reqwest::Client,
    repo: &str,
    branch: &str,
    commit_sha: &str,
    had_base: bool,
) -> Result<(), String> {
    if had_base {
        let url = format!("{}/repos/{}/git/refs/heads/{}", GITHUB_API, repo, branch);
        let body = serde_json::json!({ "sha": commit_sha, "force": true });
        let response = client
            .patch(&url)
            .json(&body)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(github_error(response, &url).await);
        }
    } else {
        let url = format!("{}/repos/{}/git/refs", GITHUB_API, repo);
        let body = serde_json::json!({
            "ref": format!("refs/heads/{}", branch),
            "sha": commit_sha,
        });
        let response = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(github_error(response, &url).await);
        }
    }
    Ok(())
}

const SYNC_RESULT_EVENT: &str = "github-sync-result";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResultEvent {
    ok: bool,
    auto: bool,
    commit_sha: Option<String>,
    files_count: Option<usize>,
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

/// Build one force-pushed commit that mirrors the workspace's tracked files
/// onto `config.branch`, then record the outcome in the sync-state file and
/// emit a `github-sync-result` event for the UI. Split out from the
/// `#[tauri::command]` wrapper so the background auto-sync task can call it
/// directly. `auto` marks timer-driven runs so the UI can stay quiet on
/// routine successes.
async fn perform_sync(
    app: AppHandle,
    workspace_path: String,
    auto: bool,
) -> Result<SyncResult, String> {
    let config = load_config(&workspace_path)?;
    let token = secure_store_get(app.clone(), TOKEN_SECRET_KEY.to_string())?
        .ok_or_else(|| "GitHub token is not set".to_string())?;

    let workspace_for_collect = workspace_path.clone();
    let files = tauri::async_runtime::spawn_blocking(move || {
        collect_workspace_files(&workspace_for_collect)
    })
    .await
    .map_err(|error| error.to_string())??;

    let client = github_client(&token)?;

    let sync_outcome = async {
        let base_commit = get_base_commit_sha(&client, &config.repo, &config.branch).await?;

        let mut tree_entries = Vec::with_capacity(files.len());
        for file in &files {
            let blob_sha = create_blob(&client, &config.repo, &file.bytes).await?;
            tree_entries.push((file.path.clone(), blob_sha));
        }

        let tree_sha = create_tree(&client, &config.repo, &tree_entries).await?;
        let commit_sha = create_commit(
            &client,
            &config.repo,
            &config.commit_message,
            &tree_sha,
            base_commit.as_deref(),
        )
        .await?;
        update_ref(
            &client,
            &config.repo,
            &config.branch,
            &commit_sha,
            base_commit.is_some(),
        )
        .await?;

        Ok::<SyncResult, String>(SyncResult {
            commit_sha,
            files_count: files.len(),
            synced_at: Utc::now().to_rfc3339(),
        })
    }
    .await;

    let event = match &sync_outcome {
        Ok(result) => {
            let _ = write_sync_state(&workspace_path, Some(result), None);
            SyncResultEvent {
                ok: true,
                auto,
                commit_sha: Some(result.commit_sha.clone()),
                files_count: Some(result.files_count),
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
                error: Some(error.clone()),
            }
        }
    };
    let _ = app.emit(SYNC_RESULT_EVENT, event);

    sync_outcome
}

#[tauri::command]
pub async fn github_sync_test_connection(app: AppHandle, repo: String) -> Result<bool, String> {
    let token = secure_store_get(app, TOKEN_SECRET_KEY.to_string())?
        .ok_or_else(|| "GitHub token is not set".to_string())?;
    let client = github_client(&token)?;
    let url = format!("{}/repos/{}", GITHUB_API, repo);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status().is_success() {
        Ok(true)
    } else {
        Err(github_error(response, &url).await)
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "nevo-github-sync-test-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(path.join(".nevo")).expect("workspace dir");
        std::fs::create_dir_all(path.join("notes")).expect("notes dir");
        path
    }

    #[test]
    fn collect_workspace_files_includes_expected_and_excludes_others() {
        let workspace = workspace("collect");
        let root = &workspace;

        std::fs::write(root.join("notes/note-a.nevo"), b"note-a").expect("write note");
        std::fs::write(root.join("notes/ignored.txt"), b"nope").expect("write ignored");

        std::fs::write(root.join(".nevo/workspace.json"), b"{}").expect("workspace.json");
        std::fs::write(root.join(".nevo/settings.json"), b"{}").expect("settings.json");

        std::fs::create_dir_all(root.join(".nevo/assets")).expect("assets dir");
        std::fs::write(root.join(".nevo/assets/pic.png"), b"png-bytes").expect("asset");

        std::fs::create_dir_all(root.join(".nevo/boards")).expect("boards dir");
        std::fs::write(root.join(".nevo/boards/board-1.json"), b"{}").expect("board");

        std::fs::create_dir_all(root.join(".nevo/snapshots/note-a")).expect("snapshots dir");
        std::fs::write(root.join(".nevo/snapshots/note-a/2024.json"), b"{}").expect("snapshot");

        // Excluded: plugins, collab, secrets.
        std::fs::create_dir_all(root.join(".nevo/plugins/example")).expect("plugins dir");
        std::fs::write(root.join(".nevo/plugins/example/manifest.json"), b"{}").expect("manifest");
        std::fs::create_dir_all(root.join(".nevo/collab")).expect("collab dir");
        std::fs::write(root.join(".nevo/collab/state.bin"), b"bin").expect("collab state");
        std::fs::write(root.join(".nevo/secrets.json"), b"{}").expect("secrets");

        let files = collect_workspace_files(&root.to_string_lossy()).expect("collect files");
        let mut paths = files
            .iter()
            .map(|file| file.path.clone())
            .collect::<Vec<_>>();
        paths.sort();

        assert_eq!(
            paths,
            vec![
                ".nevo/assets/pic.png".to_string(),
                ".nevo/boards/board-1.json".to_string(),
                ".nevo/settings.json".to_string(),
                ".nevo/snapshots/note-a/2024.json".to_string(),
                ".nevo/workspace.json".to_string(),
                "notes/note-a.nevo".to_string(),
            ]
        );
        assert!(!paths.iter().any(|path| path.contains("plugins")));
        assert!(!paths.iter().any(|path| path.contains("collab")));
        assert!(!paths.iter().any(|path| path.contains("secrets")));
        assert!(!paths.iter().any(|path| path.contains("ignored.txt")));

        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn load_config_parses_repo_branch_and_commit_message_with_defaults() {
        let workspace = workspace("config");
        std::fs::write(
            workspace.join(".nevo/settings.json"),
            serde_json::to_vec(&serde_json::json!({
                "pluginSettings": {
                    PLUGIN_ID: {
                        "repo": "owner/name",
                        "branch": "release",
                        "commitMessage": "Custom message"
                    }
                }
            }))
            .expect("serialize settings"),
        )
        .expect("write settings");

        let config = load_config(&workspace.to_string_lossy()).expect("load config");
        assert_eq!(config.repo, "owner/name");
        assert_eq!(config.branch, "release");
        assert_eq!(config.commit_message, "Custom message");

        std::fs::remove_dir_all(&workspace).expect("cleanup");
    }

    #[test]
    fn load_config_falls_back_to_defaults_and_rejects_missing_repo() {
        let defaults_workspace = workspace("config-defaults");
        std::fs::write(
            defaults_workspace.join(".nevo/settings.json"),
            serde_json::to_vec(&serde_json::json!({
                "pluginSettings": {
                    PLUGIN_ID: { "repo": "owner/name" }
                }
            }))
            .expect("serialize settings"),
        )
        .expect("write settings");

        let config = load_config(&defaults_workspace.to_string_lossy()).expect("load config");
        assert_eq!(config.branch, "main");
        assert_eq!(config.commit_message, "Nevo backup");

        let no_repo_workspace = workspace("config-no-repo");
        std::fs::write(
            no_repo_workspace.join(".nevo/settings.json"),
            serde_json::to_vec(&serde_json::json!({
                "pluginSettings": { PLUGIN_ID: {} }
            }))
            .expect("serialize settings"),
        )
        .expect("write settings");
        let error = load_config(&no_repo_workspace.to_string_lossy()).expect_err("missing repo");
        assert!(error.contains("repository"));

        let unconfigured_workspace = workspace("config-unconfigured");
        let error = load_config(&unconfigured_workspace.to_string_lossy())
            .expect_err("missing settings file");
        assert!(error.contains("not configured"));

        std::fs::remove_dir_all(&defaults_workspace).expect("cleanup");
        std::fs::remove_dir_all(&no_repo_workspace).expect("cleanup");
        std::fs::remove_dir_all(&unconfigured_workspace).expect("cleanup");
    }
}
