//! In-process stand-in for the slice of the GitHub REST API the sync uses:
//! one repository (`o/n`) with branch refs, commits, trees and blobs kept in
//! memory, served over plain HTTP/1.1 on a loopback port.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

use super::files::git_blob_sha;

#[derive(Debug, Clone)]
pub(super) struct Commit {
    pub tree: String,
    pub parents: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone)]
pub(super) struct Recorded {
    pub method: String,
    pub path: String,
    pub body: Value,
}

#[derive(Debug, Default)]
pub(super) struct FakeRepo {
    /// Answer `409 Git Repository is empty` until the first Contents API PUT.
    pub empty: bool,
    pub can_push: bool,
    pub refs: HashMap<String, String>,
    pub commits: HashMap<String, Commit>,
    pub trees: HashMap<String, BTreeMap<String, String>>,
    pub blobs: HashMap<String, Vec<u8>>,
    pub requests: Vec<Recorded>,
    /// Moves the branch to this commit right before the next ref update, as
    /// if someone else pushed while the sync was running.
    pub concurrent_push: Option<String>,
    pub next_commit: u64,
}

impl FakeRepo {
    pub fn head(&self, branch: &str) -> Option<String> {
        self.refs.get(branch).cloned()
    }

    pub fn head_tree(&self, branch: &str) -> BTreeMap<String, String> {
        let head = self.head(branch).expect("branch exists");
        self.trees[&self.commits[&head].tree].clone()
    }

    pub fn count(&self, method: &str, path_suffix: &str) -> usize {
        self.requests
            .iter()
            .filter(|request| request.method == method && request.path.ends_with(path_suffix))
            .count()
    }

    fn store_tree(&mut self, entries: BTreeMap<String, String>) -> String {
        let id = git_blob_sha(serde_json::to_string(&entries).unwrap().as_bytes());
        self.trees.insert(id.clone(), entries);
        id
    }

    fn store_commit(&mut self, commit: Commit) -> String {
        self.next_commit += 1;
        let id = format!("commit{}", self.next_commit);
        self.commits.insert(id.clone(), commit);
        id
    }

