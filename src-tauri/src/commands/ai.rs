use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

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

/// True when the URL's host is a loopback address.
/// Simple string-based: strip scheme, take authority up to first '/', strip port.
pub fn is_loopback_host(base_url: &str) -> bool {
    // Strip scheme (e.g. "http://")
    let after_scheme = if let Some(pos) = base_url.find("://") {
        &base_url[pos + 3..]
    } else {
        base_url
    };

    // Take authority (everything before the first '/')
    let authority = match after_scheme.find('/') {
        Some(pos) => &after_scheme[..pos],
        None => after_scheme,
    };

    // Strip port
    let host = match authority.rfind(':') {
        Some(pos) => &authority[..pos],
        None => authority,
    };

    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

pub fn enforce_privacy(req: &AiCompleteRequest) -> Result<(), String> {
    if req.privacy_mode && !is_loopback_host(&req.base_url) {
        Err("AI privacy mode blocks non-local endpoints".to_string())
    } else {
        Ok(())
    }
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
    let base = normalize_base_url(&base_url);
    let client = reqwest::Client::new();

    if provider_kind == "openai" {
        let url = format!("{}/models", base);
        let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
        let body: OpenAiModelsResponse = resp.json().await.map_err(|e| e.to_string())?;
        Ok(body.data.into_iter().map(|m| m.id).collect())
    } else {
        // Ollama (default)
        let url = format!("{}/api/tags", base);
        let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
        let body: OllamaTagsResponse = resp.json().await.map_err(|e| e.to_string())?;
        Ok(body.models.into_iter().map(|m| m.name).collect())
    }
}

#[tauri::command]
pub async fn ai_complete(req: AiCompleteRequest) -> Result<String, String> {
    enforce_privacy(&req)?;

    let base = normalize_base_url(&req.base_url);
    let client = reqwest::Client::new();

    if req.provider_kind == "openai" {
        let url = format!("{}/chat/completions", base);

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

        let mut request_builder = client.post(&url).json(&body);
        if let Some(key) = &req.api_key {
            if !key.is_empty() {
                request_builder =
                    request_builder.header("Authorization", format!("Bearer {}", key));
            }
        }

        let resp = request_builder.send().await.map_err(|e| e.to_string())?;
        let parsed: OpenAiCompleteResponse = resp.json().await.map_err(|e| e.to_string())?;

        parsed
            .choices
            .into_iter()
            .next()
            .and_then(|c| c.message.content)
            .ok_or_else(|| "empty response from OpenAI-compatible endpoint".to_string())
    } else {
        // Ollama
        let url = format!("{}/api/generate", base);

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
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let parsed: OllamaCompleteResponse = resp.json().await.map_err(|e| e.to_string())?;
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

    let base = normalize_base_url(&req.base_url);
    let client = reqwest::Client::new();

    if req.provider_kind == "openai" {
        let url = format!("{}/chat/completions", base);

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

        let mut request_builder = client.post(&url).json(&body);
        if let Some(key) = &req.api_key {
            if !key.is_empty() {
                request_builder =
                    request_builder.header("Authorization", format!("Bearer {}", key));
            }
        }

        let resp = match request_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                let msg = e.to_string();
                let _ = on_event.send(AiStreamEvent::Error { message: msg.clone() });
                return Err(msg);
            }
        };

        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    let msg = e.to_string();
                    let _ = on_event.send(AiStreamEvent::Error { message: msg.clone() });
                    return Err(msg);
                }
            };

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
        let url = format!("{}/api/generate", base);

        let mut body = serde_json::json!({
            "model": req.model,
            "prompt": req.prompt,
            "stream": true,
            "options": { "num_predict": req.max_tokens }
        });

        if let Some(system) = &req.system {
            body["system"] = serde_json::Value::String(system.clone());
        }

        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                let msg = e.to_string();
                let _ = on_event.send(AiStreamEvent::Error { message: msg.clone() });
                return Err(msg);
            }
        };

        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    let msg = e.to_string();
                    let _ = on_event.send(AiStreamEvent::Error { message: msg.clone() });
                    return Err(msg);
                }
            };

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
        let result =
            parse_sse_line(r#"data: {"choices":[{"delta":{"content":"Hi"}}]}"#);
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
        assert!(is_loopback_host("http://::1:11434"));
    }

    #[test]
    fn not_loopback_remote() {
        assert!(!is_loopback_host("http://example.com"));
        assert!(!is_loopback_host("http://example.com:11434"));
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
