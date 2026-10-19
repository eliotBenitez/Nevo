use std::path::PathBuf;
use std::time::Duration;

use super::api::{backoff_delay, is_retryable_status, rate_limit_delay};
use super::config::{load_config, validate_branch, validate_repo, PLUGIN_ID};
use super::files::{
    collect_workspace_files, git_blob_sha, snapshot_collected_database, DATABASE_PATH,
    MAX_BLOB_BYTES,
};

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
    std::os::unix::fs::symlink(&outside, workspace.join(".nevo/assets/dir")).expect("dir symlink");

    let collected = collect_workspace_files(&workspace.to_string_lossy()).expect("collect");
    assert!(collected.files.is_empty());

    std::fs::remove_dir_all(workspace).expect("cleanup");
    std::fs::remove_dir_all(outside).expect("cleanup");
}

#[test]
fn snapshot_collected_database_includes_wal_rows_and_cleans_up() {
    let workspace = workspace("db-snapshot");
    // Keep the connection open so the inserted row is still only in the WAL.
    let connection = crate::commands::database::open_database(&workspace).expect("open database");
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
    let error =
        load_config(&unconfigured_workspace.to_string_lossy()).expect_err("missing settings file");
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
