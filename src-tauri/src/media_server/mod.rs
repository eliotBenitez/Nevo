//! Lightweight localhost HTTP server for streaming workspace media assets.
//!
//! WebKitGTK's `<video>` element cannot play from the `asset://` custom URI scheme
//! (GStreamer needs HTTP range-request streaming). This minimal HTTP/1.1 server
//! serves files under `.nevo/assets/` from `http://127.0.0.1:<port>` with proper
//! `Range` support, which the webview's media backend handles natively.
//!
//! Security: binds to loopback only; a random per-session token is required, and
//! only paths containing `/.nevo/assets/` that exist as files are served.

use std::path::Path;
use std::sync::OnceLock;

use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaServerInfo {
    pub port: u16,
    pub token: String,
}

static SERVER: OnceLock<MediaServerInfo> = OnceLock::new();

const CHUNK: usize = 64 * 1024;

fn random_token() -> String {
    // 128-bit random token derived from two UUIDs (uuid crate already a dependency).
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn content_type_for(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogv" => "video/ogg",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        _ => "application/octet-stream",
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    out.push((hi * 16 + lo) as u8);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parse `token` and `path` query params from a `GET /asset?...` request line target.
fn parse_query(target: &str) -> (Option<String>, Option<String>) {
    let query = match target.split_once('?') {
        Some((_, q)) => q,
        None => return (None, None),
    };
    let mut token = None;
    let mut path = None;
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            match k {
                "token" => token = Some(percent_decode(v)),
                "path" => path = Some(percent_decode(v)),
                _ => {}
            }
        }
    }
    (token, path)
}

/// Expand a leading `~` to the user's home directory. The frontend passes the
/// workspace path verbatim (which may be stored as `~/...`), and `File::open`
/// does not expand `~` itself — without this the server 404s on every asset.
fn expand_tilde(path: &str) -> String {
    if path == "~" || path.starts_with("~/") {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let home = home.to_string_lossy();
            let home = home.trim_end_matches('/');
            if path == "~" {
                return home.to_string();
            }
            return format!("{}/{}", home, &path["~/".len()..]);
        }
    }
    path.to_string()
}

