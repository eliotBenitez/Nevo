use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    Arc,
};
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio_tungstenite::tungstenite::Message;

static CLIENT_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

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
}

pub struct CollabAppState {
    handle: Mutex<Option<ServerHandle>>,
    rooms: Arc<DashMap<String, Room>>,
}

impl CollabAppState {
    pub fn new() -> Self {
        CollabAppState {
            handle: Mutex::new(None),
            rooms: Arc::new(DashMap::new()),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CollabServerInfo {
    pub url: String,
    pub local_ip: String,
    pub port: u16,
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

async fn handle_client(stream: tokio::net::TcpStream, rooms: Arc<DashMap<String, Room>>) {
    let client_id = CLIENT_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
    let mut room_name = String::new();

    let ws_result = tokio_tungstenite::accept_hdr_async(
        stream,
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         resp: tokio_tungstenite::tungstenite::handshake::server::Response| {
            room_name = req.uri().path().trim_start_matches('/').to_string();
            Ok(resp)
        },
    )
    .await;

    let ws = match ws_result {
        Ok(ws) => ws,
        Err(_) => return,
    };

    if room_name.is_empty() {
        return;
    }

    let room = rooms.entry(room_name.clone()).or_insert_with(Room::new);
    room.clients.fetch_add(1, Ordering::SeqCst);
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
                        if sender_id != client_id {
                            if write.send(Message::Binary(data)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
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
    mut shutdown_rx: oneshot::Receiver<()>,
    bind_result_tx: oneshot::Sender<Result<(), String>>,
) {
    // Binds on all interfaces so devices elsewhere on the LAN can join a
    // hosted session (this mirrors `startHosting`/`joinSession` in
    // `src/stores/collab.ts`, which hands the resulting `ws://<lan-ip>:<port>`
    // URL to other devices). There is no authentication on top of the room
    // path today: any client on the same network that learns/guesses a room
    // name (`note-<uuid>`) can join it. Adding a mandatory token would require
    // updating the y-websocket client URL construction in
    // `src/editor-core/collaboration/yWebSocket.ts` and `joinSession`, which is
    // out of scope for this security pass (see security backlog: collab auth).
    // TODO(security-backlog): add optional token-based room authentication.
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
                        let rooms = rooms.clone();
                        tokio::spawn(handle_client(stream, rooms));
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
    if handle.is_some() {
        let existing = handle.as_ref().unwrap();
        return Ok(CollabServerInfo {
            url: format!("ws://{}:{}", existing.local_ip, existing.port),
            local_ip: existing.local_ip.clone(),
            port: existing.port,
        });
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (bind_tx, bind_rx) = oneshot::channel();
    let local_ip = get_local_ip();
    let rooms = state.rooms.clone();

    tokio::spawn(run_server(port, rooms, shutdown_rx, bind_tx));

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
    };

    *handle = Some(ServerHandle {
        shutdown_tx,
        port,
        local_ip,
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
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

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

        let task = tokio::spawn(run_server(port, rooms, shutdown_rx, bind_tx));

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
        let (_shutdown_tx, shutdown_rx) = oneshot::channel();
        let (bind_tx, bind_rx) = oneshot::channel();

        let rooms_for_server = rooms.clone();
        tokio::spawn(run_server(port, rooms_for_server, shutdown_rx, bind_tx));
        bind_rx
            .await
            .expect("bind_result_tx must not be dropped")
            .expect("server must bind on a free port");

        let url = format!("ws://127.0.0.1:{port}/test-room");
        let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
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
}
