# MCP bridge

The MCP bridge lets external coding agents — Claude Code, codex, or any other MCP client — read and edit the Nevo workspace you have open.

It is **off by default**. Nothing listens until you enable it in Settings.

## How it fits together

```
Codex / Claude Code  ──stdio──▶  nevo --mcp-server  ──HTTP + bearer token──▶  Nevo
```

The agent starts a headless mode of the installed Nevo executable. That process talks to a loopback listener inside the running Nevo app. The bridge then performs each operation through the same code the UI uses, so the workspace manifest, the note index, and note snapshots stay consistent. The Node package in `packages/mcp-server` remains available for manual and development setups.

Two consequences follow from this design:

- **Nevo has to be running**, with a workspace open.
- **The agent never writes workspace files directly**, so it cannot corrupt the manifest or leave the SQLite index out of sync.

## Setup

In an installed desktop build, open **Settings → AI agents** and select **Connect** beside Codex or Claude Code. Nevo updates that agent's user-level MCP configuration. You can connect either or both independently. No terminal, Node.js, or pnpm is needed. Restart the agent if it was already running so it loads the new configuration.

Connecting an agent does not enable access to your notes. In the same settings panel, select a workspace access mode when you are ready; `off` remains the default. Nevo must remain open with a local workspace for the tools to work.

Nevo shows a conflict if an entry named `nevo` already belongs to another setup. It never replaces that entry without an explicit **Replace entry** confirmation. **Disconnect** removes only an entry Nevo registered. If the installed Nevo executable moves, use **Reconnect**. The status is read from the agent's configuration, not from a separate Nevo preference.

The in-app flow is desktop-only. Development builds and other MCP clients can use the manual setup below.

If Codex uses a custom `CODEX_HOME`, Nevo follows it when the desktop app inherits the same environment variable. A shell-only override is not visible to Nevo; in that case, use the manual setup for that Codex profile. Nevo will not claim that a particular agent process has reloaded the configuration.

### Manual setup

The installed Nevo executable can also be registered directly as a stdio server: set the command to its absolute executable path and the argument to `--mcp-server`. For source builds or other setups, build the optional Node server:

```bash
pnpm --filter @nevo/mcp-server build
```

Then register it with your agent, using the absolute path to the built entry point:

```bash
claude mcp add nevo -- node /path/to/nevo/packages/mcp-server/dist/index.js
```

For Codex, add the entry to `~/.codex/config.toml`:

```toml
[mcp_servers.nevo]
command = "node"
args = ["/path/to/nevo/packages/mcp-server/dist/index.js"]
```

or let the CLI write it:

```bash
codex mcp add nevo -- node /path/to/nevo/packages/mcp-server/dist/index.js
```

In Nevo, open **Settings → AI agents** and pick an access mode.

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
| `nevo_read_note` | One note's metadata, document format, and saved content; notebook reads include the raw notebook snapshot |
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

Handwritten notebooks have no ProseMirror `EditorView`. Read responses expose
`format` and preserve `notebook` data, while ProseMirror mutation tools return
an unsupported-editor error for notebook or unknown formats. Moving, archiving,
and other supported metadata operations retain notebook data unchanged. The bridge
does not add handwriting mutation tools or interpret empty PM content as missing ink.

On a local workspace, `note.json` is the note's source of truth, while the open editor owns the live document until it saves. Writing `note.json` from outside the editor would be overwritten by the next autosave — so edits are dispatched as ProseMirror transactions on the live editor view instead. Addressing any other note is refused rather than silently misapplied.

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
- The agent configuration stores only the executable command and `--mcp-server`; neither the bearer token nor a workspace path is stored there. Before changing an existing agent config, Nevo creates an owner-only `.nevo-backup` copy and preserves unrelated settings.
- Nevo detects changes made to an agent config before replacing it and serializes its own registration actions. A separate program that writes at the exact instant of replacement cannot be coordinated portably; the backup is kept for recovery.
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
