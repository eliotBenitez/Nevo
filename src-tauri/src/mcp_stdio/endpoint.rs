use std::collections::HashMap;
use std::path::PathBuf;

use crate::mcp_bridge::endpoint_file::EndpointDescriptor;

const APP_IDENTIFIER: &str = "com.eliotBenitezhvat.nevo";
const ENDPOINT_FILE: &str = "mcp-endpoint.json";

pub fn path_for(env: &HashMap<String, String>, platform: &str) -> Result<PathBuf, String> {
    if let Some(override_path) = env.get("NEVO_MCP_ENDPOINT") {
        let path = PathBuf::from(override_path);
        return path
            .is_absolute()
            .then_some(path)
            .ok_or_else(|| "Nevo MCP endpoint override must be absolute".to_string());
    }

    let home = env
        .get("HOME")
        .or_else(|| env.get("USERPROFILE"))
        .ok_or_else(|| "User home directory is unavailable".to_string())?;
    let base = match platform {
        "windows" => env
            .get("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(home).join("AppData/Roaming")),
        "macos" => PathBuf::from(home).join("Library/Application Support"),
        _ => env
            .get("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(home).join(".config")),
    };
    Ok(base.join(APP_IDENTIFIER).join(ENDPOINT_FILE))
}

pub fn parse(raw: &str) -> Result<EndpointDescriptor, String> {
    let endpoint: EndpointDescriptor = serde_json::from_str(raw)
        .map_err(|_| "Nevo MCP endpoint file is invalid; restart Nevo".to_string())?;
    if endpoint.port == 0 || endpoint.token.is_empty() {
        return Err("Nevo MCP endpoint file is invalid; restart Nevo".to_string());
    }
    Ok(endpoint)
}

pub fn read() -> Result<EndpointDescriptor, String> {
    let env: HashMap<String, String> = std::env::vars().collect();
    let platform = match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        _ => "linux",
    };
    let path = path_for(&env, platform)?;
    let raw = std::fs::read_to_string(path)
        .map_err(|_| "Nevo is not running, or its MCP bridge is off".to_string())?;
    parse(&raw)
}
