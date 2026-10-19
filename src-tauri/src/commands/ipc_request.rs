use tauri::ipc::{InvokeBody, Request};

/// Reads a percent-encoded string header. Raw-body invokes cannot carry
/// arguments, so callers send them as headers encoded with `encodeURIComponent`
/// (HTTP headers must be ASCII; paths and file names may not be).
pub(crate) fn decoded_header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("missing {name} header"))?;
    percent_encoding::percent_decode_str(value)
        .decode_utf8()
        .map(|decoded| decoded.into_owned())
        .map_err(|_| format!("{name} header is not valid UTF-8"))
}

pub(crate) fn raw_body(request: &Request<'_>, command: &str) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err(format!("{command} expects a raw binary body")),
    }
}