fn is_valid_youtube_id(id: &str) -> bool {
    id.len() == 11
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

async fn serve_youtube_embed(stream: &mut TcpStream, id: &str) {
    // referrerpolicy=strict-origin-when-cross-origin makes the embedded player
    // receive a valid `Referer: http://127.0.0.1:<port>/` header. Without it the
    // webview strips the referrer and YouTube fails with "error 153".
    let html = format!(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\">\
        <meta name=\"referrer\" content=\"strict-origin-when-cross-origin\"><style>\
        *{{margin:0;padding:0;box-sizing:border-box}}body{{background:#000;overflow:hidden}}\
        iframe{{width:100vw;height:100vh;border:none}}</style></head><body>\
        <iframe src=\"https://www.youtube-nocookie.com/embed/{id}?rel=0\" \
        referrerpolicy=\"strict-origin-when-cross-origin\" \
        allow=\"accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share\" \
        allowfullscreen></iframe></body></html>",
        id = id
    );
    let body = html.as_bytes();
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
        Content-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

/// Parse a single `bytes=start-end` range. Returns (start, Option<end>).
fn parse_range(headers: &str, total: u64) -> Option<(u64, u64)> {
    let line = headers
        .lines()
        .find(|l| l.to_ascii_lowercase().starts_with("range:"))?;
    let spec = line.split_once(':')?.1.trim();
    let spec = spec.strip_prefix("bytes=")?;
    let (start_s, end_s) = spec.split_once('-')?;
    if start_s.is_empty() {
        // suffix range: last N bytes
        let n: u64 = end_s.trim().parse().ok()?;
        if n == 0 {
            return None;
        }
        let start = total.saturating_sub(n);
        return Some((start, total - 1));
    }
    let start: u64 = start_s.trim().parse().ok()?;
    let end: u64 = if end_s.trim().is_empty() {
        total - 1
    } else {
        end_s.trim().parse().ok()?
    };
    if start > end || start >= total {
        return None;
    }
    Some((start, end.min(total - 1)))
}

async fn write_simple(stream: &mut TcpStream, status: &str) {
    let body = status.as_bytes();
    let resp = format!(
        "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        status,
        body.len()
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

async fn handle(mut stream: TcpStream, token: String) {
    // Read headers (until CRLF CRLF), cap at 16 KiB.
    let mut buf = Vec::with_capacity(2048);
    let mut tmp = [0u8; 2048];
    loop {
        let n = match stream.read(&mut tmp).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => return,
        };
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if buf.len() > 16 * 1024 {
            break;
        }
    }
    let headers = String::from_utf8_lossy(&buf);
    let request_line = headers.lines().next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");

    if method != "GET" && method != "HEAD" {
        write_simple(&mut stream, "405 Method Not Allowed").await;
        return;
    }

    // YouTube embed proxy — no token needed, only serves static HTML.
    if target.starts_with("/youtube?") || target == "/youtube" {
        let id = target
            .split_once('?')
            .and_then(|(_, q)| q.split('&').find_map(|p| p.strip_prefix("id=")))
            .map(percent_decode)
            .unwrap_or_default();
        if is_valid_youtube_id(&id) {
            serve_youtube_embed(&mut stream, &id).await;
        } else {
            write_simple(&mut stream, "400 Bad Request").await;
        }
        return;
    }

    let (req_token, req_path) = parse_query(target);
    if req_token.as_deref() != Some(token.as_str()) {
        write_simple(&mut stream, "403 Forbidden").await;
        return;
    }
    let path = match req_path {
        Some(p) => expand_tilde(&p),
        None => {
            write_simple(&mut stream, "400 Bad Request").await;
            return;
        }
    };

    // Only allow asset files; reject traversal. Canonicalize first so symlinks
    // and `..` segments are resolved before we check that the real path is still
    // inside a `.nevo/assets` directory.
    let canonical = match std::fs::canonicalize(&path) {
        Ok(p) => p,
        Err(_) => {
            write_simple(&mut stream, "404 Not Found").await;
            return;
        }
    };
    let canonical_str = canonical.to_string_lossy().replace('\\', "/");
    if !canonical_str.contains("/.nevo/assets/") || !canonical.is_file() {
        write_simple(&mut stream, "403 Forbidden").await;
        return;
    }
    let path = canonical_str;

    let mut file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => {
            write_simple(&mut stream, "404 Not Found").await;
            return;
        }
    };
    let total = match file.metadata().await {
        Ok(m) if m.is_file() => m.len(),
        _ => {
            write_simple(&mut stream, "404 Not Found").await;
            return;
        }
    };

    let ctype = content_type_for(&path);
    let range = parse_range(&headers, total);

    let (status, start, end) = match range {
        Some((s, e)) => ("206 Partial Content", s, e),
        None => ("200 OK", 0, total.saturating_sub(1)),
    };
    let length = if total == 0 { 0 } else { end - start + 1 };

    let mut head = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: {ctype}\r\n\
         Accept-Ranges: bytes\r\n\
         Content-Length: {length}\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n"
    );
    if range.is_some() {
        head.push_str(&format!("Content-Range: bytes {start}-{end}/{total}\r\n"));
    }
    head.push_str("\r\n");

    if stream.write_all(head.as_bytes()).await.is_err() {
        return;
    }
    if method == "HEAD" || length == 0 {
        return;
    }

    if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return;
    }

    let mut remaining = length;
    let mut chunk = vec![0u8; CHUNK];
    while remaining > 0 {
        let want = remaining.min(CHUNK as u64) as usize;
        let n = match file.read(&mut chunk[..want]).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        if stream.write_all(&chunk[..n]).await.is_err() {
            break;
        }
        remaining -= n as u64;
    }
    let _ = stream.flush().await;
}

async fn run(listener: TcpListener, token: String) {
    while let Ok((stream, _)) = listener.accept().await {
        let token = token.clone();
        tokio::spawn(handle(stream, token));
    }
}

/// Start the media server once and return its connection info. Idempotent.
pub fn ensure_started() -> Result<MediaServerInfo, String> {
    if let Some(info) = SERVER.get() {
        return Ok(info.clone());
    }
    let token = random_token();

    // Bind synchronously to obtain the port before spawning the async loop.
    let std_listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    std_listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;
    let port = std_listener.local_addr().map_err(|e| e.to_string())?.port();

    let token_for_task = token.clone();
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(_) => return,
        };
        rt.block_on(async move {
            let listener = match TcpListener::from_std(std_listener) {
                Ok(l) => l,
                Err(_) => return,
            };
            run(listener, token_for_task).await;
        });
    });

    let info = MediaServerInfo { port, token };
    let _ = SERVER.set(info.clone());
    Ok(info)
}

#[tauri::command]
pub fn get_media_server_info() -> Result<MediaServerInfo, String> {
    ensure_started()
}
