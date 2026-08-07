# MCP bridge

The MCP bridge lets external coding agents — Claude Code, codex, or any other MCP client — read and edit the Nevo workspace you have open.

It is **off by default**. Nothing listens until you enable it in Settings.

## How it fits together

```
codex / claude  ──stdio──▶  @nevo/mcp-server  ──HTTP + bearer token──▶  Nevo
```

The agent talks to a small Node process; that process talks to a loopback listener inside the running Nevo app. The bridge then performs each operation through the same code the UI uses, so the workspace manifest, the note index, and note snapshots stay consistent.

Two consequences follow from this design:

- **Nevo has to be running**, with a local workspace open. A cloud workspace has no filesystem path to serve.
- **The agent never writes workspace files directly**, so it cannot corrupt the manifest or leave the SQLite index out of sync.

## Setup

1. Build the server:

   ```bash
   pnpm --filter @nevo/mcp-server build
   ```

2. Register it with your agent, using the absolute path to the built entry point:

   ```bash
   claude mcp add nevo -- node /path/to/nevo/packages/mcp-server/dist/index.js
   ```

   For codex and the ChatGPT desktop app, add the entry to `~/.codex/config.toml` — the two share one MCP configuration on the same host:

   ```toml
   [mcp_servers.nevo]
   command = "node"
   args = ["/path/to/nevo/packages/mcp-server/dist/index.js"]
   ```

   or let the CLI write it:

   ```bash
   codex mcp add nevo -- node /path/to/nevo/packages/mcp-server/dist/index.js
   ```

   The ChatGPT desktop app reads that file but does not pick up changes live: restart it from **Restart** in its MCP servers settings menu. Once configured, the server is available in every chat — there is no per-chat toggle.

3. In Nevo, open **Settings → AI agents** and pick an access mode.

No port or token goes into the agent's configuration. When the bridge starts it writes those to `mcp-endpoint.json` in Nevo's config directory, and the server reads them per call — so restarting Nevo, or switching workspaces, needs no reconfiguration.

## Access modes

The mode is stored per workspace and re-read on **every** request, so revoking access takes effect on the agent's next call rather than after a restart.

| Mode | Effect |
| --- | --- |
| `off` (default) | The bridge does not listen. Tools report that Nevo is unavailable. |
| `read-only` | Read tools work. Writes are refused with a `read_only` error. |
| `ask` | Each write shows a confirmation dialog in Nevo and blocks the agent until you answer. |
| `auto` | Writes are applied without confirmation. |

An unrecognized value in `settings.json` — from a hand edit or a newer version — falls back to `off` rather than to something permissive.

## Tools

**Reading**

| Tool | What it does |
| --- | --- |
| `nevo_workspace_info` | Name, path, and note/folder counts |
| `nevo_list_notes` | Note ids, titles, folder paths; optionally scoped to one folder |
| `nevo_search_notes` | Full-text search across every note, with snippets |
| `nevo_read_note` | One note's metadata and ProseMirror JSON, as saved on disk |
| `nevo_editor_snapshot` | The open note including unsaved changes, plus its revision |

**Writing**

| Tool | What it does |
| --- | --- |
| `nevo_create_note` | Create an empty note, optionally inside a folder |
| `nevo_apply_edit` | Apply ProseMirror operations to the note open in the editor |
| `nevo_move_note` | Move a note to another folder, or to the workspace root |
| `nevo_delete_note` | Move a note to the trash |

There is no permanent-delete tool. An agent can trash a note, which you can restore; it cannot destroy one.

## Editing an open note

Content edits only work on the note **currently open in the editor**, and this is the constraint most worth understanding.

On a local workspace, an open note's content lives in a disk-backed CRDT document (`.nevo/collab/<noteId>.yjs`) that the editor owns. The `.nevo` note file is a serialized copy that the editor rewrites. Writing that file from outside would be ignored and then overwritten — so edits are dispatched as ProseMirror transactions on the live editor view instead. Addressing any other note is refused rather than silently misapplied.

The working loop is read → edit → retry on conflict:

1. `nevo_editor_snapshot` returns `{ noteId, revision, doc }`.
2. `nevo_apply_edit` takes that `revision` plus the operations to apply.
3. If the user typed in between, an edit carrying absolute positions is refused and reports the current revision. Re-read the snapshot and reapply.

Operations use the same vocabulary as the Plugin SDK (`insertText`, `insertNode`, `setNodeAttrs`, `addMark`, `wrap`, …) and are validated by the same code. Positions are ProseMirror document positions, not character offsets — read them from the snapshot's `doc`. To append content, omit `from` from `insertText` or `at` from `insertNode`; the bridge adds it after the existing blocks. Omitting `to` with an explicit `from` makes an operation a pure insertion at that position.

Every mutation stores a note snapshot first, unless you turn that off in Settings, so an agent's change can be rolled back from the note's history.

Structural changes (`nevo_create_note`, `nevo_move_note`, and `nevo_delete_note`) notify the running frontend after the manifest has been written. Nevo then refreshes the in-memory manifest and sidebar previews, so the note tree updates immediately without restarting the application.

## Security model

- The listener binds `127.0.0.1` on a random port and requires a random per-session bearer token.
- The `Host` header is pinned to the bridge's own address, so a web page cannot reach it through a DNS-rebinding attack.
- `mcp-endpoint.json` carries a live token and is written owner-only (mode 0600 on Unix); it is removed when the bridge stops.
- Note ids from the agent are validated before any path is built.
- Content from the agent is untrusted input and goes through the plugin sandbox's transaction validation, never straight into the document.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Nevo is not running, or its MCP bridge is turned off" | The endpoint file is absent: Nevo is closed, or the mode is `off`. |
| "Could not reach Nevo" | The endpoint file exists but nothing answers — Nevo exited without cleaning up, usually a crash. Restart it. |
| "Bridge is in read-only mode" | Switch to `ask` or `auto` in Settings. |
| "No note is open in Nevo" | `nevo_apply_edit` needs the target note open in the editor. |
| "The note changed since revision N" | Someone typed while the agent worked. Re-read the snapshot and retry. |

## Environment

| Variable | Purpose |
| --- | --- |
| `NEVO_MCP_ENDPOINT` | Absolute path to the endpoint file, overriding the config-directory lookup. Useful for portable installs. |
