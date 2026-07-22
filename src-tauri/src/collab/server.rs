use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    Arc,
};
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio_tungstenite::tungstenite::{
    handshake::server::{Request, Response},
    protocol::{frame::coding::CloseCode, CloseFrame, WebSocketConfig},
    Message,
};
use uuid::Uuid;

static CLIENT_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
const MAX_CONNECTIONS: usize = 64;
const MAX_ROOMS: usize = 128;
const MAX_CLIENTS_PER_ROOM: usize = 16;
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

struct ConnectionGuard(Arc<AtomicUsize>);

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

struct Room {
    tx: broadcast::Sender<(u64, Vec<u8>)>,
    /// Number of clients currently subscribed to this room. Used to garbage
    /// collect empty rooms from `CollabAppState::rooms` when the last client
    /// disconnects, so long-running sessions with many short-lived rooms
    /// don't leak memory.
    clients: AtomicUsize,
}

impl Room {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(512);
        Room {
            tx,
            clients: AtomicUsize::new(0),
        }
    }
}

struct ServerHandle {
    shutdown_tx: oneshot::Sender<()>,
    port: u16,
    local_ip: String,
    session_token: String,
}

pub struct CollabAppState {
    handle: Mutex<Option<ServerHandle>>,
    rooms: Arc<DashMap<String, Room>>,
    connections: Arc<AtomicUsize>,
}