    fn handle(&mut self, method: &str, path: &str, body: Value) -> (u16, Value) {
        self.requests.push(Recorded {
            method: method.to_string(),
            path: path.to_string(),
            body: body.clone(),
        });
        let route = path.strip_prefix("/repos/o/n").unwrap_or(path);
        let (route, _query) = route.split_once('?').unwrap_or((route, ""));
        if self.empty && route.starts_with("/git/") {
            return (409, json!({ "message": "Git Repository is empty." }));
        }
        match (method, route) {
            ("GET", "") => (
                200,
                json!({ "full_name": "o/n", "permissions": { "push": self.can_push } }),
            ),
            ("PUT", path) if path.starts_with("/contents/") => {
                let name = path.trim_start_matches("/contents/").to_string();
                let bytes = STANDARD.decode(body["content"].as_str().unwrap()).unwrap();
                let blob = git_blob_sha(&bytes);
                self.blobs.insert(blob.clone(), bytes);
                let tree = self.store_tree(BTreeMap::from([(name, blob)]));
                let commit = self.store_commit(Commit {
                    tree,
                    parents: vec![],
                    message: body["message"].as_str().unwrap().to_string(),
                });
                self.refs
                    .insert(body["branch"].as_str().unwrap().to_string(), commit.clone());
                self.empty = false;
                (201, json!({ "commit": { "sha": commit } }))
            }
            ("GET", path) if path.starts_with("/git/ref/heads/") => {
                match self.refs.get(path.trim_start_matches("/git/ref/heads/")) {
                    Some(sha) => (200, json!({ "object": { "sha": sha } })),
                    None => (404, json!({ "message": "Not Found" })),
                }
            }
            ("GET", path) if path.starts_with("/git/commits/") => {
                match self.commits.get(path.trim_start_matches("/git/commits/")) {
                    Some(commit) => (200, json!({ "tree": { "sha": commit.tree } })),
                    None => (404, json!({ "message": "Not Found" })),
                }
            }
            ("GET", path) if path.starts_with("/git/trees/") => {
                match self.trees.get(path.trim_start_matches("/git/trees/")) {
                    Some(entries) => {
                        let tree = entries
                            .iter()
                            .map(|(path, sha)| json!({ "path": path, "type": "blob", "sha": sha }))
                            .collect::<Vec<_>>();
                        (200, json!({ "tree": tree }))
                    }
                    None => (404, json!({ "message": "Not Found" })),
                }
            }
            ("POST", "/git/blobs") => {
                let bytes = STANDARD.decode(body["content"].as_str().unwrap()).unwrap();
                let sha = git_blob_sha(&bytes);
                self.blobs.insert(sha.clone(), bytes);
                (201, json!({ "sha": sha }))
            }
            ("POST", "/git/trees") => {
                let mut entries = match body["base_tree"].as_str() {
                    Some(base) => self.trees[base].clone(),
                    None => BTreeMap::new(),
                };
                for entry in body["tree"].as_array().unwrap() {
                    let sha = entry["sha"].as_str().unwrap();
                    if !self.blobs.contains_key(sha) {
                        return (422, json!({ "message": "Invalid tree info" }));
                    }
                    entries.insert(entry["path"].as_str().unwrap().to_string(), sha.to_string());
                }
                (201, json!({ "sha": self.store_tree(entries) }))
            }
            ("POST", "/git/commits") => {
                let commit = Commit {
                    tree: body["tree"].as_str().unwrap().to_string(),
                    parents: body["parents"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|parent| parent.as_str().unwrap().to_string())
                        .collect(),
                    message: body["message"].as_str().unwrap().to_string(),
                };
                (201, json!({ "sha": self.store_commit(commit) }))
            }
            ("POST", "/git/refs") => {
                let branch = body["ref"]
                    .as_str()
                    .unwrap()
                    .trim_start_matches("refs/heads/")
                    .to_string();
                if self.refs.contains_key(&branch) {
                    return (422, json!({ "message": "Reference already exists" }));
                }
                self.refs
                    .insert(branch, body["sha"].as_str().unwrap().to_string());
                (201, json!({}))
            }
            ("PATCH", path) if path.starts_with("/git/refs/heads/") => {
                let branch = path.trim_start_matches("/git/refs/heads/").to_string();
                if let Some(foreign) = self.concurrent_push.take() {
                    self.refs.insert(branch.clone(), foreign);
                }
                let sha = body["sha"].as_str().unwrap().to_string();
                let fast_forward = self.commits[&sha].parents.first() == self.refs.get(&branch);
                if !fast_forward && body["force"] != json!(true) {
                    return (422, json!({ "message": "Update is not a fast forward" }));
                }
                self.refs.insert(branch, sha);
                (200, json!({}))
            }
            _ => (404, json!({ "message": "Not Found" })),
        }
    }
}

/// Starts the server and returns the shared repo state plus its `repo_url`.
pub(super) async fn start(repo: FakeRepo) -> (Arc<Mutex<FakeRepo>>, String) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let address = listener.local_addr().expect("address");
    let repo = Arc::new(Mutex::new(repo));
    let server_repo = repo.clone();
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            tokio::spawn(serve(stream, server_repo.clone()));
        }
    });
    (repo, format!("http://{}/repos/o/n", address))
}

async fn serve(stream: TcpStream, repo: Arc<Mutex<FakeRepo>>) {
    let mut reader = BufReader::new(stream);
    loop {
        let mut request_line = String::new();
        if reader.read_line(&mut request_line).await.unwrap_or(0) == 0 {
            return;
        }
        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or_default().to_string();
        let path = parts.next().unwrap_or_default().to_string();

        let mut content_length = 0usize;
        loop {
            let mut header = String::new();
            if reader.read_line(&mut header).await.unwrap_or(0) == 0 {
                return;
            }
            let header = header.trim_end();
            if header.is_empty() {
                break;
            }
            if let Some((name, value)) = header.split_once(':') {
                if name.eq_ignore_ascii_case("content-length") {
                    content_length = value.trim().parse().unwrap_or(0);
                }
            }
        }
        let mut body = vec![0u8; content_length];
        if reader.read_exact(&mut body).await.is_err() {
            return;
        }
        let body = serde_json::from_slice(&body).unwrap_or(Value::Null);

        let (status, payload) = repo.lock().unwrap().handle(&method, &path, body);
        let payload = payload.to_string();
        let response = format!(
            "HTTP/1.1 {} Fake\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            status,
            payload.len(),
            payload
        );
        if reader
            .get_mut()
            .write_all(response.as_bytes())
            .await
            .is_err()
        {
            return;
        }
    }
}
