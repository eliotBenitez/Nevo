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
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::commands::auth::secure_store_get;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};

const PLUGIN_ID: &str = "nevo.github-sync";
const TOKEN_SECRET_KEY: &str = "nevo.github-sync.token";
const GITHUB_API: &str = "https://api.github.com";
const USER_AGENT: &str = "Nevo";

/// Files larger than this are skipped instead of uploaded. The GitHub Git Data
/// blob API (`POST /git/blobs`) returns a `504 Gateway Timeout` well before its
/// hard 40 MiB limit, and base64 encoding inflates the payload by ~33%, so a
/// single oversized asset would otherwise abort the whole sync.
const MAX_BLOB_BYTES: u64 = 25 * 1024 * 1024;
const MAX_SYNC_BYTES: u64 = 512 * 1024 * 1024;

/// Per-request timeout for GitHub API calls, so a stalled connection fails fast
/// (and is then retried) instead of hanging the sync indefinitely.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// How many times a transient GitHub failure (network error or 429/5xx) is
/// retried before giving up.
const MAX_REQUEST_ATTEMPTS: u32 = 4;

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
    source_path: PathBuf,
    size: u64,
}

/// Outcome of walking the workspace: the files to upload plus the relative
/// paths of any files skipped because they exceed `MAX_BLOB_BYTES`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct CollectedFiles {
    files: Vec<RepoFile>,
    skipped: Vec<String>,
    total_bytes: u64,
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
    collected: &mut CollectedFiles,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_dir_recursive(workspace_root, &path, collected)?;
        } else if path.is_file() {
            push_file(workspace_root, &path, collected)?;
        }
    }
    Ok(())
}

fn relative_path(workspace_root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(workspace_root)
        .map_err(|error| error.to_string())?;
    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/"))
}

fn push_file(
    workspace_root: &Path,
    path: &Path,
    collected: &mut CollectedFiles,
) -> Result<(), String> {
    let relative_str = relative_path(workspace_root, path)?;
    let size = std::fs::metadata(path)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_BLOB_BYTES {
        collected.skipped.push(relative_str);
        return Ok(());
    }
    collected.total_bytes = collected.total_bytes.saturating_add(size);
    if collected.total_bytes > MAX_SYNC_BYTES {
        return Err("Workspace files exceed the 512 MiB GitHub Sync limit".to_string());
    }
    collected.files.push(RepoFile {
        path: relative_str,
        source_path: path.to_path_buf(),
        size,
    });
    Ok(())
}

fn collect_workspace_files(workspace_path: &str) -> Result<CollectedFiles, String> {
    let root = Path::new(workspace_path);
    let mut collected = CollectedFiles::default();

    let notes_dir = root.join("notes");
    if notes_dir.exists() {
        for entry in std::fs::read_dir(&notes_dir).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("nevo") {
                push_file(root, &path, &mut collected)?;
            }
        }
    }

    // Fold the database WAL into the main file so its committed rows are
    // captured by the file-level upload below. Best-effort: a checkpoint
    // failure must not abort the sync of everything else.
    let _ = crate::commands::database::checkpoint_database(root);

    for relative in [
        ".nevo/workspace.json",
        ".nevo/settings.json",
        ".nevo/databases.sqlite",
    ] {
        let path = root.join(relative);
        if path.is_file() {
            push_file(root, &path, &mut collected)?;
        }
    }

    for relative in [".nevo/assets", ".nevo/boards", ".nevo/snapshots"] {
        collect_dir_recursive(root, &root.join(relative), &mut collected)?;
    }

    Ok(collected)
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
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())
}

/// Compute the git blob object id for `bytes`: SHA-1 over the git blob header
/// (`blob <len>\0`) followed by the raw content. This equals the `sha` GitHub
/// reports for a blob in a tree, so a matching id means the file is already
/// stored in the repo and does not need re-uploading.
fn git_blob_sha(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", bytes.len()).as_bytes());
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

async fn github_error(response: reqwest::Response, url: &str) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    format!("GitHub API {} at {}: {}", status, url, body)
}

