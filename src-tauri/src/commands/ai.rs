use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;

const AI_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const AI_REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_AI_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_AI_STREAM_BUFFER_BYTES: usize = 1024 * 1024;
const MAX_AI_REDIRECTS: usize = 5;

// ── Request / Event types ────────────────────────────────────────────────────

fn default_provider_kind() -> String {
    "ollama".to_string()
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiCompleteRequest {
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    pub model: String,
    pub prompt: String,
    pub system: Option<String>,
    #[serde(rename = "maxTokens")]
    pub max_tokens: u32,
    #[serde(rename = "privacyMode")]
    pub privacy_mode: bool,
    #[serde(rename = "providerKind", default = "default_provider_kind")]
    pub provider_kind: String,
    #[serde(rename = "apiKey", default)]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiStreamEvent {
    Token { text: String },
    Done,
    Error { message: String },
}

// ── Small helper structs for deserialising responses ─────────────────────────

#[derive(Deserialize)]
struct OllamaGenChunk {
    response: Option<String>,
    done: Option<bool>,
}

#[derive(Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Deserialize)]
struct OllamaCompleteResponse {
    response: String,
}

// OpenAI-compatible response structs

#[derive(Deserialize)]
struct OpenAiModel {
    id: String,
}

#[derive(Deserialize)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModel>,
}

#[derive(Deserialize)]
struct OpenAiMessageContent {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessageContent,
}

#[derive(Deserialize)]
struct OpenAiCompleteResponse {
    choices: Vec<OpenAiChoice>,
}

// SSE streaming structs

#[derive(Deserialize)]
struct OpenAiDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiStreamChoice {
    delta: OpenAiDelta,
}

#[derive(Deserialize)]
struct OpenAiStreamChunk {
    choices: Vec<OpenAiStreamChoice>,
}

// ── Pure helpers (unit-testable) ─────────────────────────────────────────────

pub fn normalize_base_url(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        "http://localhost:11434".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
pub fn is_loopback_host(base_url: &str) -> bool {
    validated_base_url(base_url)
        .map(|url| url_is_loopback(&url))
        .unwrap_or(false)
}

pub fn enforce_privacy(req: &AiCompleteRequest) -> Result<(), String> {
    let url = validated_base_url(&req.base_url)?;
    if req.privacy_mode && !url_is_loopback(&url) {
        Err("AI privacy mode blocks non-local endpoints".to_string())
    } else {
        Ok(())
    }
}

fn validated_base_url(raw: &str) -> Result<reqwest::Url, String> {
    let normalized = normalize_base_url(raw);
    let url =
        reqwest::Url::parse(&normalized).map_err(|_| "Invalid AI endpoint URL".to_string())?;
    validate_http_url(&url)?;
    Ok(url)
}

fn validate_http_url(url: &reqwest::Url) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("AI endpoint must use http or https".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("AI endpoint must not contain user information".to_string());
    }
    if url.host().is_none() {
        return Err("AI endpoint must include a host".to_string());
    }
    Ok(())
}

fn url_is_loopback(url: &reqwest::Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false)
}

fn endpoint_url(base_url: &str, endpoint: &str) -> Result<reqwest::Url, String> {
    let mut base = validated_base_url(base_url)?;
    if !base.path().ends_with('/') {
        let path = format!("{}/", base.path());
        base.set_path(&path);
    }
    base.join(endpoint)
        .map_err(|_| "Invalid AI endpoint path".to_string())
}

fn build_ai_client(privacy_mode: bool) -> Result<reqwest::Client, String> {
    let redirect = reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_AI_REDIRECTS {
            return attempt.error("too many AI endpoint redirects");
        }
        if let Err(message) = validate_http_url(attempt.url()) {
            return attempt.error(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                message,
            ));
        }
        if privacy_mode && !url_is_loopback(attempt.url()) {
            return attempt.error("AI privacy mode blocked a redirect to a non-local endpoint");
        }
        attempt.follow()
    });

    reqwest::Client::builder()
        .connect_timeout(AI_CONNECT_TIMEOUT)
        .timeout(AI_REQUEST_TIMEOUT)
        .redirect(redirect)
        .build()
        .map_err(|error| error.to_string())
}

