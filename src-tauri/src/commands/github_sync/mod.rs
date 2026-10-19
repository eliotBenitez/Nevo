// Native GitHub sync: mirrors the local workspace (the `.nevoz` export file
// set minus installed plugins) into a GitHub repository via a fast-forward
// commit built through the GitHub REST Git Data API.
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

use crate::commands::auth::secure_store::secure_store_get;
use crate::commands::database::snapshot_database;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use crate::commands::workspace_transfer::collect::collect_full_workspace_files;

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
}

/// Outcome of walking the workspace: the files to upload plus the relative
/// paths of any files skipped because they exceed `MAX_BLOB_BYTES`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct CollectedFiles {
    files: Vec<RepoFile>,
    skipped: Vec<String>,
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

    validate_repo(&repo)?;
    validate_branch(&branch)?;

    Ok(GithubSyncConfig {
        repo,
        branch,
        commit_message,
    })
}

/// Directories the full-workspace export walks but a GitHub backup leaves
/// out: installed plugin code is reinstallable and can be large.
const EXCLUDED_PREFIXES: &[&str] = &[".nevo/plugins/"];

const DATABASE_PATH: &str = ".nevo/databases.sqlite";

/// Reuses the `.nevoz` export collector (which skips symlinks, so nothing
/// outside the workspace can be uploaded) and applies the GitHub size limits.
fn collect_workspace_files(workspace_path: &str) -> Result<CollectedFiles, String> {
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
struct DatabaseSnapshot(PathBuf);

impl Drop for DatabaseSnapshot {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Points the collected database entry at a consistent snapshot instead of
/// the live file, which the app may be writing while it is uploaded.
fn snapshot_collected_database(
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

fn is_repo_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// `repo` is spliced into API URL paths, so only `owner/name` is accepted.
fn validate_repo(repo: &str) -> Result<(), String> {
    let mut parts = repo.split('/');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(owner), Some(name), None) if is_repo_segment(owner) && is_repo_segment(name) => {
            Ok(())
        }
        _ => Err(format!(
            "Invalid GitHub repository \"{}\": expected owner/name",
            repo
        )),
    }
}

/// shortcut: stricter than git's ref-name rules (ASCII letters, digits, `-`,
/// `_`, `.` and `/` only) so the branch is safe in a URL path unescaped;
/// relax with percent-encoding if users need other characters.
fn validate_branch(branch: &str) -> Result<(), String> {
    let valid = !branch.contains("..")
        && branch.split('/').all(|segment| {
            !segment.is_empty()
                && !segment.starts_with('.')
                && !segment.ends_with(".lock")
                && segment
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        });
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid branch name \"{}\"", branch))
    }
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
    } else if response.status().as_u16() == 404 {
        Ok(None)
    } else if response.status().as_u16() == 409 {
        bootstrap_empty_repo(client, repo, branch).await.map(Some)
    } else {
        Err(github_error(response, &url).await)
    }
}

/// Placeholder committed through the Contents API to give an empty repository
/// its first commit: the Git Data API answers `409 Git Repository is empty`
/// until one exists. The mirror tree committed right after does not contain
/// it, so it disappears from the branch again.
const BOOTSTRAP_PATH: &str = ".nevo-github-sync";

#[derive(Debug, Deserialize)]
struct ContentsResponse {
    commit: GitCommitResponse,
}

async fn bootstrap_empty_repo(
    client: &reqwest::Client,
    repo: &str,
    branch: &str,
) -> Result<String, String> {
    let url = format!("{}/repos/{}/contents/{}", GITHUB_API, repo, BOOTSTRAP_PATH);
    let body = serde_json::json!({
        "message": "Initialize Nevo backup",
        "content": STANDARD.encode(b"Nevo GitHub Sync\n"),
        "branch": branch,
    });
    // Not retried: a repeat of a PUT that already landed fails with 422.
    let response = client
        .put(&url)
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(github_error(response, &url).await);
    }
    let payload = response
        .json::<ContentsResponse>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(payload.commit.sha)
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

