//! RPC method registry and dispatch.
//!
//! Each method declares the access level it needs; `dispatch` applies the
//! permission gate before the handler runs, so a new method cannot accidentally
//! ship without one.

mod editor;
mod folders;
mod history;
mod notes;
mod trash;
mod write;

use serde::Deserialize;
use serde_json::Value;
use tauri::Emitter;

use super::permissions::{self, Access, Decision};

const WORKSPACE_CHANGED_EVENT: &str = "mcp-workspace-changed";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RpcError {
    pub status: &'static str,
    pub code: String,
    pub message: String,
}

impl RpcError {
    pub fn bad_request(code: &str, message: &str) -> Self {
        Self {
            status: "400 Bad Request",
            code: code.to_string(),
            message: message.to_string(),
        }
    }

    pub fn forbidden(code: &str, message: &str) -> Self {
        Self {
            status: "403 Forbidden",
            code: code.to_string(),
            message: message.to_string(),
        }
    }

    pub fn not_found(message: &str) -> Self {
        Self {
            status: "404 Not Found",
            code: "not_found".to_string(),
            message: message.to_string(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            status: "500 Internal Server Error",
            code: "internal".to_string(),
            message: message.into(),
        }
    }
}

/// Shared param decoding. A method whose params are all optional is normally
/// called with no `params` member at all, which arrives as `Null`; treat that
/// as an empty object so `#[serde(default)]` applies instead of failing.
pub(super) fn parse_params<T: for<'de> Deserialize<'de>>(params: Value) -> Result<T, RpcError> {
    let params = if params.is_null() {
        Value::Object(serde_json::Map::new())
    } else {
        params
    };
    serde_json::from_value(params)
        .map_err(|error| RpcError::bad_request("invalid_params", &error.to_string()))
}

/// Access level required by each method. Unknown methods are rejected before
/// any workspace access happens.
pub fn access_for(method: &str) -> Option<Access> {
    match method {
        "workspace.info"
        | "notes.list"
        | "notes.search"
        | "notes.read"
        | "notes.editorSnapshot"
        | "notes.open"
        | "notes.listSnapshots"
        | "notes.readSnapshot"
        | "folders.list"
        | "trash.list" => Some(Access::Read),
        "notes.create"
        | "notes.move"
        | "notes.delete"
        | "notes.applyEdit"
        | "notes.writeMarkdown"
        | "notes.rename"
        | "notes.restoreSnapshot"
        | "folders.create"
        | "folders.rename"
        | "trash.restore" => Some(Access::Write),
        _ => None,
    }
}

/// `app` is optional so the filesystem-backed methods stay testable without a
/// running window; the methods that need the webview refuse when it is absent.
pub async fn dispatch(
    app: Option<&tauri::AppHandle>,
    workspace_path: &str,
    method: &str,
    params: Value,
) -> Result<Value, RpcError> {
    let Some(access) = access_for(method) else {
        return Err(RpcError::bad_request(
            "unknown_method",
            &format!("Unknown method: {method}"),
        ));
    };

    let mode = permissions::current_mode(workspace_path);
    match permissions::decide(mode, access) {
        Decision::Allow => {}
        Decision::Confirm => {
            if !editor::confirm(require_app(app)?, method, &params).await? {
                return Err(RpcError::forbidden(
                    "declined",
                    "The user declined this operation in Nevo.",
                ));
            }
        }
        Decision::Deny(reason) => {
            return Err(RpcError::forbidden(reason.code(), reason.message()));
        }
    }

    match method {
        // Editor-bound methods talk to the webview and must stay on the async
        // path; everything else is filesystem work moved off the runtime.
        "notes.editorSnapshot" => editor::editor_snapshot(require_app(app)?, params).await,
        "notes.applyEdit" => editor::apply_edit(require_app(app)?, workspace_path, params).await,
        "notes.open" => editor::open_note(require_app(app)?, workspace_path, params).await,
        "notes.writeMarkdown" => {
            editor::write_markdown(require_app(app)?, workspace_path, params).await
        }
        "notes.rename" => editor::rename_note(require_app(app)?, workspace_path, params).await,
        "notes.restoreSnapshot" => history::restore_snapshot(require_app(app)?, params).await,
        _ => {
            let result =
                run_blocking(workspace_path.to_string(), method.to_string(), params).await?;
            if mutates_workspace_manifest(method) {
                if let Some(app) = app {
                    // The mutation has already committed to disk. Notification
                    // is best-effort so an unavailable webview cannot turn a
                    // successful create into an agent-visible failure/retry.
                    let _ = app.emit(
                        WORKSPACE_CHANGED_EVENT,
                        serde_json::json!({
                            "method": method,
                            "workspacePath": workspace_path,
                        }),
                    );
                }
            }
            Ok(result)
        }
    }
}

fn mutates_workspace_manifest(method: &str) -> bool {
    matches!(
        method,
        "notes.create"
            | "notes.move"
            | "notes.delete"
            | "folders.create"
            | "folders.rename"
            | "trash.restore"
    )
}

fn require_app(app: Option<&tauri::AppHandle>) -> Result<&tauri::AppHandle, RpcError> {
    app.ok_or_else(|| RpcError::internal("The Nevo window is not available"))
}

/// Runs a filesystem-backed handler on the blocking pool: these walk the
/// manifest and parse note files, which must not stall the async runtime.
async fn run_blocking(
    workspace_path: String,
    method: String,
    params: Value,
) -> Result<Value, RpcError> {
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let path = workspace_path.as_str();
        match method.as_str() {
            "workspace.info" => notes::workspace_info(path),
            "notes.list" => notes::list_notes(path, params),
            "notes.search" => notes::search_notes(path, params),
            "notes.read" => notes::read_note(path, params),
            "notes.create" => write::create_note(path, params),
            "notes.move" => write::move_note(path, params),
            "notes.delete" => write::delete_note(path, params),
            "notes.listSnapshots" => history::list_snapshots(path, params),
            "notes.readSnapshot" => history::read_snapshot(path, params),
            "folders.list" => folders::list_folders(path),
            "folders.create" => folders::create_folder(path, params),
            "folders.rename" => folders::rename_folder(path, params),
            "trash.list" => trash::list_trash(path),
            "trash.restore" => trash::restore(path, params),
            other => Err(RpcError::bad_request(
                "unknown_method",
                &format!("Unknown method: {other}"),
            )),
        }
    })
    .await;

    outcome.unwrap_or_else(|error| Err(RpcError::internal(error.to_string())))
}

#[cfg(test)]
mod tests;