async fn response_bytes_limited(response: reqwest::Response) -> Result<Vec<u8>, String> {
    let response = response
        .error_for_status()
        .map_err(|error| error.to_string())?;
    if response
        .content_length()
        .is_some_and(|len| len > MAX_AI_RESPONSE_BYTES as u64)
    {
        return Err("AI response exceeds the 8 MiB limit".to_string());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        if bytes.len().saturating_add(chunk.len()) > MAX_AI_RESPONSE_BYTES {
            return Err("AI response exceeds the 8 MiB limit".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

/// Parse one NDJSON line from the Ollama /api/generate stream.
/// Returns Some((response_text, done)) on success, None for blank/garbage lines.
pub fn parse_ollama_line(line: &str) -> Option<(String, bool)> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let chunk: OllamaGenChunk = serde_json::from_str(line).ok()?;
    let text = chunk.response.unwrap_or_default();
    let done = chunk.done.unwrap_or(false);
    Some((text, done))
}

/// Parse one line from an OpenAI-compatible SSE stream.
#[derive(Debug, PartialEq)]
pub enum SseParsed {
    Token(String),
    Done,
    Ignore,
}

pub fn parse_sse_line(line: &str) -> SseParsed {
    let line = line.trim();
    if line.is_empty() || !line.starts_with("data:") {
        return SseParsed::Ignore;
    }

    let payload = line["data:".len()..].trim();

    if payload == "[DONE]" {
        return SseParsed::Done;
    }

    let chunk: OpenAiStreamChunk = match serde_json::from_str(payload) {
        Ok(c) => c,
        Err(_) => return SseParsed::Ignore,
    };

    if let Some(choice) = chunk.choices.into_iter().next() {
        if let Some(text) = choice.delta.content {
            if !text.is_empty() {
                return SseParsed::Token(text);
            }
        }
    }

    SseParsed::Ignore
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ai_list_models(
    base_url: String,
    provider_kind: String,
) -> Result<Vec<String>, String> {
    let client = build_ai_client(false)?;

    if provider_kind == "openai" {
        let url = endpoint_url(&base_url, "models")?;
        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
        let bytes = response_bytes_limited(resp).await?;
        let body: OpenAiModelsResponse =
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        Ok(body.data.into_iter().map(|m| m.id).collect())
    } else {
        // Ollama (default)
        let url = endpoint_url(&base_url, "api/tags")?;
        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
        let bytes = response_bytes_limited(resp).await?;
        let body: OllamaTagsResponse = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        Ok(body.models.into_iter().map(|m| m.name).collect())
    }
}

#[tauri::command]
pub async fn ai_complete(req: AiCompleteRequest) -> Result<String, String> {
    enforce_privacy(&req)?;

    let client = build_ai_client(req.privacy_mode)?;

    if req.provider_kind == "openai" {
        let url = endpoint_url(&req.base_url, "chat/completions")?;

        let mut messages = Vec::new();
        if let Some(system) = &req.system {
            messages.push(serde_json::json!({ "role": "system", "content": system }));
        }
        messages.push(serde_json::json!({ "role": "user", "content": req.prompt }));

        let body = serde_json::json!({
            "model": req.model,
            "messages": messages,
            "max_tokens": req.max_tokens,
            "stream": false,
        });

        let mut request_builder = client.post(url).json(&body);
        if let Some(key) = &req.api_key {
            if !key.is_empty() {
                request_builder =
                    request_builder.header("Authorization", format!("Bearer {}", key));
            }
        }

        let resp = request_builder.send().await.map_err(|e| e.to_string())?;
        let bytes = response_bytes_limited(resp).await?;
        let parsed: OpenAiCompleteResponse =
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;

        parsed
            .choices
            .into_iter()
            .next()
            .and_then(|c| c.message.content)
            .ok_or_else(|| "empty response from OpenAI-compatible endpoint".to_string())
    } else {
        // Ollama
        let url = endpoint_url(&req.base_url, "api/generate")?;

        let mut body = serde_json::json!({
            "model": req.model,
            "prompt": req.prompt,
            "stream": false,
            "options": { "num_predict": req.max_tokens }
        });

        if let Some(system) = &req.system {
            body["system"] = serde_json::Value::String(system.clone());
        }

        let resp = client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let bytes = response_bytes_limited(resp).await?;
        let parsed: OllamaCompleteResponse =
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        Ok(parsed.response)
    }
}

/// Drain all complete `\n`-terminated lines from a byte buffer, decoding each
/// as UTF-8 (lossy). Any trailing partial line — including an incomplete
/// multibyte character split across network chunks — stays in the buffer.
/// Splitting on the `\n` byte (0x0A) is safe: it never appears inside a UTF-8
/// multibyte sequence.
fn drain_complete_lines(buf: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
        let line: Vec<u8> = buf.drain(..=pos).collect();
        lines.push(String::from_utf8_lossy(&line).into_owned());
    }
    lines
}

#[tauri::command]
pub async fn ai_complete_stream(
    req: AiCompleteRequest,
    on_event: tauri::ipc::Channel<AiStreamEvent>,
) -> Result<(), String> {
    if let Err(e) = enforce_privacy(&req) {
        let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
        return Err(e);
    }

    let client = build_ai_client(req.privacy_mode)?;

    if req.provider_kind == "openai" {
        let url = endpoint_url(&req.base_url, "chat/completions")?;

        let mut messages = Vec::new();
        if let Some(system) = &req.system {
            messages.push(serde_json::json!({ "role": "system", "content": system }));
        }
        messages.push(serde_json::json!({ "role": "user", "content": req.prompt }));

        let body = serde_json::json!({
            "model": req.model,
            "messages": messages,
            "max_tokens": req.max_tokens,
            "stream": true,
        });

        let mut request_builder = client.post(url).json(&body);
        if let Some(key) = &req.api_key {
            if !key.is_empty() {
                request_builder =
                    request_builder.header("Authorization", format!("Bearer {}", key));
            }
        }

        let resp = match request_builder
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
        {
            Ok(r) => r,
            Err(e) => {
                let msg = e.to_string();
                let _ = on_event.send(AiStreamEvent::Error {
                    message: msg.clone(),
                });
                return Err(msg);
            }
        };

        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();
        let mut received = 0usize;

        while let Some(chunk_result) = stream.next().await {
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    let msg = e.to_string();
                    let _ = on_event.send(AiStreamEvent::Error {
                        message: msg.clone(),
                    });
                    return Err(msg);
                }
            };

            received = received.saturating_add(chunk.len());
            if received > MAX_AI_RESPONSE_BYTES
                || buf.len().saturating_add(chunk.len()) > MAX_AI_STREAM_BUFFER_BYTES
            {
                let msg = "AI stream exceeds the configured size limit".to_string();
                let _ = on_event.send(AiStreamEvent::Error {
                    message: msg.clone(),
                });
                return Err(msg);
            }
            buf.extend_from_slice(&chunk);

            for line in drain_complete_lines(&mut buf) {
                match parse_sse_line(&line) {
                    SseParsed::Token(text) => {
                        on_event
                            .send(AiStreamEvent::Token { text })
                            .map_err(|e| e.to_string())?;
                    }
                    SseParsed::Done => {
                        on_event
                            .send(AiStreamEvent::Done)
                            .map_err(|e| e.to_string())?;
                        return Ok(());
                    }
                    SseParsed::Ignore => {}
                }
            }
        }

        // Flush any trailing data without a final newline
        if !buf.is_empty() {
            let line = String::from_utf8_lossy(&buf);
            if let SseParsed::Token(text) = parse_sse_line(&line) {
                on_event
                    .send(AiStreamEvent::Token { text })
                    .map_err(|e| e.to_string())?;
            }
        }

        // Send Done when the stream ends without an explicit [DONE] marker
        on_event
            .send(AiStreamEvent::Done)
            .map_err(|e| e.to_string())?;

        Ok(())
    } else {
        // Ollama
        let url = endpoint_url(&req.base_url, "api/generate")?;

        let mut body = serde_json::json!({
            "model": req.model,
            "prompt": req.prompt,
            "stream": true,
            "options": { "num_predict": req.max_tokens }
        });

        if let Some(system) = &req.system {
            body["system"] = serde_json::Value::String(system.clone());
        }

        let resp = match client
            .post(url)
            .json(&body)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
        {
            Ok(r) => r,
            Err(e) => {
                let msg = e.to_string();
                let _ = on_event.send(AiStreamEvent::Error {
                    message: msg.clone(),
                });
                return Err(msg);
            }
        };

        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();
        let mut received = 0usize;

        while let Some(chunk_result) = stream.next().await {
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    let msg = e.to_string();
                    let _ = on_event.send(AiStreamEvent::Error {
                        message: msg.clone(),
                    });
                    return Err(msg);
                }
            };

            received = received.saturating_add(chunk.len());
            if received > MAX_AI_RESPONSE_BYTES
                || buf.len().saturating_add(chunk.len()) > MAX_AI_STREAM_BUFFER_BYTES
            {
                let msg = "AI stream exceeds the configured size limit".to_string();
                let _ = on_event.send(AiStreamEvent::Error {
                    message: msg.clone(),
                });
                return Err(msg);
            }
            buf.extend_from_slice(&chunk);

            // Process all complete newline-delimited lines in the buffer
            for line in drain_complete_lines(&mut buf) {
                if let Some((text, is_done)) = parse_ollama_line(&line) {
                    if !text.is_empty() {
                        on_event
                            .send(AiStreamEvent::Token { text })
                            .map_err(|e| e.to_string())?;
                    }
                    if is_done {
                        on_event
                            .send(AiStreamEvent::Done)
                            .map_err(|e| e.to_string())?;
                        return Ok(());
                    }
                }
            }
        }

        // Flush any trailing data that arrived without a final newline
        if !buf.is_empty() {
            let line = String::from_utf8_lossy(&buf);
            if let Some((text, _done)) = parse_ollama_line(&line) {
                if !text.is_empty() {
                    on_event
                        .send(AiStreamEvent::Token { text })
                        .map_err(|e| e.to_string())?;
                }
            }
        }

        // Always send Done when the stream ends without an explicit done marker
        on_event
            .send(AiStreamEvent::Done)
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // parse_ollama_line

    #[test]
    fn parse_token_line() {
        let result = parse_ollama_line(r#"{"response":"Hello","done":false}"#);
        assert_eq!(result, Some(("Hello".to_string(), false)));
    }

    #[test]
    fn parse_final_line() {
        let result = parse_ollama_line(r#"{"response":"","done":true}"#);
        assert_eq!(result, Some(("".to_string(), true)));
    }

    #[test]
    fn parse_blank_line() {
        assert_eq!(parse_ollama_line(""), None);
        assert_eq!(parse_ollama_line("   "), None);
    }

    #[test]
    fn parse_garbage_line() {
        assert_eq!(parse_ollama_line("not json at all"), None);
    }

    // parse_sse_line

    #[test]
    fn sse_token_line() {
        let result = parse_sse_line(r#"data: {"choices":[{"delta":{"content":"Hi"}}]}"#);
        assert_eq!(result, SseParsed::Token("Hi".to_string()));
    }

    #[test]
    fn sse_done_line() {
        assert_eq!(parse_sse_line("data: [DONE]"), SseParsed::Done);
    }

    #[test]
    fn sse_blank_line() {
        assert_eq!(parse_sse_line(""), SseParsed::Ignore);
        assert_eq!(parse_sse_line("   "), SseParsed::Ignore);
    }

    #[test]
    fn sse_empty_delta_line() {
        let result = parse_sse_line(r#"data: {"choices":[{"delta":{}}]}"#);
        assert_eq!(result, SseParsed::Ignore);
    }

    #[test]
    fn sse_non_data_line() {
        assert_eq!(parse_sse_line("event: ping"), SseParsed::Ignore);
        assert_eq!(parse_sse_line(": keep-alive"), SseParsed::Ignore);
    }

    // is_loopback_host

    #[test]
    fn loopback_localhost() {
        assert!(is_loopback_host("http://localhost:11434"));
    }

    #[test]
    fn loopback_127() {
        assert!(is_loopback_host("http://127.0.0.1:11434"));
    }

    #[test]
    fn loopback_ipv6() {
        assert!(!is_loopback_host("http://::1:11434"));
    }

    #[test]
    fn loopback_ipv6_bracketed() {
        assert!(is_loopback_host("http://[::1]:11434"));
        assert!(is_loopback_host("http://[::1]"));
        assert!(is_loopback_host("http://[::1]/api"));
    }

    #[test]
    fn not_loopback_remote() {
        assert!(!is_loopback_host("http://example.com"));
        assert!(!is_loopback_host("http://example.com:11434"));
        assert!(!is_loopback_host("http://localhost:password@evil.example"));
        assert!(!is_loopback_host("ftp://localhost/model"));
    }

    #[test]
    fn privacy_rejects_userinfo_even_when_host_is_loopback() {
        let req = AiCompleteRequest {
            base_url: "http://user:password@localhost:11434".to_string(),
            model: "llama3".to_string(),
            prompt: "hi".to_string(),
            system: None,
            max_tokens: 100,
            privacy_mode: true,
            provider_kind: "ollama".to_string(),
            api_key: None,
        };
        assert!(enforce_privacy(&req).is_err());
    }

    #[test]
    fn all_ipv4_loopback_addresses_are_local() {
        assert!(is_loopback_host("http://127.42.0.9:11434"));
    }

    // normalize_base_url

    #[test]
    fn normalize_strips_trailing_slash() {
        assert_eq!(
            normalize_base_url("http://localhost:11434/"),
            "http://localhost:11434"
        );
    }

    #[test]
    fn normalize_strips_multiple_slashes() {
        assert_eq!(
            normalize_base_url("http://localhost:11434///"),
            "http://localhost:11434"
        );
    }

    #[test]
    fn normalize_empty_returns_default() {
        assert_eq!(normalize_base_url(""), "http://localhost:11434");
        assert_eq!(normalize_base_url("   "), "http://localhost:11434");
    }

    #[test]
    fn normalize_no_trailing_slash_unchanged() {
        assert_eq!(
            normalize_base_url("http://localhost:11434"),
            "http://localhost:11434"
        );
    }

    // enforce_privacy

    #[test]
    fn privacy_mode_remote_is_err() {
        let req = AiCompleteRequest {
            base_url: "http://example.com:11434".to_string(),
            model: "llama3".to_string(),
            prompt: "hi".to_string(),
            system: None,
            max_tokens: 100,
            privacy_mode: true,
            provider_kind: "ollama".to_string(),
            api_key: None,
        };
        assert!(enforce_privacy(&req).is_err());
    }

    #[test]
    fn privacy_mode_localhost_is_ok() {
        let req = AiCompleteRequest {
            base_url: "http://localhost:11434".to_string(),
            model: "llama3".to_string(),
            prompt: "hi".to_string(),
            system: None,
            max_tokens: 100,
            privacy_mode: true,
            provider_kind: "ollama".to_string(),
            api_key: None,
        };
        assert!(enforce_privacy(&req).is_ok());
    }

    #[test]
    fn no_privacy_mode_remote_is_ok() {
        let req = AiCompleteRequest {
            base_url: "http://example.com:11434".to_string(),
            model: "llama3".to_string(),
            prompt: "hi".to_string(),
            system: None,
            max_tokens: 100,
            privacy_mode: false,
            provider_kind: "ollama".to_string(),
            api_key: None,
        };
        assert!(enforce_privacy(&req).is_ok());
    }

    // default_provider_kind

    #[test]
    fn default_provider_kind_is_ollama() {
        assert_eq!(default_provider_kind(), "ollama");
    }

    // drain_complete_lines

    #[test]
    fn drain_lines_keeps_partial_trailing() {
        let mut buf = b"{\"a\":1}\n{\"b\"".to_vec();
        let lines = drain_complete_lines(&mut buf);
        assert_eq!(lines, vec!["{\"a\":1}\n".to_string()]);
        assert_eq!(buf, b"{\"b\"".to_vec());
    }

    #[test]
    fn drain_lines_handles_multibyte_split_across_chunks() {
        // Cyrillic is 2 bytes/char; split a chunk in the middle of a char.
        let full = "привет\n".as_bytes().to_vec();
        let split = full.len() - 3;
        let mut buf: Vec<u8> = Vec::new();

        buf.extend_from_slice(&full[..split]);
        // No newline yet → no complete line, partial multibyte byte retained.
        assert!(drain_complete_lines(&mut buf).is_empty());

        buf.extend_from_slice(&full[split..]);
        let lines = drain_complete_lines(&mut buf);
        assert_eq!(lines, vec!["привет\n".to_string()]);
        assert!(buf.is_empty());
    }
}
