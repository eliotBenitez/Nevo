//! Loopback JSON-RPC listener backing the MCP bridge.
//!
//! Modelled on `media_server`: binds `127.0.0.1:0` and requires a random
//! per-session token. Unlike the media server it is started on demand — the
//! bridge only listens while the workspace's MCP mode is something other than
//! `off`, so a user who never opts in never gains an open socket.

use std::sync::Arc;

use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex};

use super::endpoint_file::{self, EndpointDescriptor};
use super::handlers::{self, RpcError};
use super::http::{self, AuthFailure, MAX_BODY_BYTES, MAX_HEAD_BYTES, RPC_PATH};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::McpMode;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpBridgeInfo {
    pub port: u16,
    pub token: String,
    pub workspace_path: String,
}

struct BridgeHandle {
    shutdown_tx: oneshot::Sender<()>,
    info: McpBridgeInfo,
}

#[derive(Default)]
pub struct McpBridgeState {
    handle: Mutex<Option<BridgeHandle>>,
}

impl McpBridgeState {
    pub fn new() -> Self {
        Self::default()
    }
}

fn random_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Starts the bridge for `workspace_path`, or returns the existing instance if
/// it is already serving that workspace. Switching workspaces restarts it so a
/// stale endpoint file can never point an agent at the previous vault.
pub async fn start(
    app: &tauri::AppHandle,
    state: &McpBridgeState,
    workspace_path: String,
    mode: McpMode,
) -> Result<McpBridgeInfo, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?
        .to_string_lossy()
        .into_owned();

    let mut handle = state.handle.lock().await;
    if let Some(existing) = handle.as_ref() {
        if existing.info.workspace_path == workspace_path {
            // Same workspace, possibly a new mode: refresh the endpoint file so
            // the MCP server sees the current access level, and keep the port
            // and token stable for any client already connected.
            endpoint_file::write(
                app,
                &EndpointDescriptor {
                    port: existing.info.port,
                    token: existing.info.token.clone(),
                    pid: std::process::id(),
                    workspace_path: workspace_path.clone(),
                    mode: mode.as_str().to_string(),
                },
            )?;
            return Ok(existing.info.clone());
        }
    }
    if let Some(previous) = handle.take() {
        let _ = previous.shutdown_tx.send(());
    }

    let std_listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    std_listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;
    let port = std_listener.local_addr().map_err(|e| e.to_string())?.port();

    let token = random_token();
    let info = McpBridgeInfo {
        port,
        token: token.clone(),
        workspace_path: workspace_path.clone(),
    };

    endpoint_file::write(
        app,
        &EndpointDescriptor {
            port,
            token: token.clone(),
            pid: std::process::id(),
            workspace_path: workspace_path.clone(),
            mode: mode.as_str().to_string(),
        },
    )?;

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let context = Arc::new(RequestContext {
        token,
        port,
        workspace_path,
        app: Some(app.clone()),
    });

    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::from_std(std_listener) {
            Ok(listener) => listener,
            Err(_) => return,
        };
        run(listener, context, shutdown_rx).await;
    });

    *handle = Some(BridgeHandle {
        shutdown_tx,
        info: info.clone(),
    });

    Ok(info)
}

pub async fn stop(app: &tauri::AppHandle, state: &McpBridgeState) -> Result<(), String> {
    let mut handle = state.handle.lock().await;
    if let Some(existing) = handle.take() {
        let _ = existing.shutdown_tx.send(());
    }
    endpoint_file::remove(app)
}

pub async fn info(state: &McpBridgeState) -> Option<McpBridgeInfo> {
    state.handle.lock().await.as_ref().map(|h| h.info.clone())
}

/// Reconciles the listener with the workspace's configured mode: running for
/// every mode except `off`.
pub async fn apply_mode(
    app: &tauri::AppHandle,
    state: &McpBridgeState,
    workspace_path: String,
    mode: McpMode,
) -> Result<Option<McpBridgeInfo>, String> {
    if mode.allows_read() {
        start(app, state, workspace_path, mode).await.map(Some)
    } else {
        stop(app, state).await.map(|()| None)
    }
}

