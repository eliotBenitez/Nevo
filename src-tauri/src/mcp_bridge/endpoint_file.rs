//! Discovery file that lets an out-of-process MCP server find the running
//! bridge. The MCP server is spawned by the user's coding agent, not by Nevo,
//! so it cannot be handed the port and token directly — it reads them from
//! `<app_config_dir>/mcp-endpoint.json` instead.
//!
//! The file carries a live session token, so it is written with owner-only
//! permissions and removed as soon as the bridge stops.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const ENDPOINT_FILE_NAME: &str = "mcp-endpoint.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EndpointDescriptor {
    pub port: u16,
    pub token: String,
    /// Lets a client detect a stale file left behind by a crashed instance.
    pub pid: u32,
    pub workspace_path: String,
    /// Current access mode, so the MCP server can tell the agent up front that
    /// writes are unavailable instead of surfacing a 403 mid-task.
    pub mode: String,
}

pub fn endpoint_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(ENDPOINT_FILE_NAME))
}

pub fn write(app: &AppHandle, descriptor: &EndpointDescriptor) -> Result<(), String> {
    let path = endpoint_path(app)?;
    let raw = serde_json::to_string_pretty(descriptor).map_err(|e| e.to_string())?;
    write_owner_only(&path, raw.as_bytes())
}

pub fn remove(app: &AppHandle) -> Result<(), String> {
    let path = endpoint_path(app)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// Writes the file with mode 0600 on Unix. Not written atomically via
/// `write_atomic` on purpose: a rename would land the temp file's permissions
/// on the destination, briefly exposing the token to other local users.
pub(crate) fn write_owner_only(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;

    // `OpenOptions::mode` only applies when the file is created, so an existing
    // file keeps whatever permissions it had. Re-assert them explicitly.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }

    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descriptor_round_trips_through_json() {
        let descriptor = EndpointDescriptor {
            port: 51234,
            token: "abc123".to_string(),
            pid: 42,
            workspace_path: "/home/user/notes".to_string(),
            mode: "read-only".to_string(),
        };
        let raw = serde_json::to_string(&descriptor).expect("serialize");
        assert!(raw.contains("\"workspacePath\""), "expected camelCase keys");
        let parsed: EndpointDescriptor = serde_json::from_str(&raw).expect("deserialize");
        assert_eq!(parsed, descriptor);
    }

    #[cfg(unix)]
    #[test]
    fn written_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("nevo-mcp-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("mcp-endpoint.json");

        write_owner_only(&path, b"{}").expect("write endpoint file");
        let mode = std::fs::metadata(&path)
            .expect("metadata")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);

        // Overwriting a world-readable file must tighten it back down.
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).expect("relax");
        write_owner_only(&path, b"{}").expect("rewrite endpoint file");
        let mode = std::fs::metadata(&path)
            .expect("metadata")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
