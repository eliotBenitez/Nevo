use std::path::{Path, PathBuf};

use crate::logging::{LogContext, LogError};

pub(crate) fn settings_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/settings.json")
}

pub(crate) fn custom_css_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/custom.css")
}

pub(crate) fn plugins_dir_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/plugins")
}

pub(crate) fn snapshots_dir_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/snapshots")
}

pub(crate) fn assets_dir_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/assets")
}

pub(crate) fn notes_dir_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join("notes")
}

pub(crate) fn workspace_context(workspace_path: &str) -> LogContext {
    LogContext::workspace(workspace_path.to_string())
}

pub(crate) fn workspace_error_context(
    workspace_path: &str,
    kind: &str,
    message: String,
) -> LogContext {
    workspace_context(workspace_path).with_error(LogError {
        kind: Some(kind.to_string()),
        message,
        details: None,
    })
}
