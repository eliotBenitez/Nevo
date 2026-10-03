# 0001 — `note.json` is a note's sole source of truth

**Status:** Accepted, September 2026.

## Context

Note content used to live in a disk-backed Y.Doc at `.nevo/collab/<noteId>.yjs`, with `note.content` serving only to seed a brand-new document. The CRDT existed to support real-time collaboration.

That arrangement cost more than it returned:

- **Two sources of truth.** `note.content` and the Y.Doc could disagree, and the Y.Doc won. Any code outside the editor that wrote `noteStore.setContent` was silently discarded on the next re-serialization — a failure mode with no error and no test that naturally caught it.
- **Opaque persistence.** A binary CRDT update log is not inspectable, not diffable, and not repairable by hand. For a local-first app whose promise is that the user owns the files on their disk, that is the wrong tradeoff.
- **Unused capability.** No collaboration server shipped. The application carried CRDT complexity, a second persistence path, and awareness/presence plumbing for a feature nobody could use.

## Decision

"`note.json`" is the project's name for a note's file; on disk it is `notes/note-<id>.nevo`, holding a `NoteDocument` as JSON (see `docs/data-model.md`).

`note.json` holds a note's entire state — `content` (the ProseMirror document) plus the optional `canvas` snapshot — and is the only thing read on load or written on save. Yjs, y-prosemirror, awareness/presence, and the collaboration server are removed.

Editing a note from outside the editor follows from this:

- **While the note is open**, dispatch a ProseMirror transaction on the live `EditorView`. `noteStore.setContent` is ignored and clobbered by the next autosave.
- **While the note is not open**, `noteStore.setContent` followed by a save.

## Consequences

- Real-time multi-user editing is out of scope. Reintroducing it is a product decision, not a refactor, and would have to answer the two-sources-of-truth problem again.
- Note files are plain JSON: inspectable, diffable, and recoverable. Ordinary version control over a workspace directory now does something useful.
- Durability moves entirely onto the atomic-write path (`write_atomic` in `src-tauri/src/commands/path_utils.rs`), since there is no update log to replay. See `docs/data-model.md`.
- A note whose `content` fails to parse must never be silently overwritten. The degraded-parse guard in `src/app/composables/editor/useEditorCore.ts` blocks the flush; the recovery path must still perform a first write once the content is safely recovered. Test this through real editor setup and the navigation flush, not only the persistence helper.

## Residue

Legitimate, do not remove:

- `src/core/legacy-yjs/` — one-way migration that decodes a legacy `.yjs` file into `note.json`. Needed for as long as workspaces written by pre-removal builds exist.
- The `vendor-yjs` manual chunk in `vite.config.ts` — serves the migration path above.

Any other Y.Doc reference is stale documentation to correct, not an API to call.
