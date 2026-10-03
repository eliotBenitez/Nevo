# 0003 — Reject newer manifests, open older ones unchanged

**Status:** Accepted, September 2026.

## Context

A workspace is a directory the user owns. Nothing stops them from opening it with two different Nevo builds — a stable install and a beta, or the same machine before and after an update. The manifest at the workspace root is rewritten on essentially every structural change, so an older build encountering a newer manifest would rewrite it on the very next save and silently drop every field it did not understand.

Losing a user's folder structure because they opened their notes with yesterday's build is the worst failure this application can have. Silent and irreversible.

Two protections are needed, and they solve different problems:

- **Unknown fields inside a known shape** — a newer build added a property to a note or folder entry. Cheap to survive: carry the fields through a load/save round trip untouched.
- **A changed shape** — a newer build reorganized the manifest itself. No amount of field preservation helps; the old build's understanding of the structure is simply wrong.

## Decision

`WorkspaceManifest` carries a `schemaVersion`. `CURRENT_WORKSPACE_SCHEMA_VERSION` (`src-tauri/src/commands/workspace/types.rs`) is the highest this build understands.

- **Newer than supported → refuse to open.** `open_workspace` returns `workspace-schema-too-new:<found>:<supported>` and writes nothing. Refusing a workspace must leave it exactly as it was found, so the version check runs before any write into the directory.
- **Older than supported → open unchanged.** No migration ladder exists yet, and no version bump happens on open.
- **Unknown fields are preserved verbatim** through load/save via `#[serde(flatten)]` catch-all `extra` fields on the manifest's entry types.

The two mechanisms are deliberately layered: `extra` handles additive change, the version gate handles structural change. Neither substitutes for the other.

## Consequences

- Adding a field to a note or folder entry needs no version bump. Reorganizing the manifest's shape does.
- When a migration ladder becomes necessary, it belongs immediately before the version check in `open_workspace` — a step-by-step `match` on `schema_version`, each step bumping by exactly one. Anything else makes the ladder untestable.
- `workspace-schema-too-new:<found>:<supported>` is a contract with the frontend, not a log line. `src/utils/workspaceSchemaError.ts` parses it so every surface that opens or imports a workspace recognizes it instead of showing a generic failure. The workspace-archive import gate (`src-tauri/src/commands/workspace_transfer/header.rs`) returns the same prefix for the same reason — keep them in step.
- Every version change needs legacy-data and round-trip coverage. See `docs/data-model.md` for the per-artifact checklist; the existing tests in `src-tauri/src/commands/workspace/manifest.rs` show the pattern for all three cases.

## Related

The workspace note index uses a different and simpler mechanism — `PRAGMA user_version` in `src-tauri/src/commands/note_index/schema.rs` — because it is a derived cache that can be rebuilt from the manifest. The manifest cannot. Do not copy one approach to the other.