/// Transient GitHub responses worth retrying: rate limiting and gateway/backend
/// errors (a large-blob `POST /git/blobs` typically surfaces as `504`).
fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504)
}

/// Exponential backoff (500ms, 1s, 2s, …) capped at 4s.
fn backoff_delay(attempt: u32) -> Duration {
    let millis = 500u64.saturating_mul(1u64 << (attempt - 1).min(3));
    Duration::from_millis(millis.min(4000))
}

/// Longest we'll wait out a GitHub rate limit before giving up and surfacing
/// the error. Secondary limits use short `Retry-After` windows we can honor;
/// a primary limit whose reset is further away fails fast with a clear message.
const RATE_LIMIT_MAX_WAIT: Duration = Duration::from_secs(60);

fn header_u64(headers: &reqwest::header::HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.trim().parse::<u64>().ok()
}

/// If `status`/`headers` indicate a GitHub rate limit we can wait out, return
/// the delay to sleep before retrying (capped at `RATE_LIMIT_MAX_WAIT`).
/// Honors `Retry-After` (secondary limit) first, then `X-RateLimit-Remaining:
/// 0` + `X-RateLimit-Reset` (primary limit). Returns `None` when it isn't a
/// waitable rate limit (e.g. a permission 403, or a reset too far away).
fn rate_limit_delay(
    status: reqwest::StatusCode,
    headers: &reqwest::header::HeaderMap,
) -> Option<Duration> {
    if !matches!(status.as_u16(), 403 | 429) {
        return None;
    }
    if let Some(seconds) = header_u64(headers, "retry-after") {
        return Some(Duration::from_secs(seconds).min(RATE_LIMIT_MAX_WAIT));
    }
    if header_u64(headers, "x-ratelimit-remaining") == Some(0) {
        let reset = header_u64(headers, "x-ratelimit-reset")?;
        let now = Utc::now().timestamp().max(0) as u64;
        let wait = reset.saturating_sub(now);
        if wait <= RATE_LIMIT_MAX_WAIT.as_secs() {
            return Some(Duration::from_secs(wait));
        }
    }
    None
}