impl CollabAppState {
    pub fn new() -> Self {
        CollabAppState {
            handle: Mutex::new(None),
            rooms: Arc::new(DashMap::new()),
            connections: Arc::new(AtomicUsize::new(0)),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CollabServerInfo {
    pub url: String,
    pub local_ip: String,
    pub port: u16,
    pub session_token: String,
}

fn get_local_ip() -> String {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok();
    socket
        .and_then(|s| {
            s.connect("8.8.8.8:80").ok()?;
            s.local_addr().ok().map(|a| a.ip().to_string())
        })
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

/// Marker subprotocol offered by the client alongside the session token, and
/// echoed back on success so browsers accept the handshake. Must match
/// `COLLAB_SUBPROTOCOL` in `src/editor-core/collaboration/yWebSocket.ts`.
const COLLAB_SUBPROTOCOL: &str = "nevo-collab-v1";

/// Extract the session token. Preferred transport is the
/// `Sec-WebSocket-Protocol` header (keeps the token out of the URL); the legacy
/// `?token=` query parameter is still accepted as a fallback.
fn request_token(request: &Request) -> Option<String> {
    if let Some(protocols) = request
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
    {
        if let Some(token) = protocols
            .split(',')
            .map(|entry| entry.trim())
            .find(|entry| !entry.is_empty() && *entry != COLLAB_SUBPROTOCOL)
        {
            return Some(token.to_string());
        }
    }
    request.uri().query()?.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key == "token").then_some(value.to_string())
    })
}

/// Whether the client offered the marker subprotocol, meaning the server must
/// echo it in the response for the browser to accept the connection.
fn offered_collab_subprotocol(request: &Request) -> bool {
    request
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .map(|protocols| {
            protocols
                .split(',')
                .any(|entry| entry.trim() == COLLAB_SUBPROTOCOL)
        })
        .unwrap_or(false)
}

fn allowed_origin(request: &Request) -> bool {
    let Some(origin) = request
        .headers()
        .get("origin")
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    matches!(
        origin,
        "tauri://localhost"
            | "http://tauri.localhost"
            | "https://tauri.localhost"
            | "http://localhost:1420"
            | "http://127.0.0.1:1420"
    )
}

fn rejection(
    status: u16,
    message: &str,
) -> tokio_tungstenite::tungstenite::handshake::server::ErrorResponse {
    let mut response = tokio_tungstenite::tungstenite::handshake::server::ErrorResponse::new(Some(
        message.to_string(),
    ));
    if let Ok(status) = tokio_tungstenite::tungstenite::http::StatusCode::from_u16(status) {
        *response.status_mut() = status;
    }
    response
}

fn valid_room_name(room: &str) -> bool {
    !room.is_empty()
        && room.len() <= 128
        && room
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

async fn close_with_policy(
    write: &mut (impl futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error>
              + Unpin),
    reason: &'static str,
) {
    let _ = write
        .send(Message::Close(Some(CloseFrame {
            code: CloseCode::Policy,
            reason: Cow::Borrowed(reason),
        })))
        .await;
}

#[allow(clippy::result_large_err)]
async fn handle_client(
    stream: tokio::net::TcpStream,
    rooms: Arc<DashMap<String, Room>>,
    session_token: Arc<String>,
    connections: Arc<AtomicUsize>,
) {
    let _connection_guard = ConnectionGuard(connections);
    let client_id = CLIENT_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
    let mut room_name = String::new();
    let token_for_handshake = session_token.clone();
    let config = WebSocketConfig {
        max_message_size: Some(MAX_MESSAGE_BYTES),
        max_frame_size: Some(MAX_MESSAGE_BYTES),
        max_write_buffer_size: MAX_MESSAGE_BYTES * 2,
        ..Default::default()
    };

    let ws_result = tokio_tungstenite::accept_hdr_async_with_config(
        stream,
        |req: &Request, mut resp: Response| {
            if request_token(req).as_deref() != Some(token_for_handshake.as_str()) {
                return Err(rejection(401, "invalid collaboration token"));
            }
            if !allowed_origin(req) {
                return Err(rejection(403, "invalid collaboration origin"));
            }
            room_name = req.uri().path().trim_start_matches('/').to_string();
            if !valid_room_name(&room_name) {
                return Err(rejection(400, "invalid collaboration room"));
            }
            if offered_collab_subprotocol(req) {
                resp.headers_mut().insert(
                    tokio_tungstenite::tungstenite::http::header::SEC_WEBSOCKET_PROTOCOL,
                    tokio_tungstenite::tungstenite::http::HeaderValue::from_static(
                        COLLAB_SUBPROTOCOL,
                    ),
                );
            }
            Ok(resp)
        },
        Some(config),
    )
    .await;

    let ws = match ws_result {
        Ok(ws) => ws,
        Err(_) => return,
    };

    if !rooms.contains_key(&room_name) && rooms.len() >= MAX_ROOMS {
        let (mut write, _) = ws.split();
        close_with_policy(&mut write, "server room limit reached").await;
        return;
    }

    let room = rooms.entry(room_name.clone()).or_insert_with(Room::new);
    let previous_clients = room.clients.fetch_add(1, Ordering::SeqCst);
    if previous_clients >= MAX_CLIENTS_PER_ROOM {
        room.clients.fetch_sub(1, Ordering::SeqCst);
        drop(room);
        let (mut write, _) = ws.split();
        close_with_policy(&mut write, "room client limit reached").await;
        return;
    }
    let tx = room.tx.clone();
    let mut rx = tx.subscribe();
    drop(room);

    let (mut write, mut read) = ws.split();

    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Binary(data))) => {
                        let _ = tx.send((client_id, data));
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = write.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
            relay = rx.recv() => {
                match relay {
                    Ok((sender_id, data)) => {
                        if sender_id != client_id
                            && write.send(Message::Binary(data)).await.is_err()
                        {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        close_with_policy(&mut write, "resync required after relay lag").await;
                        break;
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    // The client disconnected (or the connection failed): drop it from the
    // room's client count and, if it was the last one, remove the room
    // entirely. `remove_if` re-checks the count under the shard lock so a
    // client joining between our decrement and the removal call is never
    // lost.
    if let Some(room) = rooms.get(&room_name) {
        room.clients.fetch_sub(1, Ordering::SeqCst);
    }
    rooms.remove_if(&room_name, |_, room| {
        room.clients.load(Ordering::SeqCst) == 0
    });
}

async fn run_server(
    port: u16,
    rooms: Arc<DashMap<String, Room>>,
    session_token: Arc<String>,
    connections: Arc<AtomicUsize>,
    mut shutdown_rx: oneshot::Receiver<()>,
    bind_result_tx: oneshot::Sender<Result<(), String>>,
) {
    // LAN hosting intentionally binds all interfaces. Authentication, origin
    // validation and frame/connection limits are enforced before a peer can
    // subscribe to a room.
    let addr = format!("0.0.0.0:{}", port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            let _ = bind_result_tx.send(Err(e.to_string()));
            return;
        }
    };
    let _ = bind_result_tx.send(Ok(()));

    loop {
        tokio::select! {
            accept = listener.accept() => {
                match accept {
                    Ok((stream, _)) => {
                        if connections.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
                            connections.fetch_sub(1, Ordering::SeqCst);
                            drop(stream);
                            continue;
                        }
                        let rooms = rooms.clone();
                        let session_token = session_token.clone();
                        let connections = connections.clone();
                        tokio::spawn(handle_client(stream, rooms, session_token, connections));
                    }
                    Err(_) => break,
                }
            }
            _ = &mut shutdown_rx => break,
        }
    }
}

#[tauri::command]
pub async fn start_collab_server(
    port: u16,
    state: tauri::State<'_, CollabAppState>,
) -> Result<CollabServerInfo, String> {
    let mut handle = state.handle.lock().await;
    if let Some(existing) = handle.as_ref() {
        return Ok(CollabServerInfo {
            url: format!("ws://{}:{}", existing.local_ip, existing.port),
            local_ip: existing.local_ip.clone(),
            port: existing.port,
            session_token: existing.session_token.clone(),
        });
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (bind_tx, bind_rx) = oneshot::channel();
    let local_ip = get_local_ip();
    let rooms = state.rooms.clone();
    let connections = state.connections.clone();
    let session_token = Uuid::new_v4().to_string();

    tokio::spawn(run_server(
        port,
        rooms,
        Arc::new(session_token.clone()),
        connections,
        shutdown_rx,
        bind_tx,
    ));

    // Wait for the server task to actually bind before reporting success, so a
    // port conflict (or other bind failure) surfaces to the frontend instead
    // of being silently swallowed while the caller believes the server is up.
    match bind_rx.await {
        Ok(Ok(())) => {}
        Ok(Err(err)) => return Err(format!("Failed to start collab server: {err}")),
        Err(_) => return Err("Collab server task exited before binding".to_string()),
    }

    let info = CollabServerInfo {
        url: format!("ws://{}:{}", local_ip, port),
        local_ip: local_ip.clone(),
        port,
        session_token: session_token.clone(),
    };

    *handle = Some(ServerHandle {
        shutdown_tx,
        port,
        local_ip,
        session_token,
    });

    Ok(info)
}

#[tauri::command]
pub async fn stop_collab_server(state: tauri::State<'_, CollabAppState>) -> Result<(), String> {
    let mut handle = state.handle.lock().await;
    if let Some(h) = handle.take() {
        let _ = h.shutdown_tx.send(());
    }
    state.rooms.clear();
    Ok(())
}

#[tauri::command]
pub async fn get_collab_server_info(
    state: tauri::State<'_, CollabAppState>,
) -> Result<Option<CollabServerInfo>, String> {
    let handle = state.handle.lock().await;
    Ok(handle.as_ref().map(|h| CollabServerInfo {
        url: format!("ws://{}:{}", h.local_ip, h.port),
        local_ip: h.local_ip.clone(),
        port: h.port,
        session_token: h.session_token.clone(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    fn free_port() -> u16 {
        std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }

    /// A bind failure (e.g. the port is already in use) must be reported back
    /// to the caller instead of the server task silently exiting while
    /// `start_collab_server` reports success.
    #[tokio::test]
    async fn run_server_reports_bind_failure() {
        let blocker = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = blocker.local_addr().unwrap().port();

        let rooms: Arc<DashMap<String, Room>> = Arc::new(DashMap::new());
        let (_shutdown_tx, shutdown_rx) = oneshot::channel();
        let (bind_tx, bind_rx) = oneshot::channel();

        let task = tokio::spawn(run_server(
            port,
            rooms,
            Arc::new("test-token".to_string()),
            Arc::new(AtomicUsize::new(0)),
            shutdown_rx,
            bind_tx,
        ));

        let result = bind_rx.await.expect("bind_result_tx must not be dropped");
        assert!(
            result.is_err(),
            "binding an already-occupied port must report an error"
        );

        drop(blocker);
        task.abort();
    }

    /// When the last client of a room disconnects, the room must be removed
    /// from `rooms` so long-lived servers with many short sessions don't leak
    /// memory.
    #[tokio::test]
    async fn room_is_garbage_collected_after_last_client_disconnects() {
        let port = free_port();
        let rooms: Arc<DashMap<String, Room>> = Arc::new(DashMap::new());
        let connections = Arc::new(AtomicUsize::new(0));
        let (_shutdown_tx, shutdown_rx) = oneshot::channel();
        let (bind_tx, bind_rx) = oneshot::channel();

        let rooms_for_server = rooms.clone();
        tokio::spawn(run_server(
            port,
            rooms_for_server,
            Arc::new("test-token".to_string()),
            connections,
            shutdown_rx,
            bind_tx,
        ));
        bind_rx
            .await
            .expect("bind_result_tx must not be dropped")
            .expect("server must bind on a free port");

        let url = format!("ws://127.0.0.1:{port}/test-room?token=test-token");
        let mut request = url.into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", "http://tauri.localhost".parse().unwrap());
        let (ws_stream, _) = tokio_tungstenite::connect_async(request)
            .await
            .expect("client should connect");

        let mut attempts = 0;
        while rooms
            .get("test-room")
            .map(|r| r.clients.load(Ordering::SeqCst))
            != Some(1)
            && attempts < 50
        {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            attempts += 1;
        }
        assert_eq!(
            rooms
                .get("test-room")
                .map(|r| r.clients.load(Ordering::SeqCst)),
            Some(1),
            "room should register the connected client"
        );

        drop(ws_stream);

        let mut attempts = 0;
        while rooms.contains_key("test-room") && attempts < 50 {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            attempts += 1;
        }
        assert!(
            !rooms.contains_key("test-room"),
            "empty room should be garbage collected after the last client disconnects"
        );
    }

    #[tokio::test]
    async fn server_rejects_missing_or_invalid_tokens() {
        let port = free_port();
        let rooms: Arc<DashMap<String, Room>> = Arc::new(DashMap::new());
        let (_shutdown_tx, shutdown_rx) = oneshot::channel();
        let (bind_tx, bind_rx) = oneshot::channel();
        tokio::spawn(run_server(
            port,
            rooms,
            Arc::new("expected-token".to_string()),
            Arc::new(AtomicUsize::new(0)),
            shutdown_rx,
            bind_tx,
        ));
        bind_rx.await.unwrap().unwrap();

        for token in [None, Some("wrong-token")] {
            let suffix = token
                .map(|token| format!("?token={token}"))
                .unwrap_or_default();
            let mut request = format!("ws://127.0.0.1:{port}/test-room{suffix}")
                .into_client_request()
                .unwrap();
            request
                .headers_mut()
                .insert("origin", "http://tauri.localhost".parse().unwrap());
            assert!(tokio_tungstenite::connect_async(request).await.is_err());
        }
    }

    #[test]
    fn request_token_prefers_subprotocol_over_query() {
        let request = tokio_tungstenite::tungstenite::http::Request::builder()
            .uri("ws://127.0.0.1/test-room?token=query-token")
            .header("sec-websocket-protocol", "nevo-collab-v1, header-token")
            .body(())
            .unwrap();
        assert_eq!(request_token(&request).as_deref(), Some("header-token"));
        assert!(offered_collab_subprotocol(&request));
    }

    #[test]
    fn request_token_falls_back_to_query_without_subprotocol() {
        let request = tokio_tungstenite::tungstenite::http::Request::builder()
            .uri("ws://127.0.0.1/test-room?token=query-token")
            .body(())
            .unwrap();
        assert_eq!(request_token(&request).as_deref(), Some("query-token"));
        assert!(!offered_collab_subprotocol(&request));
    }

    /// The token can travel in `Sec-WebSocket-Protocol` (keeping it out of the
    /// URL); the server must accept it and echo the marker subprotocol so the
    /// browser completes the handshake.
    #[tokio::test]
    async fn server_accepts_token_via_subprotocol_and_echoes_it() {
        let port = free_port();
        let rooms: Arc<DashMap<String, Room>> = Arc::new(DashMap::new());
        let (_shutdown_tx, shutdown_rx) = oneshot::channel();
        let (bind_tx, bind_rx) = oneshot::channel();
        tokio::spawn(run_server(
            port,
            rooms,
            Arc::new("expected-token".to_string()),
            Arc::new(AtomicUsize::new(0)),
            shutdown_rx,
            bind_tx,
        ));
        bind_rx.await.unwrap().unwrap();

        let mut request = format!("ws://127.0.0.1:{port}/test-room")
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("origin", "http://tauri.localhost".parse().unwrap());
        request.headers_mut().insert(
            "sec-websocket-protocol",
            "nevo-collab-v1, expected-token".parse().unwrap(),
        );
        let (_stream, response) = tokio_tungstenite::connect_async(request)
            .await
            .expect("client should connect using a subprotocol token");
        assert_eq!(
            response
                .headers()
                .get("sec-websocket-protocol")
                .and_then(|value| value.to_str().ok()),
            Some("nevo-collab-v1"),
            "server must echo the marker subprotocol"
        );
    }
}
