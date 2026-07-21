use futures_util::StreamExt;
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::time::Duration;

use super::store::store_asset_bytes;
use crate::commands::note::{note_error_context, ImportedImageAsset};
use crate::commands::path_utils::normalize_workspace_path;
use crate::logging::{LogContext, LogError};

const MAX_REMOTE_ASSET_BYTES: usize = 25 * 1024 * 1024;
const MAX_REMOTE_ASSET_REDIRECTS: usize = 5;

fn extension_from_content_type(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/avif" => Some("avif"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

pub(super) fn derive_download_file_name(url: &str, content_type: Option<&str>) -> String {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let last = path.rsplit('/').next().unwrap_or("");
    if !last.is_empty() && Path::new(last).extension().is_some() {
        return last.to_string();
    }
    let ext = content_type
        .and_then(extension_from_content_type)
        .unwrap_or("png");
    let stem = if last.is_empty() { "image" } else { last };
    format!("{}.{}", stem, ext)
}

pub(super) fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_unspecified()
                || ip.is_multicast()
                || octets[0] == 0
                || octets[0] >= 240
                || (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || (octets[0] == 198 && (18..=19).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0))
        }
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || (segments[0] == 0x2001 && segments[1] == 0x0db8)
                || ip
                    .to_ipv4_mapped()
                    .is_some_and(|mapped| !is_public_ip(IpAddr::V4(mapped))))
        }
    }
}

pub(super) fn validate_remote_asset_url(url: &reqwest::Url) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only http(s) URLs are supported".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Remote asset URL must not contain user information".to_string());
    }
    if url.host_str().is_none() {
        return Err("Remote asset URL must include a host".to_string());
    }
    Ok(())
}

async fn resolve_public_addresses(url: &reqwest::Url) -> Result<Vec<SocketAddr>, String> {
    validate_remote_asset_url(url)?;
    let host = url
        .host_str()
        .ok_or_else(|| "Remote asset URL must include a host".to_string())?;
    let address_host = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Remote asset URL has no usable port".to_string())?;

    let addresses = if let Ok(ip) = address_host.parse::<IpAddr>() {
        vec![SocketAddr::new(ip, port)]
    } else {
        tokio::net::lookup_host((host, port))
            .await
            .map_err(|error| format!("Failed to resolve remote asset host: {error}"))?
            .collect::<Vec<_>>()
    };
    if addresses.is_empty() {
        return Err("Remote asset host did not resolve".to_string());
    }
    if addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err("Remote asset URL resolves to a private or local address".to_string());
    }
    Ok(addresses)
}

pub(super) fn sniff_image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("bmp");
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" && matches!(&bytes[8..12], b"avif" | b"avis") {
        return Some("avif");
    }
    let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]);
    let trimmed = prefix
        .trim_start_matches(|character: char| character.is_whitespace() || character == '\u{feff}');
    if trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg")) {
        return Some("svg");
    }
    None
}

pub(super) fn content_type_matches_extension(content_type: &str, extension: &str) -> bool {
    matches!(
        (
            content_type.split(';').next().unwrap_or("").trim(),
            extension
        ),
        ("image/png", "png")
            | ("image/jpeg" | "image/jpg", "jpg")
            | ("image/gif", "gif")
            | ("image/webp", "webp")
            | ("image/bmp", "bmp")
            | ("image/avif", "avif")
            | ("image/svg+xml", "svg")
    )
}

/// Download a remote image and import it into the workspace assets directory.
///
/// Pasting an `<img>` from the web only yields a URL; loading that URL directly
/// in the webview often 404s (auth/hotlink/expiring signed URLs), so we fetch
/// the bytes server-side (reqwest follows redirects) and store them locally.
#[tauri::command]
pub async fn import_asset_from_url(
    workspace_path: String,
    url: String,
) -> Result<ImportedImageAsset, String> {
    let logger = crate::logging::logger();
    let mut current_url =
        reqwest::Url::parse(&url).map_err(|_| "Remote asset URL is invalid".to_string())?;
    validate_remote_asset_url(&current_url)?;

    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "import_asset_from_url",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();

    let mut redirect_count = 0usize;
    let response = loop {
        let addresses = resolve_public_addresses(&current_url).await?;
        let host = current_url.host_str().unwrap_or_default().to_string();
        let mut client_builder = reqwest::Client::builder()
            .user_agent("Nevo/0.1 remote-image-import")
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::none());
        if host.parse::<IpAddr>().is_err() {
            client_builder = client_builder.resolve_to_addrs(&host, &addresses);
        }
        let client = client_builder.build().map_err(|error| error.to_string())?;
        let response = client
            .get(current_url.clone())
            .send()
            .await
            .map_err(|error| {
                let message = error.to_string();
                let _ = logger.error(
                    "tauri.note",
                    "import_asset_from_url",
                    "Failed to fetch remote image",
                    note_error_context(&workspace_path, "network", message.clone()),
                );
                message
            })?;
        if response.status().is_redirection() {
            if redirect_count >= MAX_REMOTE_ASSET_REDIRECTS {
                return Err("Too many remote asset redirects".to_string());
            }
            redirect_count += 1;
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "Remote asset redirect has an invalid Location".to_string())?;
            current_url = current_url
                .join(location)
                .map_err(|_| "Remote asset redirect URL is invalid".to_string())?;
            validate_remote_asset_url(&current_url)?;
            continue;
        }
        break response;
    };

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let content_type =
        content_type.ok_or_else(|| "Remote image response omitted Content-Type".to_string())?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_REMOTE_ASSET_BYTES as u64)
    {
        return Err("Remote image exceeds the 25 MiB limit".to_string());
    }
    let final_url = current_url.to_string();
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        if bytes.len().saturating_add(chunk.len()) > MAX_REMOTE_ASSET_BYTES {
            return Err("Remote image exceeds the 25 MiB limit".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("Downloaded file is empty".to_string());
    }
    let detected_extension = sniff_image_extension(&bytes)
        .ok_or_else(|| "Remote resource does not have a supported image signature".to_string())?;
    if !content_type_matches_extension(&content_type, detected_extension) {
        return Err("Remote image Content-Type does not match its file signature".to_string());
    }
    let file_name = derive_download_file_name(&final_url, Some(&content_type));

    tauri::async_runtime::spawn_blocking(move || {
        store_asset_bytes(&workspace_path, &file_name, &bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}
