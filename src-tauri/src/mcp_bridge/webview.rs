//! Request channel from the bridge into the webview.
//!
//! Two bridge operations cannot be served from Rust: editing a note that is
//! open (the live editor's in-memory ProseMirror state, not yet flushed to
//! `note.json`, is ahead of the file on disk) and asking the user to confirm
//! a write in `ask` mode. Both are handled by emitting a request to the
//! frontend and awaiting its reply.

use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager};
use tokio::sync::oneshot;

use super::handlers::RpcError;

/// Long enough for a user to read a confirmation dialog, short enough that a
/// wedged frontend cannot pin an agent's request open indefinitely.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

const REQUEST_EVENT: &str = "mcp-bridge-request";

type Pending = DashMap<String, oneshot::Sender<Result<Value, String>>>;

/// Registry of in-flight webview requests, managed by Tauri so both the bridge
/// and the `mcp_respond` command reach the same map.
#[derive(Default)]
pub struct WebviewChannel {
    pending: Arc<Pending>,
}

impl WebviewChannel {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewRequest<'a> {
    request_id: &'a str,
    kind: &'a str,
    payload: &'a Value,
}

/// Sends one request to the frontend and waits for its reply.
pub async fn request(
    app: &tauri::AppHandle,
    kind: &str,
    payload: Value,
) -> Result<Value, RpcError> {
    let channel = app.state::<WebviewChannel>();
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    channel.pending.insert(request_id.clone(), tx);

    let emitted = app.emit(
        REQUEST_EVENT,
        WebviewRequest {
            request_id: &request_id,
            kind,
            payload: &payload,
        },
    );
    if let Err(error) = emitted {
        channel.pending.remove(&request_id);
        return Err(RpcError::internal(format!(
            "Could not reach the Nevo window: {error}"
        )));
    }

    match tokio::time::timeout(REQUEST_TIMEOUT, rx).await {
        Ok(Ok(Ok(value))) => Ok(value),
        Ok(Ok(Err(message))) => Err(RpcError::bad_request("editor_error", &message)),
        // The sender was dropped without replying — the window closed or the
        // handler threw before responding.
        Ok(Err(_)) => Err(RpcError::internal("The Nevo window did not reply")),
        Err(_) => {
            channel.pending.remove(&request_id);
            Err(RpcError::internal(
                "Timed out waiting for the Nevo window to reply",
            ))
        }
    }
}

/// Resolves a pending request. Returns false when the id is unknown, which
/// happens for a late reply after a timeout.
pub fn resolve(app: &tauri::AppHandle, request_id: &str, outcome: Result<Value, String>) -> bool {
    let channel = app.state::<WebviewChannel>();
    match channel.pending.remove(request_id) {
        Some((_, sender)) => sender.send(outcome).is_ok(),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_payload_uses_camel_case_keys() {
        let payload = serde_json::json!({ "noteId": "n1" });
        let raw = serde_json::to_string(&WebviewRequest {
            request_id: "r1",
            kind: "editor.applyEdit",
            payload: &payload,
        })
        .expect("serialize");
        assert!(raw.contains("\"requestId\":\"r1\""), "{raw}");
        assert!(raw.contains("\"kind\":\"editor.applyEdit\""), "{raw}");
    }

    #[tokio::test]
    async fn pending_entry_is_resolved_once_and_then_forgotten() {
        let pending: Pending = DashMap::new();
        let (tx, rx) = oneshot::channel::<Result<Value, String>>();
        pending.insert("r1".to_string(), tx);

        let (_, sender) = pending.remove("r1").expect("entry present");
        assert!(sender.send(Ok(Value::Bool(true))).is_ok());
        assert_eq!(rx.await.expect("receive"), Ok(Value::Bool(true)));

        // A second reply for the same id finds nothing, which is how a late
        // response after a timeout is discarded.
        assert!(pending.remove("r1").is_none());
    }
}
