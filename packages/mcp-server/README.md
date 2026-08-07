# @nevo/mcp-server

MCP server that exposes the Nevo workspace you currently have open to an external coding agent (Claude Code, codex, or any other MCP client).

It does not read the vault directly. It talks to a loopback bridge inside the running Nevo app, which performs every operation through the same code paths the UI uses — so the workspace manifest, the note index, and note snapshots stay consistent.

## Requirements

- Node.js 20 or newer
- Nevo running, with a **local** workspace open (cloud workspaces have no filesystem path to serve)
- The MCP bridge enabled in Nevo's settings (it is **off** by default)

## Setup

Build the server:

```bash
pnpm --filter @nevo/mcp-server build
```

Register it with your agent, pointing at the built entry point:

```bash
claude mcp add nevo -- node /absolute/path/to/nevo/packages/mcp-server/dist/index.js
```

For codex and the ChatGPT desktop app, add the entry to `~/.codex/config.toml` — both read the same MCP configuration:

```toml
[mcp_servers.nevo]
command = "node"
args = ["/absolute/path/to/nevo/packages/mcp-server/dist/index.js"]
```

Restart the ChatGPT desktop app afterwards (**Restart** in its MCP servers settings menu); it does not reload the file on its own.

No port or token goes in the config. Nevo writes those to an endpoint file in its config directory when the bridge starts, and the server reads them per call — so restarting Nevo or switching workspaces needs no reconfiguration.

## Tools

**Reading**

| Tool | What it does |
| --- | --- |
| `nevo_workspace_info` | Name, path, and note/folder counts of the open workspace |
| `nevo_list_notes` | Note ids, titles, and folder paths; optionally scoped to one folder |
| `nevo_search_notes` | Full-text search across every note, returning matching blocks with snippets |
| `nevo_read_note` | One note's metadata and its ProseMirror document JSON, as saved on disk |
| `nevo_editor_snapshot` | The note open in the editor, including unsaved changes, plus its revision |

**Writing**

| Tool | What it does |
| --- | --- |
| `nevo_create_note` | Create an empty note, optionally inside a folder |
| `nevo_apply_edit` | Apply ProseMirror operations to the note open in the editor |
| `nevo_move_note` | Move a note to another folder, or to the workspace root |
| `nevo_delete_note` | Move a note to the trash (there is no permanent delete) |

`nevo_read_note` returns the copy saved on disk, which lags the editor by the save debounce. `nevo_editor_snapshot` returns the live document instead — use it before editing.

## Editing an open note

Content edits only work on the note **currently open in the editor**. On a local workspace an open note's content lives in a CRDT document that the editor owns; writing the file behind its back would be ignored and then overwritten. Editing a different note is refused rather than silently misapplied.

The flow is read → edit → retry on conflict:

1. `nevo_editor_snapshot` returns `{ noteId, revision, doc }`.
2. `nevo_apply_edit` takes that `revision` plus ProseMirror operations.
3. If the user typed in the meantime, an edit carrying absolute positions is refused with the current revision. Re-read the snapshot and reapply.

Positions are ProseMirror document positions, not character offsets — read them from the snapshot's `doc`. To add content at the end, omit `from` from `insertText` or `at` from `insertNode`; Nevo appends it after the existing blocks. Omitting `to` on an operation with an explicit `from` makes it a pure insertion at that position.

Every mutation stores a note snapshot first (unless `autoSnapshot` is disabled), so the user can roll an agent's change back from the note's history.

## Access modes

The mode is set per workspace in Nevo and re-read on every call, so revoking access takes effect immediately.

| Mode | Effect |
| --- | --- |
| `off` (default) | The bridge does not listen at all; tools report that Nevo is unavailable |
| `read-only` | Read tools work; writes are refused |
| `ask` | Each write shows a confirmation dialog in Nevo and waits for the answer |
| `auto` | Writes are applied without confirmation |

In `ask` mode the agent's call blocks until the user answers, and a denial comes back as a `declined` error.

## Environment

| Variable | Purpose |
| --- | --- |
| `NEVO_MCP_ENDPOINT` | Absolute path to the endpoint file, overriding the default config-directory lookup. Useful for portable installs. |

## Security

The bridge listens on `127.0.0.1` only, on a random port, and requires a random per-session bearer token. It also pins the `Host` header to its own address, so a web page cannot reach it through a rebinding attack. The endpoint file holds a live token and is written owner-only (mode 0600 on Unix); it is removed when the bridge stops.