/// `commit_sha`'s tree id plus its recursive `path -> blob sha` map, so an
/// unchanged file can reuse its existing blob instead of re-uploading it.
/// Returns `None` if the commit is missing and an empty map if the tree is
/// (404/409): a missing path simply falls back to a normal upload, which is
/// always correct. A truncated tree is likewise harmless — paths not in the
/// map are re-uploaded.
async fn get_base_tree(
    client: &reqwest::Client,
    repo: &str,
    commit_sha: &str,
) -> Result<Option<(String, HashMap<String, String>)>, String> {
    let commit_url = format!("{}/repos/{}/git/commits/{}", GITHUB_API, repo, commit_sha);
    let response = send_with_retry(client.get(&commit_url)).await?;
    if !response.status().is_success() {
        if matches!(response.status().as_u16(), 404 | 409) {
            return Ok(None);
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
            return Ok(Some((commit.tree.sha, HashMap::new())));
        }
        return Err(github_error(response, &tree_url).await);
    }
    let tree = response
        .json::<GitTreeListResponse>()
        .await
        .map_err(|error| error.to_string())?;

    let blobs = tree
        .tree
        .into_iter()
        .filter(|entry| entry.entry_type == "blob")
        .map(|entry| (entry.path, entry.sha))
        .collect();
    Ok(Some((commit.tree.sha, blobs)))
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
    base_tree: Option<&str>,
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
    let mut body = serde_json::json!({ "tree": tree });
    if let Some(base_tree) = base_tree {
        body["base_tree"] = serde_json::Value::from(base_tree);
    }
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
        // Every new commit has the current head as parent, so this is a fast
        // forward; refusing a force push keeps commits pushed concurrently.
        let body = serde_json::json!({ "sha": commit_sha, "force": false });
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

/// Uploaded-blob count after which an additive checkpoint commit is pushed,
/// so a first sync that hits GitHub's content-creation rate limits keeps its
/// progress: the next run finds those blobs in the branch tree and skips them.
const CHECKPOINT_BLOBS: usize = 100;

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

    let sync_outcome = async {
        let mut parent = get_base_commit_sha(&client, &config.repo, &config.branch).await?;
        let (base_tree_sha, base_blobs) = match parent.as_deref() {
            Some(sha) => match get_base_tree(&client, &config.repo, sha).await? {
                Some((tree_sha, blobs)) => (Some(tree_sha), blobs),
                None => (None, HashMap::new()),
            },
            None => (None, HashMap::new()),
        };

        let mut tree_entries = Vec::with_capacity(files.len());
        let mut checkpoint_entries = Vec::new();
        let mut checkpoint_tree = base_tree_sha.clone();
        let mut checkpointed = false;
        for file in &files {
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
                let sha = create_blob(&client, &config.repo, &bytes).await?;
                checkpoint_entries.push((file.path.clone(), sha.clone()));
                sha
            };
            tree_entries.push((file.path.clone(), blob_sha));

            if checkpoint_entries.len() >= CHECKPOINT_BLOBS {
                let tree = create_tree(
                    &client,
                    &config.repo,
                    &checkpoint_entries,
                    checkpoint_tree.as_deref(),
                )
                .await?;
                let commit = create_commit(
                    &client,
                    &config.repo,
                    &format!("{} (partial)", config.commit_message),
                    &tree,
                    parent.as_deref(),
                )
                .await?;
                update_ref(
                    &client,
                    &config.repo,
                    &config.branch,
                    &commit,
                    parent.is_some(),
                )
                .await?;
                parent = Some(commit);
                checkpoint_tree = Some(tree);
                checkpoint_entries.clear();
                checkpointed = true;
            }
        }

        let tree_sha = create_tree(&client, &config.repo, &tree_entries, None).await?;
        let commit_sha = match parent.as_deref() {
            // Nothing changed since the last backup: keep the branch head
            // instead of adding an empty commit on every auto-sync tick.
            Some(head) if !checkpointed && base_tree_sha.as_deref() == Some(tree_sha.as_str()) => {
                head.to_string()
            }
            _ => {
                let commit_sha = create_commit(
                    &client,
                    &config.repo,
                    &config.commit_message,
                    &tree_sha,
                    parent.as_deref(),
                )
                .await?;
                update_ref(
                    &client,
                    &config.repo,
                    &config.branch,
                    &commit_sha,
                    parent.is_some(),
                )
                .await?;
                commit_sha
            }
        };

        Ok::<SyncResult, String>(SyncResult {
            commit_sha,
            files_count: tree_entries.len(),
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
    let repo = repo.trim();
    validate_repo(repo)?;
    let token = secure_store_get(app, TOKEN_SECRET_KEY.to_string())
        .await?
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
        std::fs::write(root.join(".nevo/custom.css"), b"body{}").expect("custom.css");
        std::fs::write(root.join(".nevo/databases.sqlite"), b"sqlite").expect("databases.sqlite");

        std::fs::create_dir_all(root.join(".nevo/templates")).expect("templates dir");
        std::fs::write(root.join(".nevo/templates/t.json"), b"{}").expect("template");

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
                ".nevo/custom.css".to_string(),
                ".nevo/databases.sqlite".to_string(),
                ".nevo/settings.json".to_string(),
                ".nevo/snapshots/note-a/2024.json".to_string(),
                ".nevo/templates/t.json".to_string(),
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

    #[cfg(unix)]
    #[test]
    fn collect_workspace_files_skips_symlinks() {
        let workspace = workspace("symlink");
        let outside = workspace("symlink-outside");
        std::fs::write(outside.join("secret.txt"), b"secret").expect("outside file");
        std::fs::create_dir_all(workspace.join(".nevo/assets")).expect("assets dir");
        std::os::unix::fs::symlink(
            outside.join("secret.txt"),
            workspace.join(".nevo/assets/link.txt"),
        )
        .expect("file symlink");
        std::os::unix::fs::symlink(&outside, workspace.join(".nevo/assets/dir"))
            .expect("dir symlink");

        let collected = collect_workspace_files(&workspace.to_string_lossy()).expect("collect");
        assert!(collected.files.is_empty());

        std::fs::remove_dir_all(workspace).expect("cleanup");
        std::fs::remove_dir_all(outside).expect("cleanup");
    }

    #[test]
    fn snapshot_collected_database_includes_wal_rows_and_cleans_up() {
        let workspace = workspace("db-snapshot");
        // Keep the connection open so the inserted row is still only in the WAL.
        let connection =
            crate::commands::database::open_database(&workspace).expect("open database");
        connection
            .execute(
                "INSERT INTO database_records VALUES ('db', 'r1', 0, '{}')",
                [],
            )
            .expect("insert row");

        let workspace_path = workspace.to_string_lossy().into_owned();
        let mut collected = collect_workspace_files(&workspace_path).expect("collect");
        let snapshot = snapshot_collected_database(&workspace_path, &mut collected)
            .expect("snapshot")
            .expect("database present");
        let entry = collected
            .files
            .iter()
            .find(|file| file.path == DATABASE_PATH)
            .expect("database entry");
        assert_eq!(entry.source_path, snapshot.0);

        let copy = rusqlite::Connection::open(&snapshot.0).expect("open snapshot");
        let rows: i64 = copy
            .query_row("SELECT COUNT(*) FROM database_records", [], |row| {
                row.get(0)
            })
            .expect("count rows");
        assert_eq!(rows, 1);
        drop(copy);

        let snapshot_path = snapshot.0.clone();
        drop(snapshot);
        assert!(!snapshot_path.exists());

        drop(connection);
        std::fs::remove_dir_all(workspace).expect("cleanup");
    }

    #[test]
    fn validate_repo_accepts_owner_name_only() {
        assert!(validate_repo("owner/name").is_ok());
        assert!(validate_repo("my-org/repo.name_1").is_ok());
        for invalid in [
            "",
            "owner",
            "owner/",
            "/name",
            "owner/name/extra",
            "owner/..",
            "owner/na me",
            "owner/name?x=1",
            "owner/name#x",
        ] {
            assert!(validate_repo(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn validate_branch_rejects_url_unsafe_and_invalid_refs() {
        for valid in ["main", "backup/nevo", "release-1.2"] {
            assert!(validate_branch(valid).is_ok(), "{valid}");
        }
        for invalid in [
            "", "/main", "main/", "a//b", "a..b", ".hidden", "x.lock", "a b", "a?b", "a#b", "a%20",
        ] {
            assert!(validate_branch(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn load_config_rejects_invalid_repo() {
        let workspace = workspace("config-invalid-repo");
        std::fs::write(
            workspace.join(".nevo/settings.json"),
            serde_json::to_vec(&serde_json::json!({
                "pluginSettings": { PLUGIN_ID: { "repo": "owner/name/../x" } }
            }))
            .expect("serialize settings"),
        )
        .expect("write settings");
        assert!(load_config(&workspace.to_string_lossy()).is_err());
        std::fs::remove_dir_all(&workspace).expect("cleanup");
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