/// Send a request, retrying transient network errors (timeout/connect) and
/// retryable status codes with exponential backoff. The builder must be
/// cloneable, which every GitHub Git Data call here (JSON or bodyless) is.
async fn send_with_retry(builder: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
    let mut attempt = 0;
    loop {
        attempt += 1;
        let request = builder
            .try_clone()
            .ok_or_else(|| "GitHub request is not retryable".to_string())?;
        match request.send().await {
            Ok(response) => {
                if attempt < MAX_REQUEST_ATTEMPTS {
                    if let Some(delay) = rate_limit_delay(response.status(), response.headers()) {
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    if is_retryable_status(response.status()) {
                        tokio::time::sleep(backoff_delay(attempt)).await;
                        continue;
                    }
                }
                return Ok(response);
            }
            Err(error) => {
                if attempt < MAX_REQUEST_ATTEMPTS && (error.is_timeout() || error.is_connect()) {
                    tokio::time::sleep(backoff_delay(attempt)).await;
                    continue;
                }
                return Err(error.to_string());
            }
        }
    }
}

async fn get_base_commit_sha(
    client: &reqwest::Client,
    repo: &str,
    branch: &str,
) -> Result<Option<String>, String> {
    let url = format!("{}/repos/{}/git/ref/heads/{}", GITHUB_API, repo, branch);
    let response = send_with_retry(client.get(&url)).await?;

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

#[derive(Debug, Deserialize)]
struct GitCommitDetail {
    tree: GitTreeRef,
}

#[derive(Debug, Deserialize)]
struct GitTreeRef {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitTreeListResponse {
    tree: Vec<GitTreeListEntry>,
}

#[derive(Debug, Deserialize)]
struct GitTreeListEntry {
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: String,
}

/// Fetch the recursive `path -> blob sha` map for `commit_sha`'s tree, so an
/// unchanged file can reuse its existing blob instead of re-uploading it.
/// Returns an empty map if the commit/tree is missing (404/409): a missing
/// path simply falls back to a normal upload, which is always correct. A
/// truncated tree is likewise harmless — paths not in the map are re-uploaded.
async fn get_base_tree_map(
    client: &reqwest::Client,
    repo: &str,
    commit_sha: &str,
) -> Result<HashMap<String, String>, String> {
    let commit_url = format!("{}/repos/{}/git/commits/{}", GITHUB_API, repo, commit_sha);
    let response = send_with_retry(client.get(&commit_url)).await?;
    if !response.status().is_success() {
        if matches!(response.status().as_u16(), 404 | 409) {
            return Ok(HashMap::new());
        }
        return Err(github_error(response, &commit_url).await);
    }
    let commit = response
        .json::<GitCommitDetail>()
        .await
        .map_err(|error| error.to_string())?;

    let tree_url = format!(
        "{}/repos/{}/git/trees/{}?recursive=1",
        GITHUB_API, repo, commit.tree.sha
    );
    let response = send_with_retry(client.get(&tree_url)).await?;
    if !response.status().is_success() {
        if matches!(response.status().as_u16(), 404 | 409) {
            return Ok(HashMap::new());
        }
        return Err(github_error(response, &tree_url).await);
    }
    let tree = response
        .json::<GitTreeListResponse>()
        .await
        .map_err(|error| error.to_string())?;

    Ok(tree
        .tree
        .into_iter()
        .filter(|entry| entry.entry_type == "blob")
        .map(|entry| (entry.path, entry.sha))
        .collect())
}

async fn create_blob(client: &reqwest::Client, repo: &str, bytes: &[u8]) -> Result<String, String> {
    let url = format!("{}/repos/{}/git/blobs", GITHUB_API, repo);
    let body = serde_json::json!({
        "content": STANDARD.encode(bytes),
        "encoding": "base64",
    });
    let response = send_with_retry(client.post(&url).json(&body)).await?;
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
    let response = send_with_retry(client.post(&url).json(&body)).await?;
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
    let response = send_with_retry(client.post(&url).json(&body)).await?;
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
        let response = send_with_retry(client.patch(&url).json(&body)).await?;
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
    let _sync_guard = SyncRunGuard::acquire(&workspace_path)?;
    let config = load_config(&workspace_path)?;
    let token = secure_store_get(app.clone(), TOKEN_SECRET_KEY.to_string())?
        .ok_or_else(|| "GitHub token is not set".to_string())?;

    let workspace_for_collect = workspace_path.clone();
    let collected = tauri::async_runtime::spawn_blocking(move || {
        collect_workspace_files(&workspace_for_collect)
    })
    .await
    .map_err(|error| error.to_string())??;
    let CollectedFiles {
        files,
        skipped,
        total_bytes: _,
    } = collected;

    let client = github_client(&token)?;

    let sync_outcome = async {
        let base_commit = get_base_commit_sha(&client, &config.repo, &config.branch).await?;
        let base_tree = match base_commit.as_deref() {
            Some(sha) => get_base_tree_map(&client, &config.repo, sha).await?,
            None => HashMap::new(),
        };

        let mut tree_entries = Vec::with_capacity(files.len());
        for file in &files {
            let source_path = file.source_path.clone();
            let expected_size = file.size;
            let bytes = tauri::async_runtime::spawn_blocking(move || std::fs::read(source_path))
                .await
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())?;
            if bytes.len() as u64 != expected_size || bytes.len() as u64 > MAX_BLOB_BYTES {
                return Err(format!("Workspace file changed during sync: {}", file.path));
            }
            let local_sha = git_blob_sha(&bytes);
            let blob_sha = match base_tree.get(&file.path) {
                Some(existing) if existing == &local_sha => local_sha,
                _ => create_blob(&client, &config.repo, &bytes).await?,
            };
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
            skipped_files: skipped.clone(),
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
    let token = secure_store_get(app, TOKEN_SECRET_KEY.to_string())?
        .ok_or_else(|| "GitHub token is not set".to_string())?;
    let client = github_client(&token)?;
    let url = format!("{}/repos/{}", GITHUB_API, repo);
    let response = send_with_retry(client.get(&url)).await?;
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
        std::fs::write(root.join(".nevo/databases.sqlite"), b"sqlite").expect("databases.sqlite");

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

        let collected = collect_workspace_files(&root.to_string_lossy()).expect("collect files");
        assert!(collected.skipped.is_empty());
        let mut paths = collected
            .files
            .iter()
            .map(|file| file.path.clone())
            .collect::<Vec<_>>();
        paths.sort();

        assert_eq!(
            paths,
            vec![
                ".nevo/assets/pic.png".to_string(),
                ".nevo/boards/board-1.json".to_string(),
                ".nevo/databases.sqlite".to_string(),
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
    fn collect_workspace_files_skips_files_over_the_blob_limit() {
        let workspace = workspace("size-guard");
        let root = &workspace;

        std::fs::create_dir_all(root.join(".nevo/assets")).expect("assets dir");
        std::fs::write(root.join(".nevo/assets/small.png"), b"tiny").expect("small asset");
        let oversized = vec![0u8; (MAX_BLOB_BYTES + 1) as usize];
        std::fs::write(root.join(".nevo/assets/huge.bin"), &oversized).expect("huge asset");

        let collected = collect_workspace_files(&root.to_string_lossy()).expect("collect files");
        let kept = collected
            .files
            .iter()
            .map(|file| file.path.clone())
            .collect::<Vec<_>>();

        assert!(kept.contains(&".nevo/assets/small.png".to_string()));
        assert!(!kept.iter().any(|path| path.contains("huge.bin")));
        assert_eq!(collected.skipped, vec![".nevo/assets/huge.bin".to_string()]);

        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn backoff_delay_grows_and_caps() {
        assert_eq!(backoff_delay(1), Duration::from_millis(500));
        assert_eq!(backoff_delay(2), Duration::from_millis(1000));
        assert_eq!(backoff_delay(3), Duration::from_millis(2000));
        assert_eq!(backoff_delay(4), Duration::from_millis(4000));
        assert_eq!(backoff_delay(10), Duration::from_millis(4000));
    }

    #[test]
    fn retryable_status_covers_gateway_and_rate_limit() {
        use reqwest::StatusCode;
        assert!(is_retryable_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_retryable_status(StatusCode::BAD_GATEWAY));
        assert!(is_retryable_status(StatusCode::SERVICE_UNAVAILABLE));
        assert!(is_retryable_status(StatusCode::GATEWAY_TIMEOUT));
        assert!(!is_retryable_status(StatusCode::NOT_FOUND));
        assert!(!is_retryable_status(StatusCode::UNPROCESSABLE_ENTITY));
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

    #[test]
    fn git_blob_sha_matches_git() {
        assert_eq!(
            git_blob_sha(b""),
            "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
        );
        assert_eq!(
            git_blob_sha(b"hello\n"),
            "ce013625030ba8dba906f756967f9e9ca394464a"
        );
    }

    #[test]
    fn rate_limit_delay_honors_retry_after() {
        use reqwest::header::{HeaderMap, HeaderValue};
        use reqwest::StatusCode;

        let mut headers = HeaderMap::new();
        headers.insert("retry-after", HeaderValue::from_static("30"));
        assert_eq!(
            rate_limit_delay(StatusCode::FORBIDDEN, &headers),
            Some(Duration::from_secs(30))
        );

        let mut headers = HeaderMap::new();
        headers.insert("retry-after", HeaderValue::from_static("600"));
        assert_eq!(
            rate_limit_delay(StatusCode::FORBIDDEN, &headers),
            Some(Duration::from_secs(60))
        );
    }

    #[test]
    fn rate_limit_delay_ignores_non_rate_limit() {
        use reqwest::header::{HeaderMap, HeaderValue};
        use reqwest::StatusCode;

        let mut headers = HeaderMap::new();
        headers.insert("retry-after", HeaderValue::from_static("30"));
        assert_eq!(rate_limit_delay(StatusCode::NOT_FOUND, &headers), None);

        let headers = HeaderMap::new();
        assert_eq!(rate_limit_delay(StatusCode::FORBIDDEN, &headers), None);

        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-remaining", HeaderValue::from_static("5"));
        assert_eq!(rate_limit_delay(StatusCode::FORBIDDEN, &headers), None);
    }
}
