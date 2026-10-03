# Desktop MCP Agent Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connect local Codex and Claude Code to Nevo from Settings without a terminal, Node.js, or pnpm.

**Architecture:** The installed Nevo executable handles `--mcp-server` as a headless stdio MCP server and forwards tool calls to the existing authenticated loopback bridge. Separate Rust registration adapters safely edit each agent's user configuration. The settings panel displays their independent statuses.

**Tech Stack:** Rust/Tauri v2, rmcp stdio, serde_json, toml_edit, Vue 3/TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-mcp-desktop-agent-connection-design.md`

## Global Constraints

- Preserve the existing bridge's access modes, per-call endpoint discovery, authentication, and workspace/editor execution path.
- Desktop only: Linux, macOS, and Windows; include AppImage and Flatpak launcher forms. Mobile builds must not link or expose registration and stdio APIs.
- Do not put an endpoint token or workspace path in an agent configuration file.
- Preserve unrelated agent configuration and reject malformed or conflicting `nevo` entries without overwriting them.
- Do not add a new persistent Nevo registration flag; read the current agent configuration.
- Preserve all user-owned dirty-worktree changes and make no commits while this worktree is dirty.

## Review Focus

- Existing `nevo` entry points to a different program: display conflict and leave it untouched without an explicit replacement action.
- Config file changes between read and write: fail with a conflict and preserve the newer content.
- AppImage or Flatpak registration: store a command that remains executable after the GUI process exits.
- Bridge off or app closed: the stdio server starts and reports a useful tool error without leaking a token.
- Windows release binary: `--mcp-server` responds over inherited stdio despite the GUI subsystem setting.

---

### Task 1: Shared tool contract

**Files:** Create `packages/mcp-server/src/tools/catalog.json`; modify `packages/mcp-server/src/tools/notes.ts`, its tests, and build configuration if needed.

**Interfaces:** Produce an array of `{ name, title, description, method, access, inputSchema }`. The Rust launcher consumes the same JSON with `include_str!`, and Node maps each declaration to a bridge request with unchanged arguments.

- [ ] Add a failing Node test that loads the catalog and asserts nine unique tool names, the literal `notes.editorSnapshot` read access, and valid required arguments. Run `pnpm --filter @nevo/mcp-server test` and observe the missing catalog failure.
- [ ] Move the current declarations from `notes.ts` into the catalog and make `READ_TOOLS`, `WRITE_TOOLS`, `ALL_TOOLS`, `findTool`, and `runTool` consume it. Keep the existing public Node exports and tests working. Re-run the package test and build.
- [ ] Add a Rust contract test that deserializes the catalog and asserts each method is declared by `mcp_bridge::handlers::access_for` with the same access classification. Run the focused Rust test.

### Task 2: Built-in stdio launcher

**Files:** Create `src-tauri/src/mcp_stdio/{mod,tools,endpoint}.rs`; modify `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, and desktop Cargo dependencies.

**Interfaces:** `mcp_stdio::run() -> Result<(), String>` handles stdio; `mcp_stdio::tools` maps catalog names to bridge methods; `mcp_stdio::endpoint` loads and validates the existing endpoint descriptor per call.

- [ ] Add failing Rust tests for catalog parsing, endpoint invalid/missing cases, and bridge error mapping. Run focused tests and observe missing module/API failures.
- [ ] Implement endpoint lookup and HTTP forwarding with the existing 30-second timeout and 1 MiB response limit. Return errors as MCP tool results. Re-run focused tests.
- [ ] Add a failing child-process handshake test using a fixture endpoint, then implement `--mcp-server` dispatch and rmcp stdio server. Assert initialize, tools/list, and a failed tools/call produce protocol messages on stdout only. Run the focused test and `cargo fmt --check`.

### Task 3: Safe Codex and Claude Code registration

**Files:** Create `src-tauri/src/commands/mcp_registration/{mod.rs,paths.rs,codex.rs,claude.rs,write.rs}.rs`; modify `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/mcp.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, and `src/tauri/mcp.ts`.

**Interfaces:** `get_mcp_agent_status() -> { codex, claudeCode }`, `connect_mcp_agent(agent, replace_conflict) -> status`, and `disconnect_mcp_agent(agent) -> status`. Each client status is `notConfigured | connected | needsReconnect | conflict | error` with an optional safe message. UI never supplies a config path.

- [ ] Add failing Rust tests using temporary profile directories for preserving unrelated TOML/JSON keys, idempotent connect/disconnect, conflicting entries, malformed files, symlinks, backup permissions, and concurrent changes. Run focused tests to confirm missing API failures.
- [ ] Implement one client parser per file and shared owner-only atomic update with change detection and a single non-overwriting backup. Use `toml_edit` for Codex and `serde_json` for Claude. Re-run focused tests.
- [ ] Add launcher-path tests for native installs, AppImage, and Flatpak; implement platform resolution with no dev-build registration. Register the desktop-only Tauri commands and typed frontend wrappers. Run focused Rust tests and check command names/payload casing against the wrapper.

### Task 4: Settings UI and documentation

**Files:** Modify `src/app/components/settings/SettingsMcpPanel.vue` and its test; update `src/locales/{de,en,es,fr,ru}.json`, `src/styles/settings-panels.css`, `docs/mcp-bridge.md`, `packages/mcp-server/README.md`, `ARCHITECTURE.md`, and `changes.md`.

**Interfaces:** The panel reads status on mount and after a registration action. The bridge mode and registration remain independent. Conflict replacement requires an explicit UI confirmation.

- [ ] Add failing component tests for separate agent statuses, connecting one agent, conflict confirmation, mode staying off, error text, and mobile disabled state. Run the focused Vitest file.
- [ ] Implement the two connection rows and actions with i18n, status refresh, visible focus, and safe errors. Re-run the focused test plus locale consistency tests.
- [ ] Update setup documentation to lead with the in-app flow, preserve manual setup as a fallback, and record verified behavior in `changes.md` after implementation checks pass.

### Task 5: Integrated verification and package paths

**Files:** Adjust release/packaging files only if installed launcher smoke checks reveal a missing path or platform gate.

**Interfaces:** Every shipped desktop package registers a stable executable command and completes an MCP stdio handshake.

- [ ] Run Node package tests/build, focused frontend tests, locale tests, changed-file ESLint, `pnpm build`, targeted/full Rust tests, `cargo fmt --check`, and the diff-scoped `nevo-verify-change` script. Inspect every failure against the pre-existing dirty baseline.
- [ ] Smoke test the locally available installed package paths; record untested macOS/Windows/Flatpak paths explicitly if their runners are unavailable. Review light/dark, narrow settings layout, and keyboard focus.
- [ ] Inspect `git diff --check`, the scoped diff, security/permission impact, and platform cfg symmetry. Update `graphify` after source and documentation changes.
