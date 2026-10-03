//! Local MCP bridge: a loopback JSON-RPC endpoint that lets external coding
//! agents (Claude Code, codex) read and edit the open workspace.
//!
//! The agent's MCP server runs out of process and talks to this bridge over
//! HTTP; the bridge in turn calls the same command implementations the UI uses,
//! so manifest, note-index, and snapshot invariants are never re-implemented.
//!
//! Security: loopback-only listener on a random port, random per-session bearer
//! token, `Host` pinned to the bridge's own address, and an access mode that
//! defaults to `off`.

pub(crate) mod endpoint_file;
mod handlers;
mod http;
mod permissions;
mod server;
mod webview;

pub use server::{apply_mode, info, stop, McpBridgeInfo, McpBridgeState};
pub use webview::{resolve as resolve_webview_request, WebviewChannel};
