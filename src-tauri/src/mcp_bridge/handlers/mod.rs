//! RPC method registry and dispatch.
//!
//! Each method declares the access level it needs; `dispatch` applies the
//! permission gate before the handler runs, so a new method cannot accidentally
//! ship without one.

mod editor;
mod notes;
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
        | "notes.editorSnapshot" => Some(Access::Read),
        "notes.create" | "notes.move" | "notes.delete" | "notes.applyEdit" => Some(Access::Write),
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
        "notes.applyEdit" => editor::apply_edit(require_app(app)?, params).await,
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
    matches!(method, "notes.create" | "notes.move" | "notes.delete")
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
mod tests {
    use super::*;

    const READ_METHODS: [&str; 5] = [
        "workspace.info",
        "notes.list",
        "notes.search",
        "notes.read",
        "notes.editorSnapshot",
    ];
    const WRITE_METHODS: [&str; 4] = [
        "notes.create",
        "notes.move",
        "notes.delete",
        "notes.applyEdit",
    ];

    #[test]
    fn every_method_declares_the_access_level_it_needs() {
        for method in READ_METHODS {
            assert_eq!(access_for(method), Some(Access::Read), "{method}");
        }
        for method in WRITE_METHODS {
            assert_eq!(access_for(method), Some(Access::Write), "{method}");
        }
    }

    #[test]
    fn unknown_methods_are_rejected() {
        assert!(access_for("notes.delete_everything").is_none());
        assert!(access_for("notes.permanentlyDelete").is_none());
    }

    #[test]
    fn structural_note_writes_refresh_the_live_workspace_tree() {
        for method in ["notes.create", "notes.move", "notes.delete"] {
            assert!(mutates_workspace_manifest(method), "{method}");
        }
        for method in ["notes.applyEdit", "notes.read", "workspace.info"] {
            assert!(!mutates_workspace_manifest(method), "{method}");
        }
    }

    /// The bridge must never expose a permanent delete: an agent can trash a
    /// note (recoverable) but not destroy one.
    #[test]
    fn no_registered_method_destroys_data_irreversibly() {
        for method in WRITE_METHODS {
            assert!(!method.contains("permanent"), "{method}");
            assert!(!method.contains("emptyTrash"), "{method}");
        }
    }

