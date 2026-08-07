// One-shot loopback listener for the OAuth redirect.
//
// `start_oauth_loopback` spins up a localhost HTTP listener that the relay
// redirects the browser to after a successful OAuth exchange; the tokens
// arrive as query params and are emitted to the frontend via an event.

use std::collections::HashMap;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OAuthCallback {
    access: String,
    refresh: String,
}

const SUCCESS_BODY: &str = "<!doctype html><html><head><meta charset=utf-8><title>Signed in</title>\
<style>body{font-family:system-ui;background:#0b0b0f;color:#e8e8ef;display:grid;place-items:center;height:100vh;margin:0}\
.card{text-align:center}</style></head><body><div class=card><h2>You're signed in</h2>\
<p>You can close this tab and return to Nevo.</p></div></body></html>";

/// Start a loopback listener on 127.0.0.1 and return its port. The relay must
/// redirect to http://127.0.0.1:{port}/callback?access=..&refresh=.. The first
/// matching request emits an `oauth-callback` event and the listener stops.
#[tauri::command]
pub async fn start_oauth_loopback(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    tokio::spawn(async move {
        // Accept connections until we see a /callback with tokens (max a few tries).
        for _ in 0..10 {
            let Ok((mut stream, _)) = listener.accept().await else {
                break;
            };
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).await.unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);
            let query = parse_callback_query(&request);

            let (access, refresh) = (
                query.get("access").cloned().unwrap_or_default(),
                query.get("refresh").cloned().unwrap_or_default(),
            );

            let body = SUCCESS_BODY.as_bytes();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes()).await;
            let _ = stream.write_all(body).await;
            let _ = stream.flush().await;

            if !access.is_empty() && !refresh.is_empty() {
                let _ = app.emit("oauth-callback", OAuthCallback { access, refresh });
                break;
            }
        }
    });

    Ok(port)
}

/// Parse the query string from the request line of a `/callback` GET request.
fn parse_callback_query(request: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Some(line) = request.lines().next() else {
        return out;
    };
    // "GET /callback?access=..&refresh=.. HTTP/1.1"
    let Some(path) = line.split_whitespace().nth(1) else {
        return out;
    };
    let Some(qs) = path.split_once('?').map(|(_, q)| q) else {
        return out;
    };
    for pair in qs.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            out.insert(k.to_string(), urldecode(v));
        }
    }
    out
}

fn urldecode(s: &str) -> String {
    // Byte-based decode (rather than pushing decoded bytes as `char`s) so that
    // percent-encoded multi-byte UTF-8 sequences (e.g. non-ASCII redirect params)
    // are recomposed correctly instead of being mangled into separate Latin-1 chars.
    let replaced = s.replace('+', " ");
    let bytes = replaced.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
