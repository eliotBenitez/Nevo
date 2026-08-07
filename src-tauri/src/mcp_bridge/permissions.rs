//! Access gate for bridge RPC methods.
//!
//! The mode lives in the workspace's `settings.json` and is re-read per request
//! rather than captured at start-up, so revoking access in the UI takes effect
//! on the agent's very next call instead of after a restart.

use std::path::Path;

use crate::commands::workspace::{read_workspace_settings, McpMode};

/// Whether a method mutates workspace state. Every RPC method must declare
/// this; the gate is applied before the handler runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Read,
    /// No write method is registered yet (see `handlers::access_for`); the gate
    /// is in place first so one cannot be added without declaring its level.
    #[allow(dead_code)]
    Write,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Allow,
    /// Mode is `ask`: the write needs explicit user confirmation in the app.
    Confirm,
    Deny(DenyReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DenyReason {
    BridgeDisabled,
    ReadOnly,
}

impl DenyReason {
    pub fn code(self) -> &'static str {
        match self {
            Self::BridgeDisabled => "bridge_disabled",
            Self::ReadOnly => "read_only",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Self::BridgeDisabled => {
                "The Nevo MCP bridge is disabled. Enable it in Settings to allow agent access."
            }
            Self::ReadOnly => {
                "The Nevo MCP bridge is in read-only mode. Switch it to Ask or Auto to allow edits."
            }
        }
    }
}

pub fn decide(mode: McpMode, access: Access) -> Decision {
    match access {
        Access::Read => {
            if mode.allows_read() {
                Decision::Allow
            } else {
                Decision::Deny(DenyReason::BridgeDisabled)
            }
        }
        Access::Write => {
            if !mode.allows_read() {
                Decision::Deny(DenyReason::BridgeDisabled)
            } else if !mode.allows_write() {
                Decision::Deny(DenyReason::ReadOnly)
            } else if mode.requires_confirmation() {
                Decision::Confirm
            } else {
                Decision::Allow
            }
        }
    }
}

/// Reads the workspace's current mode. A settings file that is missing or
/// unreadable yields `Off` — failing closed, never open.
pub fn current_mode(workspace_path: &str) -> McpMode {
    let path = Path::new(workspace_path).join(".nevo/settings.json");
    read_workspace_settings(&path)
        .map(|settings| settings.mcp.mode)
        .unwrap_or(McpMode::Off)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_denies_everything() {
        assert_eq!(
            decide(McpMode::Off, Access::Read),
            Decision::Deny(DenyReason::BridgeDisabled)
        );
        assert_eq!(
            decide(McpMode::Off, Access::Write),
            Decision::Deny(DenyReason::BridgeDisabled)
        );
    }

    #[test]
    fn read_only_allows_reads_and_denies_writes() {
        assert_eq!(decide(McpMode::ReadOnly, Access::Read), Decision::Allow);
        assert_eq!(
            decide(McpMode::ReadOnly, Access::Write),
            Decision::Deny(DenyReason::ReadOnly)
        );
    }

    #[test]
    fn ask_requires_confirmation_for_writes_only() {
        assert_eq!(decide(McpMode::Ask, Access::Read), Decision::Allow);
        assert_eq!(decide(McpMode::Ask, Access::Write), Decision::Confirm);
    }

    #[test]
    fn auto_allows_writes_without_confirmation() {
        assert_eq!(decide(McpMode::Auto, Access::Read), Decision::Allow);
        assert_eq!(decide(McpMode::Auto, Access::Write), Decision::Allow);
    }

    #[test]
    fn unknown_mode_string_falls_back_to_off() {
        assert_eq!(McpMode::parse("full-access"), McpMode::Off);
        assert_eq!(McpMode::parse(""), McpMode::Off);
        assert_eq!(McpMode::parse("auto"), McpMode::Auto);
    }

    #[test]
    fn missing_settings_file_yields_off() {
        let missing = std::env::temp_dir().join(format!("nevo-missing-{}", uuid::Uuid::new_v4()));
        assert_eq!(current_mode(&missing.to_string_lossy()), McpMode::Off);
    }
}
