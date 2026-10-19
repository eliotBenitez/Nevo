//! GitHub REST calls used by the sync: client setup, retry and rate-limit
//! handling, and the Git Data API steps (ref, tree, blob, commit). Every call
//! takes `repo_url` (`<api>/repos/<owner>/<name>`, see `repo_url`) so tests can
//! point it at a local fake server.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use chrono::Utc;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

pub(super) const GITHUB_API: &str = "https://api.github.com";
pub(super) const USER_AGENT: &str = "Nevo";

/// Per-request timeout for GitHub API calls, so a stalled connection fails fast
/// (and is then retried) instead of hanging the sync indefinitely.
pub(super) const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// How many times a transient GitHub failure (network error or 429/5xx) is
/// retried before giving up.
pub(super) const MAX_REQUEST_ATTEMPTS: u32 = 4;

pub(super) fn repo_url(repo: &str) -> String {
    format!("{}/repos/{}", GITHUB_API, repo)
}

#[derive(Debug, Deserialize)]
pub(super) struct GitRefResponse {
    pub(super) object: GitRefObject,
}

#[derive(Debug, Deserialize)]
pub(super) struct GitRefObject {
    pub(super) sha: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct GitBlobResponse {
    pub(super) sha: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct GitTreeResponse {
    pub(super) sha: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct GitCommitResponse {
    pub(super) sha: String,
}

pub(super) fn github_client(token: &str) -> Result<reqwest::Client, String> {
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

pub(super) async fn github_error(response: reqwest::Response, url: &str) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    format!("GitHub API {} at {}: {}", status, url, body)
}

/// Transient GitHub responses worth retrying: rate limiting and gateway/backend
/// errors (a large-blob `POST /git/blobs` typically surfaces as `504`).
pub(super) fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504)
}

/// Exponential backoff (500ms, 1s, 2s, …) capped at 4s.
pub(super) fn backoff_delay(attempt: u32) -> Duration {
    let millis = 500u64.saturating_mul(1u64 << (attempt - 1).min(3));
    Duration::from_millis(millis.min(4000))
}

/// Longest we'll wait out a GitHub rate limit before giving up and surfacing
/// the error. Secondary limits use short `Retry-After` windows we can honor;
/// a primary limit whose reset is further away fails fast with a clear message.
pub(super) const RATE_LIMIT_MAX_WAIT: Duration = Duration::from_secs(60);

pub(super) fn header_u64(headers: &reqwest::header::HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.trim().parse::<u64>().ok()
}

/// If `status`/`headers` indicate a GitHub rate limit we can wait out, return
/// the delay to sleep before retrying (capped at `RATE_LIMIT_MAX_WAIT`).
/// Honors `Retry-After` (secondary limit) first, then `X-RateLimit-Remaining:
/// 0` + `X-RateLimit-Reset` (primary limit). Returns `None` when it isn't a
/// waitable rate limit (e.g. a permission 403, or a reset too far away).
pub(super) fn rate_limit_delay(
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
pub(super) async fn send_with_retry(
    builder: reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
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

pub(super) async fn get_base_commit_sha(
    client: &reqwest::Client,
    repo_url: &str,
    branch: &str,
) -> Result<Option<String>, String> {
    let url = format!("{}/git/ref/heads/{}", repo_url, branch);
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
        bootstrap_empty_repo(client, repo_url, branch)
            .await
            .map(Some)
    } else {
        Err(github_error(response, &url).await)
    }
}

/// Placeholder committed through the Contents API to give an empty repository
/// its first commit: the Git Data API answers `409 Git Repository is empty`
/// until one exists. The mirror tree committed right after does not contain
/// it, so it disappears from the branch again.
pub(super) const BOOTSTRAP_PATH: &str = ".nevo-github-sync";

#[derive(Debug, Deserialize)]
pub(super) struct ContentsResponse {
    pub(super) commit: GitCommitResponse,
}

pub(super) async fn bootstrap_empty_repo(
    client: &reqwest::Client,
    repo_url: &str,
    branch: &str,
) -> Result<String, String> {
    let url = format!("{}/contents/{}", repo_url, BOOTSTRAP_PATH);
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
pub(super) struct GitCommitDetail {
    pub(super) tree: GitTreeRef,
}

#[derive(Debug, Deserialize)]
pub(super) struct GitTreeRef {
    pub(super) sha: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct GitTreeListResponse {
    pub(super) tree: Vec<GitTreeListEntry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct GitTreeListEntry {
    pub(super) path: String,
    #[serde(rename = "type")]
    pub(super) entry_type: String,
    pub(super) sha: String,
}

/// `commit_sha`'s tree id plus its recursive `path -> blob sha` map, so an
/// unchanged file can reuse its existing blob instead of re-uploading it.
/// Returns `None` if the commit is missing and an empty map if the tree is
/// (404/409): a missing path simply falls back to a normal upload, which is
/// always correct. A truncated tree is likewise harmless — paths not in the
/// map are re-uploaded.
pub(super) async fn get_base_tree(
    client: &reqwest::Client,
    repo_url: &str,
    commit_sha: &str,
) -> Result<Option<(String, HashMap<String, String>)>, String> {
    let commit_url = format!("{}/git/commits/{}", repo_url, commit_sha);
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

    let tree_url = format!("{}/git/trees/{}?recursive=1", repo_url, commit.tree.sha);
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

pub(super) async fn create_blob(
    client: &reqwest::Client,
    repo_url: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let url = format!("{}/git/blobs", repo_url);
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

pub(super) async fn create_tree(
    client: &reqwest::Client,
    repo_url: &str,
    entries: &[(String, String)],
    base_tree: Option<&str>,
) -> Result<String, String> {
    let url = format!("{}/git/trees", repo_url);
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

pub(super) async fn create_commit(
    client: &reqwest::Client,
    repo_url: &str,
    message: &str,
    tree_sha: &str,
    parent_sha: Option<&str>,
) -> Result<String, String> {
    let url = format!("{}/git/commits", repo_url);
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

pub(super) async fn update_ref(
    client: &reqwest::Client,
    repo_url: &str,
    branch: &str,
    commit_sha: &str,
    had_base: bool,
) -> Result<(), String> {
    if had_base {
        let url = format!("{}/git/refs/heads/{}", repo_url, branch);
        // Every new commit has the current head as parent, so this is a fast
        // forward; refusing a force push keeps commits pushed concurrently.
        let body = serde_json::json!({ "sha": commit_sha, "force": false });
        let response = send_with_retry(client.patch(&url).json(&body)).await?;
        if !response.status().is_success() {
            return Err(github_error(response, &url).await);
        }
    } else {
        let url = format!("{}/git/refs", repo_url);
        let body = serde_json::json!({
            "ref": format!("refs/heads/{}", branch),
            "sha": commit_sha,
        });
        // A retry after a create that landed but timed out answers 422
        // ("Reference already exists"); the next sync then fast-forwards it.
        let response = send_with_retry(client.post(&url).json(&body)).await?;
        if !response.status().is_success() {
            return Err(github_error(response, &url).await);
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
struct RepoResponse {
    permissions: Option<RepoPermissions>,
}

#[derive(Debug, Deserialize)]
struct RepoPermissions {
    push: bool,
}

/// Confirms the token can read the repository and, when GitHub reports
/// permissions, push to it: a read-only token would otherwise only fail at
/// the first sync.
pub(super) async fn check_repo_access(
    client: &reqwest::Client,
    repo_url: &str,
) -> Result<bool, String> {
    let response = send_with_retry(client.get(repo_url)).await?;
    if !response.status().is_success() {
        return Err(github_error(response, repo_url).await);
    }
    let payload = response
        .json::<RepoResponse>()
        .await
        .map_err(|error| error.to_string())?;
    match payload.permissions {
        Some(RepoPermissions { push: false }) => {
            Err("The GitHub token cannot push to this repository".to_string())
        }
        _ => Ok(true),
    }
}
