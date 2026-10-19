//! `nevo.github-sync` plugin settings: reading `.nevo/settings.json` and
//! validating the repository and branch before they reach API URLs.

use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::settings_path;

pub(super) const PLUGIN_ID: &str = "nevo.github-sync";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GithubSyncConfig {
    pub(super) repo: String,
    pub(super) branch: String,
    pub(super) commit_message: String,
}

pub(super) fn load_config(workspace_path: &str) -> Result<GithubSyncConfig, String> {
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

fn is_repo_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// `repo` is spliced into API URL paths, so only `owner/name` is accepted.
pub(super) fn validate_repo(repo: &str) -> Result<(), String> {
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
pub(super) fn validate_branch(branch: &str) -> Result<(), String> {
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