struct RequestContext {
    token: String,
    port: u16,
    workspace_path: String,
    /// Handlers that edit an open note or ask for confirmation need to reach
    /// the webview, so the accept loop carries the app handle.
    app: Option<tauri::AppHandle>,
}

async fn run(
    listener: TcpListener,
    context: Arc<RequestContext>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            _ = &mut shutdown_rx => break,
            accepted = listener.accept() => {
                let Ok((stream, _)) = accepted else { break };
                let context = context.clone();
                tauri::async_runtime::spawn(handle_connection(stream, context));
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct RpcRequest {
    method: String,
    #[serde(default)]
    params: serde_json::Value,
}

async fn handle_connection(mut stream: TcpStream, context: Arc<RequestContext>) {
    let response = match read_and_dispatch(&mut stream, &context).await {
        Ok(response) => response,
        Err(response) => response,
    };
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;
}

/// Reads one request and produces its response body. Both arms are strings so
/// the caller writes exactly one response per connection.
async fn read_and_dispatch(
    stream: &mut TcpStream,
    context: &RequestContext,
) -> Result<String, String> {
    let mut buffer = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    let head_end = loop {
        let read = match stream.read(&mut chunk).await {
            Ok(0) => {
                return Err(http::error_response(
                    "400 Bad Request",
                    "malformed",
                    "Empty request",
                ))
            }
            Ok(read) => read,
            Err(error) => {
                return Err(http::error_response(
                    "400 Bad Request",
                    "io",
                    &error.to_string(),
                ))
            }
        };
        buffer.extend_from_slice(&chunk[..read]);

        if let Some(index) = find_head_end(&buffer) {
            break index;
        }
        if buffer.len() > MAX_HEAD_BYTES {
            return Err(http::error_response(
                "431 Request Header Fields Too Large",
                "head_too_large",
                "Request headers exceed the allowed size",
            ));
        }
    };

    let raw_head = String::from_utf8_lossy(&buffer[..head_end]).into_owned();
    let Some(head) = http::parse_head(&raw_head) else {
        return Err(http::error_response(
            "400 Bad Request",
            "malformed",
            "Malformed request head",
        ));
    };

    if let Err(failure) = http::authenticate(&head, &context.token, context.port) {
        let (code, message) = match failure {
            AuthFailure::BadHost => (
                "bad_host",
                "Request Host must be the bridge's loopback address",
            ),
            AuthFailure::MissingToken => ("missing_token", "Missing bearer token"),
            AuthFailure::BadToken => ("bad_token", "Invalid bearer token"),
        };
        return Err(http::error_response("403 Forbidden", code, message));
    }

    if head.method != "POST" {
        return Err(http::error_response(
            "405 Method Not Allowed",
            "method_not_allowed",
            "The bridge only accepts POST",
        ));
    }
    if head.target != RPC_PATH {
        return Err(http::error_response(
            "404 Not Found",
            "not_found",
            "Unknown endpoint",
        ));
    }

    let content_length = head.content_length().unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Err(http::error_response(
            "413 Payload Too Large",
            "body_too_large",
            "Request body exceeds the allowed size",
        ));
    }

    let mut body = buffer[head_end..].to_vec();
    while body.len() < content_length {
        let read = match stream.read(&mut chunk).await {
            Ok(0) => break,
            Ok(read) => read,
            Err(error) => {
                return Err(http::error_response(
                    "400 Bad Request",
                    "io",
                    &error.to_string(),
                ))
            }
        };
        body.extend_from_slice(&chunk[..read]);
        if body.len() > MAX_BODY_BYTES {
            return Err(http::error_response(
                "413 Payload Too Large",
                "body_too_large",
                "Request body exceeds the allowed size",
            ));
        }
    }
    body.truncate(content_length);

    let request: RpcRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => {
            return Err(http::error_response(
                "400 Bad Request",
                "invalid_json",
                &error.to_string(),
            ))
        }
    };

    match handlers::dispatch(
        context.app.as_ref(),
        &context.workspace_path,
        &request.method,
        request.params,
    )
    .await
    {
        Ok(result) => Ok(http::success_response(result)),
        Err(RpcError {
            status,
            code,
            message,
        }) => Err(http::error_response(status, &code, &message)),
    }
}

