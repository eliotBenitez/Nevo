# Desktop MCP agent connection

## Intent and success criteria

Nevo users should connect the running desktop app to local Codex and Claude Code without a terminal, a source checkout, Node.js, or pnpm. The connection should work across Nevo restarts and workspace switches. Users should see separately whether each agent is configured and whether the bridge is currently available. The workspace's existing MCP access mode remains the only authority for requests.

The first release targets local desktop agents on Linux, macOS, and Windows, including Nevo's Flatpak package. Remote ChatGPT MCP apps and mobile agents are outside this feature.

## Current state

`SettingsMcpPanel.vue` displays a placeholder `claude mcp add` command. `docs/mcp-bridge.md` requires building `packages/mcp-server` and entering an absolute path to its `dist/index.js`. The Node server already maps MCP tools to Nevo's authenticated loopback bridge, but it is not bundled with the desktop app. The bridge endpoint file, token, access modes, Rust dispatch, and active editor handling already exist and do not need a new external network listener.

## Decision

Use the installed Nevo executable as a self-contained stdio MCP launcher. A `--mcp-server` argument starts a headless Rust MCP server before Tauri creates a webview. The server reads the existing endpoint descriptor for each tool call and forwards to the existing loopback `/rpc` API. Its stdout is reserved for MCP; diagnostics go to stderr. The current Node MCP package remains available for development and existing registrations, while a shared tool catalog keeps both launchers' names, schemas, access classifications, and bridge method mappings aligned.

The alternatives were (1) copying configuration snippets into the UI, which still leaves manual editing, and (2) silently invoking agent CLIs and relying on Node or pnpm to run the current package, which depends on tools a packaged Nevo user may not have. The built-in launcher makes the connection independent of those installations.

## User flow

In Settings → AI agents, keep the existing per-workspace access mode and status. Add separate Codex and Claude Code connection rows with `Connect`, `Reconnect`, or `Disconnect` actions and a short status: not configured, connected, needs reconnecting, conflicting entry, or configuration error. An agent can be configured while Nevo's bridge is off; the UI describes those states separately and tells the user to choose an access mode. Registration does not change the mode. The default remains `off` until the user changes it.

Each action acts on the selected local agent's user-level MCP entry named `nevo`. Success means the entry points to the installed launcher and Nevo can parse it back; it does not claim that the agent has reloaded it or that a tool call succeeded. After a change, show an agent restart hint. Reconnecting updates only an entry Nevo previously installed. If `nevo` already names a different command, show the conflict and require the user's explicit replacement choice. Disconnect removes only a matching Nevo-owned entry. A failure leaves the previous configuration intact and gives a useful error without exposing the endpoint token.

Codex and Claude Code connections are independent. One may succeed when the other fails; neither action changes workspace content or its MCP access mode.

## Architecture and ownership

| Unit | Single responsibility |
| --- | --- |
| `src-tauri/src/mcp_stdio/` | Implement the stdio MCP server, tool dispatch, endpoint discovery, and HTTP forwarding. Use the official Rust MCP SDK with desktop-only Cargo dependencies. |
| `src-tauri/src/main.rs` | Select headless `--mcp-server` before starting the GUI. Never initialize Tauri in headless mode. |
| `packages/mcp-server/src/tools/catalog.json` | Declare the canonical public tool names, descriptions, input schemas, access classifications, and bridge method names. Both MCP launchers consume this catalog. |
| `src-tauri/src/commands/mcp_registration/` | Resolve the installed launcher command and read, connect, and disconnect the two user-level agent entries. Keep client-specific parsers in separate modules. |
| `src/tauri/mcp.ts` | Expose typed registration status and actions to the frontend. |
| `src/app/components/settings/SettingsMcpPanel.vue` | Render mode, bridge status, and independent agent connection rows. Registration state comes from Rust rather than a new Pinia store. |
| `src/locales/*.json` and `src/styles/settings-panels.css` | Supply translated action/status text and reuse current settings surfaces. |

The Rust bridge and frontend editor remain authoritative for workspace operations. The stdio process only maps MCP requests onto existing bridge methods. It never opens workspace files or stores tokens in agent configuration. The endpoint descriptor is read afresh for every call, so a workspace switch or mode change takes effect without re-registering an agent.

For native installers, register an absolute path to the installed Nevo executable with `--mcp-server`. On Linux AppImage, use the persistent `APPIMAGE` path instead of the temporary mounted executable. For Flatpak, register `flatpak run --command=nevo com.eliotBenitezhvat.nevo --mcp-server`; the headless process sees the same sandboxed endpoint directory as the GUI. If the install path changes, report `needs reconnecting` and repair the entry on request. Do not register a development build as an installed connection.

## Agent configuration and failure safety

Codex's user entry is `mcp_servers.nevo` in the default user `~/.codex/config.toml`; Claude Code's user entry is `mcpServers.nevo` in `~/.claude.json`. On Windows, resolve the same paths from the user's profile directory. Read and parse the whole existing file and preserve unrelated keys, sections, comments where the format supports them, and file permissions. Reject malformed files, symlinks, unexpected entry shapes, and inaccessible locations without writing. Before replacing a file, verify that it has not changed since the read, write a same-directory temporary file, and atomically replace it. For an existing file, keep one owner-only `<filename>.nevo-backup` copy of the original without overwriting an earlier backup. Do not change project-scoped or managed configurations.

Status is derived from the current client configuration on each refresh; Nevo does not persist a duplicate registration flag. A `nevo` entry is Nevo-owned only when it carries the `NEVO_MCP_MANAGED` marker written by the registration adapter and its arguments invoke a recognized `--mcp-server` launcher; an entry pointing to an old executable is offered reconnection. A legacy Node-based entry is shown as a conflict eligible for explicit replacement; it is never silently removed. The known `CODEX_HOME` override is honored when inherited by Nevo; a shell-only override cannot be inferred by the desktop process and requires manual setup. External processes writing the same config during Nevo's final atomic replacement are not coordinated portably; an owner-only backup is retained for recovery.

## Security and platforms

The local listener retains its loopback binding, random port, bearer token, Host check, endpoint-file permissions, timeouts, and per-request access-mode check. The new launcher must not print tokens, note content, or protocol diagnostics to stdout. Configuration paths are derived from trusted platform locations, not arbitrary frontend IPC input. Registration commands are desktop-only at Rust compile time and exposed in the frontend only when desktop app metadata supports them. No mobile capability or permission is added.

On Flatpak, verify host user-config visibility and the `flatpak run` invocation in an installed bundle before calling that package supported. Windows must pass a real stdio handshake despite the GUI binary's release subsystem setting.

## Verification and documentation

- Contract tests compare the Rust and Node tool catalogs and check every declared method against Rust access control and dispatch.
- Rust MCP tests cover initialize, list tools, a read call, a write call in each access mode, malformed arguments, bridge unavailable/timeout, and stdout purity.
- Registration tests use isolated temporary home/config directories and cover both clients, unrelated settings preservation, repeated connect/disconnect, conflicts, malformed files, symlinks, concurrent edits, and failed writes.
- Frontend tests cover independent statuses, errors, disabled mobile behavior, keyboard focus, and mode remaining `off` after registration. Review light/dark and narrow layouts.
- Installed-package smoke checks cover native Linux, AppImage, Flatpak, macOS, and Windows launcher paths and a real client handshake where those runners are available. Report any host-platform path not tested.
- Update `docs/mcp-bridge.md`, `packages/mcp-server/README.md`, relevant architecture documentation, and `changes.md` after implementation verifies. The setup guide should begin with the two in-app buttons and retain manual configuration as a fallback.
