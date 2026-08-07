//! Frontend-facing commands for the local MCP bridge.
//!
//! The bridge itself lives in `crate::mcp_bridge`; these commands are the thin
//! IPC surface the settings UI uses to start, stop, and inspect it.

use tauri::AppHandle;

use crate::commands::workspace::McpMode;
use crate::mcp_bridge::{self, McpBridgeInfo, McpBridgeState};

/// Brings the bridge in line with `mode` for the given workspace. Called on
/// workspace open and whenever the user changes the setting, so the listener
/// exists only while access is granted.
#[tauri::command]
pub async fn apply_mcp_mode(
    app: AppHandle,
    state: tauri::State<'_, McpBridgeState>,
    workspace_path: String,
    mode: String,
) -> Result<Option<McpBridgeInfo>, String> {
    mcp_bridge::apply_mode(&app, &state, workspace_path, McpMode::parse(&mode)).await
}

#[tauri::command]
pub async fn get_mcp_bridge_info(
    state: tauri::State<'_, McpBridgeState>,
) -> Result<Option<McpBridgeInfo>, String> {
    Ok(mcp_bridge::info(&state).await)
}

#[tauri::command]
pub async fn stop_mcp_bridge(
    app: AppHandle,
    state: tauri::State<'_, McpBridgeState>,
) -> Result<(), String> {
    mcp_bridge::stop(&app, &state).await
}

/// Delivers the frontend's answer to an `mcp-bridge-request` event. A reply for
/// an unknown id is ignored: it means the request already timed out.
#[tauri::command]
pub fn mcp_respond(
    app: AppHandle,
    request_id: String,
    result: Option<serde_json::Value>,
    error: Option<String>,
) -> Result<(), String> {
    let outcome = match error {
        Some(message) => Err(message),
        None => Ok(result.unwrap_or(serde_json::Value::Null)),
    };
    mcp_bridge::resolve_webview_request(&app, &request_id, outcome);
    Ok(())
}