/// Returns the index just past the blank line terminating the request head.
fn find_head_end(buffer: &[u8]) -> Option<usize> {
    buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn head_end_points_past_the_blank_line() {
        let raw = b"POST /rpc HTTP/1.1\r\nHost: x\r\n\r\n{}";
        let index = find_head_end(raw).expect("head end");
        assert_eq!(&raw[index..], b"{}");
    }

    #[test]
    fn head_end_is_none_while_headers_are_incomplete() {
        assert!(find_head_end(b"POST /rpc HTTP/1.1\r\nHost: x\r\n").is_none());
    }

    /// Drives one request through the real socket path: bind, serve, connect,
    /// send raw HTTP, read the response. Covers the wiring between the accept
    /// loop, the auth check, and dispatch, which the unit tests above stub out.
    fn serve_one(raw_request: &str, token: &str, workspace_path: &str) -> String {
        use tokio::io::AsyncReadExt as _;

        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("build runtime");

        runtime.block_on(async move {
            let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
            let port = listener.local_addr().expect("addr").port();
            let context = Arc::new(RequestContext {
                token: token.to_string(),
                port,
                workspace_path: workspace_path.to_string(),
                // No app handle in tests: requests that survive auth and routing
                // stop at dispatch, which is what these cases assert on.
                app: None,
            });

            let server = tokio::spawn(async move {
                let (stream, _) = listener.accept().await.expect("accept");
                handle_connection(stream, context).await;
            });

            let mut client = TcpStream::connect(("127.0.0.1", port))
                .await
                .expect("connect");
            let request = raw_request.replace("{PORT}", &port.to_string());
            client
                .write_all(request.as_bytes())
                .await
                .expect("write request");

            let mut response = String::new();
            client
                .read_to_string(&mut response)
                .await
                .expect("read response");
            server.await.expect("server task");
            response
        })
    }

    fn rpc_request(body: &str, authorization: Option<&str>) -> String {
        let auth = authorization
            .map(|value| format!("Authorization: {value}\r\n"))
            .unwrap_or_default();
        format!(
            "POST /rpc HTTP/1.1\r\nHost: 127.0.0.1:{{PORT}}\r\n{auth}Content-Length: {len}\r\n\r\n{body}",
            len = body.len()
        )
    }

    #[test]
    fn served_request_without_a_token_is_rejected() {
        let response = serve_one(
            &rpc_request(r#"{"method":"notes.list"}"#, None),
            "secret",
            "/tmp/nevo-does-not-exist",
        );
        assert!(response.starts_with("HTTP/1.1 403 Forbidden"), "{response}");
        assert!(response.contains("missing_token"), "{response}");
    }

    #[test]
    fn served_request_with_a_valid_token_reaches_the_permission_gate() {
        // The workspace has no settings file, so the mode resolves to `Off` and
        // dispatch denies — proving the request got past auth and routing.
        let response = serve_one(
            &rpc_request(r#"{"method":"notes.list"}"#, Some("Bearer secret")),
            "secret",
            "/tmp/nevo-does-not-exist",
        );
        assert!(response.starts_with("HTTP/1.1 403 Forbidden"), "{response}");
        assert!(response.contains("bridge_disabled"), "{response}");
    }

    #[test]
    fn served_get_request_is_rejected_as_method_not_allowed() {
        let response = serve_one(
            "GET /rpc HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nAuthorization: Bearer secret\r\n\r\n",
            "secret",
            "/tmp/nevo-does-not-exist",
        );
        assert!(
            response.starts_with("HTTP/1.1 405 Method Not Allowed"),
            "{response}"
        );
    }

    #[test]
    fn rpc_request_defaults_missing_params_to_null() {
        let request: RpcRequest =
            serde_json::from_str(r#"{"method":"notes.list"}"#).expect("parse");
        assert_eq!(request.method, "notes.list");
        assert!(request.params.is_null());
    }
}
