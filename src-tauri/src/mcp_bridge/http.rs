//! Minimal HTTP/1.1 request parsing and response formatting for the bridge.
//!
//! Kept separate from the socket loop in `server.rs` so the parsing and
//! authentication rules are unit-testable without binding a port.

use std::collections::HashMap;

pub const MAX_HEAD_BYTES: usize = 16 * 1024;
pub const MAX_BODY_BYTES: usize = 1024 * 1024;

/// The single endpoint the bridge exposes. Anything else is a 404.
pub const RPC_PATH: &str = "/rpc";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestHead {
    pub method: String,
    pub target: String,
    pub headers: HashMap<String, String>,
}

impl RequestHead {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .get(&name.to_ascii_lowercase())
            .map(String::as_str)
    }

    pub fn content_length(&self) -> Option<usize> {
        self.header("content-length")?.trim().parse().ok()
    }
}

/// Parses the request line and headers. Returns `None` for a malformed head.
pub fn parse_head(raw: &str) -> Option<RequestHead> {
    let mut lines = raw.split("\r\n");
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?.to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    Some(RequestHead {
        method,
        target,
        headers,
    })
}

/// Compares two secrets without an early exit on the first differing byte.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthFailure {
    /// `Host` names something other than loopback. A browser on any site can
    /// reach 127.0.0.1, so refusing foreign Host values blocks DNS-rebinding
    /// attempts before the token is even considered.
    BadHost,
    MissingToken,
    BadToken,
}

/// Verifies that the request came from a loopback client holding the session
/// token.
pub fn authenticate(head: &RequestHead, token: &str, port: u16) -> Result<(), AuthFailure> {
    let host = head.header("host").unwrap_or_default();
    if !is_loopback_host(host, port) {
        return Err(AuthFailure::BadHost);
    }

    let authorization = head
        .header("authorization")
        .ok_or(AuthFailure::MissingToken)?;
    let presented = authorization
        .strip_prefix("Bearer ")
        .or_else(|| authorization.strip_prefix("bearer "))
        .ok_or(AuthFailure::MissingToken)?;

    if constant_time_eq(presented.trim(), token) {
        Ok(())
    } else {
        Err(AuthFailure::BadToken)
    }
}

fn is_loopback_host(host: &str, port: u16) -> bool {
    let expected_suffix = format!(":{port}");
    let Some(name) = host.strip_suffix(&expected_suffix) else {
        return false;
    };
    matches!(name, "127.0.0.1" | "localhost" | "[::1]")
}

pub fn json_response(status: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Content-Length: {len}\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\r\n{body}",
        len = body.as_bytes().len()
    )
}

/// Error envelope shared by every failure path, so the MCP server can map a
/// code to a user-facing message without parsing prose.
pub fn error_response(status: &str, code: &str, message: &str) -> String {
    let body = serde_json::json!({
        "ok": false,
        "error": { "code": code, "message": message },
    })
    .to_string();
    json_response(status, &body)
}

pub fn success_response(result: serde_json::Value) -> String {
    let body = serde_json::json!({ "ok": true, "result": result }).to_string();
    json_response("200 OK", &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn head(raw: &str) -> RequestHead {
        parse_head(raw).expect("parse head")
    }

    #[test]
    fn parses_request_line_and_headers_case_insensitively() {
        let parsed =
            head("POST /rpc HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nAUTHORIZATION: Bearer t\r\n\r\n");
        assert_eq!(parsed.method, "POST");
        assert_eq!(parsed.target, "/rpc");
        assert_eq!(parsed.header("host"), Some("127.0.0.1:9000"));
        assert_eq!(parsed.header("Authorization"), Some("Bearer t"));
    }

    #[test]
    fn rejects_malformed_request_line() {
        assert!(parse_head("GARBAGE\r\n\r\n").is_none());
        assert!(parse_head("").is_none());
    }

    #[test]
    fn accepts_loopback_host_with_valid_token() {
        let parsed = head(
            "POST /rpc HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nAuthorization: Bearer secret\r\n\r\n",
        );
        assert_eq!(authenticate(&parsed, "secret", 9000), Ok(()));
    }

    #[test]
    fn rejects_foreign_host_even_with_valid_token() {
        let parsed = head(
            "POST /rpc HTTP/1.1\r\nHost: evil.example.com\r\nAuthorization: Bearer secret\r\n\r\n",
        );
        assert_eq!(
            authenticate(&parsed, "secret", 9000),
            Err(AuthFailure::BadHost)
        );
    }

    #[test]
    fn rejects_loopback_host_on_a_different_port() {
        let parsed = head(
            "POST /rpc HTTP/1.1\r\nHost: 127.0.0.1:9001\r\nAuthorization: Bearer secret\r\n\r\n",
        );
        assert_eq!(
            authenticate(&parsed, "secret", 9000),
            Err(AuthFailure::BadHost)
        );
    }

    #[test]
    fn rejects_missing_and_wrong_tokens() {
        let missing = head("POST /rpc HTTP/1.1\r\nHost: localhost:9000\r\n\r\n");
        assert_eq!(
            authenticate(&missing, "secret", 9000),
            Err(AuthFailure::MissingToken)
        );

        let wrong = head(
            "POST /rpc HTTP/1.1\r\nHost: localhost:9000\r\nAuthorization: Bearer nope\r\n\r\n",
        );
        assert_eq!(
            authenticate(&wrong, "secret", 9000),
            Err(AuthFailure::BadToken)
        );

        let unprefixed =
            head("POST /rpc HTTP/1.1\r\nHost: localhost:9000\r\nAuthorization: secret\r\n\r\n");
        assert_eq!(
            authenticate(&unprefixed, "secret", 9000),
            Err(AuthFailure::MissingToken)
        );
    }

    #[test]
    fn reads_content_length() {
        let parsed = head("POST /rpc HTTP/1.1\r\nHost: localhost:1\r\nContent-Length: 42\r\n\r\n");
        assert_eq!(parsed.content_length(), Some(42));
        let none = head("POST /rpc HTTP/1.1\r\nHost: localhost:1\r\n\r\n");
        assert_eq!(none.content_length(), None);
    }

    #[test]
    fn constant_time_eq_matches_string_equality() {
        assert!(constant_time_eq("abc", "abc"));
        assert!(!constant_time_eq("abc", "abd"));
        assert!(!constant_time_eq("abc", "ab"));
    }
}
