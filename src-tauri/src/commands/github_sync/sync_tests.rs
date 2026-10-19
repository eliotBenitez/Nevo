use std::path::PathBuf;

use super::api::{check_repo_access, github_client};
use super::config::GithubSyncConfig;
use super::fake_github::{start, Commit, FakeRepo};
use super::files::RepoFile;
use super::sync::{upload_mirror, CHECKPOINT_BLOBS};

struct Workspace(PathBuf);

impl Workspace {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("nevo-github-sync-flow-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).expect("workspace dir");
        Self(path)
    }

    fn write(&self, path: &str, content: &str) -> RepoFile {
        let source_path = self.0.join(path.replace('/', "_"));
        std::fs::write(&source_path, content).expect("write file");
        RepoFile {
            path: path.to_string(),
            source_path,
        }
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn config() -> GithubSyncConfig {
    GithubSyncConfig {
        repo: "o/n".to_string(),
        branch: "main".to_string(),
        commit_message: "Nevo backup".to_string(),
    }
}

fn client() -> reqwest::Client {
    github_client("test-token").expect("client")
}

async fn sync(repo_url: &str, files: &[RepoFile]) -> Result<super::SyncResult, String> {
    upload_mirror(&client(), repo_url, &config(), files, &mut Vec::new()).await
}

#[tokio::test]
async fn first_sync_bootstraps_an_empty_repository() {
    let workspace = Workspace::new();
    let files = vec![workspace.write("notes/a.nevo", "a")];
    let (repo, url) = start(FakeRepo {
        empty: true,
        ..FakeRepo::default()
    })
    .await;

    let result = sync(&url, &files).await.expect("sync");

    let repo = repo.lock().unwrap();
    assert_eq!(repo.head("main"), Some(result.commit_sha.clone()));
    // The bootstrap placeholder is gone from the mirrored tree.
    assert_eq!(
        repo.head_tree("main").keys().cloned().collect::<Vec<_>>(),
        vec!["notes/a.nevo".to_string()]
    );
    assert_eq!(repo.commits[&result.commit_sha].parents.len(), 1);
}

#[tokio::test]
async fn unchanged_workspace_adds_no_commit_and_changes_upload_only_new_blobs() {
    let workspace = Workspace::new();
    let mut files = vec![
        workspace.write("notes/a.nevo", "a"),
        workspace.write("notes/b.nevo", "b"),
    ];
    let (repo, url) = start(FakeRepo::default()).await;

    let first = sync(&url, &files).await.expect("first sync");
    assert_eq!(repo.lock().unwrap().count("POST", "/git/refs"), 1);

    let second = sync(&url, &files).await.expect("second sync");
    assert_eq!(second.commit_sha, first.commit_sha);
    assert_eq!(repo.lock().unwrap().count("POST", "/git/commits"), 1);

    files[1] = workspace.write("notes/b.nevo", "b2");
    let blobs_before = repo.lock().unwrap().count("POST", "/git/blobs");
    let third = sync(&url, &files).await.expect("third sync");

    let repo = repo.lock().unwrap();
    assert_eq!(repo.count("POST", "/git/blobs"), blobs_before + 1);
    assert_eq!(
        repo.commits[&third.commit_sha].parents,
        vec![first.commit_sha]
    );
    assert!(repo
        .requests
        .iter()
        .filter(|request| request.method == "PATCH")
        .all(|request| request.body["force"] == serde_json::json!(false)));
}

#[tokio::test]
async fn deleted_files_leave_the_mirror() {
    let workspace = Workspace::new();
    let files = vec![
        workspace.write("notes/a.nevo", "a"),
        workspace.write("notes/b.nevo", "b"),
    ];
    let (repo, url) = start(FakeRepo::default()).await;
    sync(&url, &files).await.expect("first sync");

    sync(&url, &files[..1]).await.expect("second sync");

    assert_eq!(
        repo.lock()
            .unwrap()
            .head_tree("main")
            .keys()
            .cloned()
            .collect::<Vec<_>>(),
        vec!["notes/a.nevo".to_string()]
    );
}

#[tokio::test]
async fn large_upload_pushes_additive_checkpoint_commits() {
    let workspace = Workspace::new();
    let files = (0..CHECKPOINT_BLOBS + 5)
        .map(|index| workspace.write(&format!("notes/{index}.nevo"), &index.to_string()))
        .collect::<Vec<_>>();
    let (repo, url) = start(FakeRepo::default()).await;

    let result = sync(&url, &files).await.expect("sync");

    let repo = repo.lock().unwrap();
    let head = &repo.commits[&result.commit_sha];
    assert_eq!(head.message, "Nevo backup");
    assert_eq!(repo.head_tree("main").len(), files.len());
    let checkpoint = &repo.commits[&head.parents[0]];
    assert_eq!(checkpoint.message, "Nevo backup (partial)");
    assert_eq!(repo.trees[&checkpoint.tree].len(), CHECKPOINT_BLOBS);
}

#[tokio::test]
async fn concurrent_push_is_not_overwritten() {
    let workspace = Workspace::new();
    let (repo, url) = start(FakeRepo::default()).await;
    sync(&url, &[workspace.write("notes/a.nevo", "a")])
        .await
        .expect("first sync");
    {
        let mut repo = repo.lock().unwrap();
        let tree = repo.commits[&repo.head("main").unwrap()].tree.clone();
        repo.commits.insert(
            "foreign".to_string(),
            Commit {
                tree,
                parents: vec![],
                message: "pushed elsewhere".to_string(),
            },
        );
        repo.concurrent_push = Some("foreign".to_string());
    }

    let error = sync(&url, &[workspace.write("notes/a.nevo", "changed")])
        .await
        .expect_err("non fast-forward update is rejected");

    assert!(error.contains("422"), "{error}");
    assert_eq!(
        repo.lock().unwrap().head("main"),
        Some("foreign".to_string())
    );
}

#[tokio::test]
async fn connection_check_rejects_read_only_tokens() {
    let (_repo, url) = start(FakeRepo {
        can_push: false,
        ..FakeRepo::default()
    })
    .await;
    let error = check_repo_access(&client(), &url)
        .await
        .expect_err("read-only token");
    assert!(error.contains("cannot push"));

    let (_repo, url) = start(FakeRepo {
        can_push: true,
        ..FakeRepo::default()
    })
    .await;
    assert_eq!(check_repo_access(&client(), &url).await, Ok(true));
}
