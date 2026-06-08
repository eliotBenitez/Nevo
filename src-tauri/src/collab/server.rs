use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio_tungstenite::tungstenite::Message;

static CLIENT_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

struct Room {
    tx: broadcast::Sender<(u64, Vec<u8>)>,
}

impl Room {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(512);
        Room { tx }
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
}

async fn run_server(
    port: u16,
    rooms: Arc<DashMap<String, Room>>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(_) => return,
    };

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
    let local_ip = get_local_ip();
    let rooms = state.rooms.clone();

    tokio::spawn(run_server(port, rooms, shutdown_rx));

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
