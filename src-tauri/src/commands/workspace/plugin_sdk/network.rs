use super::super::paths::plugins_dir_path;
use super::super::plugins::validate_plugin_id;
use super::super::types::{PluginExecutionMode, PluginManifest};
use crate::commands::path_utils::normalize_workspace_path;
use base64::Engine;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginNetworkRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub body_base64: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginNetworkResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body_base64: String,
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_multicast()
                || ip.is_unspecified()
                || ip.octets()[0] == 0
                || ip.octets()[0] >= 224
                || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
                || (ip.octets()[0] == 198 && (ip.octets()[1] == 18 || ip.octets()[1] == 19)))
        }
        IpAddr::V6(ip) => {
            // IPv4-mapped/compatible addresses (e.g. ::ffff:10.0.0.1) route to the
            // embedded IPv4 target, so they must be judged by the IPv4 rules —
            // otherwise a mapped private/loopback address slips past the V6 predicates.
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(mapped));
            }
            #[allow(deprecated)]
            if let Some(compat) = ip.to_ipv4() {
                return is_public_ip(IpAddr::V4(compat));
            }
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || ip.is_multicast())
        }
    }
}

fn host_allowed(host: &str, allowed: &[String]) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    allowed.iter().any(|pattern| {
        let pattern = pattern.trim_end_matches('.').to_ascii_lowercase();
        if let Some(suffix) = pattern.strip_prefix("*.") {
            host != suffix && host.ends_with(&format!(".{suffix}"))
        } else {
            host == pattern
        }
    })
}

fn safe_request_header(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    !matches!(
        name.as_str(),
        "authorization"
            | "connection"
            | "content-length"
            | "cookie"
            | "host"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    ) && !name.starts_with("proxy-")
        && !name.starts_with("sec-")
}

fn installed_v2_manifest(workspace: &Path, plugin_id: &str) -> Result<PluginManifest, String> {
    let content = std::fs::read_to_string(
        plugins_dir_path(&workspace.to_string_lossy())
            .join(plugin_id)
            .join("manifest.json"),
    )
    .map_err(|error| error.to_string())?;
    let manifest =
        serde_json::from_str::<PluginManifest>(&content).map_err(|error| error.to_string())?;
    if manifest.id != plugin_id || manifest.execution_mode != PluginExecutionMode::SandboxedWorker {
        return Err("Network broker is available only to the matching SDK V2 plugin".to_string());
    }
    if !manifest
        .capabilities
        .as_ref()
        .is_some_and(|values| values.iter().any(|value| value == "network.fetch"))
    {
        return Err("Plugin requires capability network.fetch".to_string());
    }
    Ok(manifest)
}

async fn pinned_client(host: &str, port: u16) -> Result<reqwest::Client, String> {
    let addresses = tokio::net::lookup_host((host, port))
        .await
        .map_err(|error| format!("Plugin network DNS lookup failed: {error}"))?
        .collect::<Vec<SocketAddr>>();
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err("Plugin network target resolved to a non-public address".to_string());
    }
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn plugin_network_fetch(
    workspace_path: String,
    plugin_id: String,
    request: PluginNetworkRequest,
) -> Result<PluginNetworkResponse, String> {
    const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;
    validate_plugin_id(&plugin_id)?;
    let workspace = normalize_workspace_path(&workspace_path)?;
    let manifest = installed_v2_manifest(&workspace, &plugin_id)?;
    let policy = manifest
        .network
        .ok_or_else(|| "Plugin has no declared network policy".to_string())?;
    let method = request.method.to_ascii_uppercase();
    if !policy.methods.iter().any(|value| value == &method) {
        return Err(format!("Plugin network method is not allowed: {method}"));
    }
    let parsed_method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
    let mut url = reqwest::Url::parse(&request.url).map_err(|error| error.to_string())?;
    let body = request
        .body_base64
        .map(|value| {
            base64::engine::general_purpose::STANDARD
                .decode(value)
                .map_err(|error| error.to_string())
        })
        .transpose()?;
    if body
        .as_ref()
        .is_some_and(|value| value.len() > MAX_RESPONSE_BYTES)
    {
        return Err("Plugin network request body exceeds 5 MiB".to_string());
    }

    for redirect_count in 0..=5 {
        if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
            return Err(
                "Plugin network broker accepts only credential-free HTTPS URLs".to_string(),
            );
        }
        let host = url
            .host_str()
            .ok_or_else(|| "Plugin network URL has no host".to_string())?;
        if !host_allowed(host, &policy.hosts) {
            return Err(format!("Plugin network host is not allowed: {host}"));
        }
        let client = pinned_client(host, url.port_or_known_default().unwrap_or(443)).await?;
        let mut builder = client.request(parsed_method.clone(), url.clone());
        for (name, value) in &request.headers {
            if !safe_request_header(name) {
                return Err(format!("Plugin network header is not allowed: {name}"));
            }
            builder = builder.header(name, value);
        }
        if let Some(body) = &body {
            builder = builder.body(body.clone());
        }
        let response = builder.send().await.map_err(|error| error.to_string())?;
        if response.status().is_redirection() {
            if redirect_count == 5 {
                return Err("Plugin network request exceeded 5 redirects".to_string());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or_else(|| "Plugin network redirect has no Location".to_string())?
                .to_str()
                .map_err(|_| "Plugin network redirect is not valid UTF-8".to_string())?;
            url = url.join(location).map_err(|error| error.to_string())?;
            continue;
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err("Plugin network response exceeds 5 MiB".to_string());
        }
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.as_str().to_string(), value.to_string()))
            })
            .collect();
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| error.to_string())?;
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err("Plugin network response exceeds 5 MiB".to_string());
            }
            bytes.extend_from_slice(&chunk);
        }
        return Ok(PluginNetworkResponse {
            status,
            headers,
            body_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
    }
    Err("Plugin network redirect loop".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_private_network_targets_and_wildcard_confusion() {
        assert!(!is_public_ip("127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("169.254.1.1".parse().unwrap()));
        assert!(!is_public_ip("10.0.0.1".parse().unwrap()));
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
        // IPv4-mapped IPv6 must inherit the IPv4 verdict (SSRF via ::ffff: bypass).
        assert!(!is_public_ip("::1".parse().unwrap()));
        assert!(!is_public_ip("::ffff:127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("::ffff:10.0.0.1".parse().unwrap()));
        assert!(is_public_ip("::ffff:1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
        assert!(host_allowed(
            "api.example.com",
            &["*.example.com".to_string()]
        ));
        assert!(!host_allowed(
            "example.com.evil.test",
            &["*.example.com".to_string()]
        ));
    }
}