    /// Builds a minimal on-disk workspace: manifest with one note in one
    /// folder, the note file itself, and settings granting `mode`.
    fn temp_workspace(mode: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("nevo-ws-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".nevo")).expect("create .nevo");
        std::fs::create_dir_all(root.join("notes")).expect("create notes dir");

        std::fs::write(
            root.join(".nevo/settings.json"),
            serde_json::json!({ "mcp": { "mode": mode } }).to_string(),
        )
        .expect("write settings");

        std::fs::write(
            root.join(".nevo/workspace.json"),
            serde_json::json!({
                "id": "ws-1",
                "name": "Test Vault",
                "glyph": "N",
                "gradient": "aurora",
                "schemaVersion": 2,
                "createdAt": "2026-01-01T00:00:00Z",
                "rootOrder": [],
                "tree": [{
                    "id": "folder-1",
                    "title": "Projects",
                    "icon": "",
                    "parentId": null,
                    "order": 0,
                    "children": [],
                    "notes": [{
                        "id": "note-1",
                        "title": "Roadmap",
                        "icon": "",
                        "folderId": "folder-1",
                        "updatedAt": "2026-01-02T00:00:00Z"
                    }]
                }],
                "rootNotes": []
            })
            .to_string(),
        )
        .expect("write manifest");

        std::fs::write(
            root.join("notes/note-note-1.nevo"),
            serde_json::json!({
                "id": "note-1",
                "title": "Roadmap",
                "icon": "",
                "cover": null,
                "folderId": "folder-1",
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-02T00:00:00Z",
                "properties": null,
                "content": {
                    "type": "doc",
                    "content": [{
                        "type": "paragraph",
                        "content": [{ "type": "text", "text": "Ship the bridge" }]
                    }]
                }
            })
            .to_string(),
        )
        .expect("write note");

        root
    }

    /// Exercises the blocking handlers directly: `dispatch` needs an AppHandle
    /// that only exists in a running app, but everything below the permission
    /// gate is reachable without one.
    fn blocking(root: &std::path::Path, method: &str, params: Value) -> Result<Value, RpcError> {
        let path = root.to_string_lossy().into_owned();
        match method {
            "workspace.info" => notes::workspace_info(&path),
            "notes.list" => notes::list_notes(&path, params),
            "notes.search" => notes::search_notes(&path, params),
            "notes.read" => notes::read_note(&path, params),
            "notes.create" => write::create_note(&path, params),
            "notes.move" => write::move_note(&path, params),
            "notes.delete" => write::delete_note(&path, params),
            other => panic!("unexpected method {other}"),
        }
    }

    #[test]
    fn read_only_workspace_serves_list_read_and_search() {
        let root = temp_workspace("read-only");

        let listed = blocking(&root, "notes.list", Value::Null).expect("list notes");
        assert_eq!(listed["total"], 1);
        assert_eq!(listed["notes"][0]["id"], "note-1");
        assert_eq!(listed["notes"][0]["folderPath"], "Projects");

        let read = blocking(
            &root,
            "notes.read",
            serde_json::json!({ "noteId": "note-1" }),
        )
        .expect("read note");
        assert_eq!(read["title"], "Roadmap");
        assert_eq!(read["contentSource"], "persisted");

        let found = blocking(
            &root,
            "notes.search",
            serde_json::json!({ "query": "bridge" }),
        )
        .expect("search notes");
        assert_eq!(found["matches"][0]["noteId"], "note-1");

        let info = blocking(&root, "workspace.info", Value::Null).expect("workspace info");
        assert_eq!(info["name"], "Test Vault");
        assert_eq!(info["noteCount"], 1);
        assert_eq!(info["folderCount"], 1);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn create_then_delete_updates_the_manifest_and_trash() {
        let root = temp_workspace("auto");

        let created = blocking(
            &root,
            "notes.create",
            serde_json::json!({ "title": "Agent note", "folderId": "folder-1" }),
        )
        .expect("create note");
        let new_id = created["id"].as_str().expect("id").to_string();

        let listed = blocking(&root, "notes.list", Value::Null).expect("list notes");
        assert_eq!(listed["total"], 2);

        let deleted = blocking(
            &root,
            "notes.delete",
            serde_json::json!({ "noteId": new_id }),
        )
        .expect("delete note");
        assert_eq!(deleted["movedToTrash"], true);

        // Trashed, not destroyed: the note leaves the tree but the workspace
        // still tracks it so the user can restore it.
        let after = blocking(&root, "notes.list", Value::Null).expect("list notes");
        assert_eq!(after["total"], 1);
        let info = blocking(&root, "workspace.info", Value::Null).expect("workspace info");
        assert_eq!(info["trashCount"], 1);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn deleting_a_note_snapshots_it_first() {
        let root = temp_workspace("auto");

        blocking(
            &root,
            "notes.delete",
            serde_json::json!({ "noteId": "note-1" }),
        )
        .expect("delete note");

        let snapshots = std::fs::read_dir(root.join(".nevo/snapshots"))
            .map(|entries| entries.count())
            .unwrap_or(0);
        assert!(snapshots > 0, "expected a snapshot before the mutation");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn move_relocates_a_note_to_the_workspace_root() {
        let root = temp_workspace("auto");

        blocking(
            &root,
            "notes.move",
            serde_json::json!({ "noteId": "note-1", "targetFolderId": null }),
        )
        .expect("move note");

        let listed = blocking(&root, "notes.list", Value::Null).expect("list notes");
        assert_eq!(listed["notes"][0]["folderPath"], "");

        let _ = std::fs::remove_dir_all(&root);
    }
}
