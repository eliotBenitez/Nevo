# Architecture

This document describes how Nevo's runtime actually works: the process model, startup
sequence, workspace/note lifecycles, state ownership, and the major feature subsystems.
For contribution rules (style, verification matrix, module boundaries you must respect
when editing) see `AGENTS.md` — this file explains mechanics, not conduct.

## 1. Process model

Nevo is a Tauri v2 app: a Vue 3 webview (the "frontend", everything under `src/`) paired
with a Rust host process (`src-tauri/`). The two communicate exclusively through Tauri's
IPC — there is no other channel between them.

- Every backend entry point is a `#[tauri::command]` function in
  `src-tauri/src/commands/**`, registered once in the `tauri::generate_handler![...]` list
  in `src-tauri/src/lib.rs`. A command not listed there is unreachable from the frontend
  even if the function compiles and is `pub`.
- The frontend never calls `invoke()` directly from feature code. Every command has a
  typed wrapper grouped by domain in `src/tauri/commands.ts` (e.g. `workspaceCommands`,
  `noteCommands`, `systemCommands`). Each wrapper goes through a shared `invokeCommand<T>`
  helper that logs failures via `appLogger` before rethrowing. One group is misleadingly
  named: `collabCommands` is not a collaboration API — it is the legacy-Yjs migration
  surface (`loadYjsState`, `hasLegacyCollabDir`, `archiveLegacyCollabDir`) described in §7.
- **Casing convention**: Rust command names and their function names are `snake_case`
  (`save_note`, `load_workspace_manifest`). The TS wrapper method names are `camelCase`
  (`saveNote`, `loadManifest`), and the JS object passed as `invoke()`'s second argument
  uses `camelCase` keys (`{ workspacePath, note }`) — Tauri's IPC layer maps those to the
  command function's `snake_case` parameter names automatically. Struct fields crossing
  the boundary follow the same rule: Rust structs annotate individual fields with
  `#[serde(rename = "camelCase")]` (see `WorkspaceManifest` in
  `src-tauri/src/commands/workspace/types.rs`) so the wire JSON matches the TS interface
  in `src/types/*.ts` field-for-field.
- Two custom URI schemes are registered directly on the `tauri::Builder` in `lib.rs`, not
  through `generate_handler!`: `nevoasset://` serves files from the active workspace's
  `.nevo/assets` and `.nevo/plugins` (via `commands::path_utils::workspace_asset_response`
  — see §3, "active workspace root"), and `nevoplugin://` / `nevoplugin-asset://` serve
  plugin code and plugin-declared assets.
- Heavy commands are `async fn` that immediately `tauri::async_runtime::spawn_blocking`
  the real work (e.g. `note::create_note`, `note::save_note`, every workspace-settings
  command) — Tauri v2 dispatches command handlers on the webview's main thread, so blocking
  filesystem I/O there would freeze the UI.
- A window close is intercepted (`CloseGuard` + the `nevo://close-requested` event) so the
  frontend can flush pending saves before the process actually exits; `allow_app_close`
  re-issues the close once flushing is done.

## 2. Startup sequence

`src/main.ts`'s `bootstrap()` runs these steps in order; each one may assume the previous
one has completed, but never that a later one has:

1. `createApp(App)`, then install `pinia`, `router`, and `i18n` as Vue plugins. No store,
   route, or translation may be used before this point.
2. `useWorkspaceStore().init()` — loads `AppConfig` and `AppMetadata` from the Rust side
   (`configCommands.loadAppConfig` / `getAppMetadata`), falling back to in-memory defaults
   if the calls fail (first run, or a non-Tauri web dev context). Populates `recents` and
   calls `applyAppLocale` from the loaded config. No workspace is open yet.
3. `document.documentElement.dataset.platform` is set from `workspaceStore.appMetadata`
   — CSS and platform-conditional code may rely on this attribute existing after this
   point, not before.
4. `useThemeStore().init()` — depends on `appConfig` already being loaded (step 2).
5. `initGlobalShortcuts()` — registers app-level hotkeys; does not depend on a workspace.
6. `workspaceStore.restoreLastWorkspace()` — tries each entry in `recents` (freshest
   `lastOpened` first, via `getRestoreCandidates`) until `openWorkspace` succeeds or the
   list is exhausted; a workspace rejected for a newer schema version (see §3) is skipped
   like any other unopenable candidate, never retried.
7. `router.replace('/workspace' | '/onboarding')` based on whether step 6 succeeded.
8. `app.mount('#app')`.
9. `void runLegacyCloudCleanup()` — fire-and-forget, deliberately *after* mount so it can
   never race or delay first paint. One-time removal of state left over from the removed
   cloud/shared-storage feature (`src/app/legacyCloudCleanup.ts`); see §7.

## 3. Workspace lifecycle

A workspace is a directory on disk; see `docs/data-model.md` for its exact layout. The
lifecycle lives mostly in `src/stores/workspace.ts` (frontend orchestration) and
`src-tauri/src/commands/workspace/manifest.rs` (the `create_workspace` / `open_workspace`
commands).

**Create** (`createWorkspace` → `workspace::create_workspace`): normalizes the path,
creates `.nevo/plugins/`, installs bundled system plugins
(`ensure_bundled_system_plugins`), creates `notes/` and `folders/`, writes a fresh
`WorkspaceManifest` (`schema_version: 1`) to `.nevo/workspace.json`, writes default
`WorkspaceSettings` to `.nevo/settings.json`, then calls `activate_workspace_root`.

**Open** (`openWorkspace` → `workspace::open_workspace`):
1. Read and parse `.nevo/workspace.json`.
2. **Schema-version gate**: if `manifest.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION`
   (`src-tauri/src/commands/workspace/types.rs`, currently `2`), the open is rejected
   with `workspace-schema-too-new:<found>:<supported>` *before any write touches the
   workspace* — an older build must never silently downgrade a workspace a newer build
   has already migrated forward. An older `schema_version` than current still opens
   unmodified; there is no migration ladder yet (see `docs/data-model.md` §2 for where one
   would go).
3. Only once the manifest is accepted: roll forward any interrupted snapshot restore
   (`restore_journal::recover_pending_restores`, never fails the open), install bundled
   system plugins, and prune trash entries older than `settings.files.trash_retention_days`.
4. `activate_workspace_root(path)` — see below.
5. On the frontend, `openWorkspace()` additionally runs `migrateLegacyYjsState` (folds any
   leftover per-note `.nevo/collab/<id>.yjs` into `note.json`; see §7) before
   `hydrateWorkspaceState()` reads settings, plugins, diagnostics, and sidebar previews.

**Active workspace root**: `activate_workspace_root` (`src-tauri/src/commands/path_utils.rs`)
stores the canonicalized workspace path in a process-global `RwLock`. This exists because
the `nevoasset://` and `nevoplugin://` URI-scheme handlers have no other way to know which
workspace's files are safe to serve — they resolve every request's relative path against
this single active root and refuse anything that resolves outside it
(`workspace_file_in_root`). Only one workspace can be "active" for asset-serving purposes
at a time; opening a second workspace replaces it.

**Restore**: `restoreLastWorkspace()` (§2, step 6) is just repeated `openWorkspace` calls
over `recents`, so it inherits all of the above.

**Recent workspace counts**: the welcome and open-workspace screens use
`useRecentWorkspaceNoteCounts` to read each listed workspace's manifest through
`load_workspace_manifest`, without opening or activating that workspace. The composable
owns transient counts, hides them while loading or when a read fails, and ignores results
after its workspace list changes or the screen unmounts. `workspaceNoteCount` counts root
notes plus notes in every nested folder; trash is excluded. Recent entries keep the legacy
`pageCount` field in app config for compatibility, refreshed with this total when a recent
entry is persisted, but the screens use fresh manifest counts rather than that cache.

## 4. Note lifecycle

A note's on-disk identity is `notes/note-<uuid>.nevo` (see `docs/data-model.md`). The
sole content authority is that file: document `content` is read into the live
ProseMirror `EditorView`, while notebook pages live in `notebook` and are edited by
their own session. There is no separate CRDT/Y.Doc layer (removed; see §7).

**Open**: `noteStore.loadNote(noteId)` (`src/stores/note.ts`) checks an in-memory
per-workspace note cache first, otherwise calls `backend.loadNote(noteId)` →
`note::load_note` (Rust) → `noteStore.activeNote`. A `watch` in
`useWorkspaceEditorLifecycle.ts` on `{ id, content }` of the active note then calls
`reinitializeEditor()`, which calls `editorSetup.setupEditorForNote(note, root, settings)`
(`useEditorCore.ts`). That function:
1. Parses `note.content` with `parseNoteContentToDocSafe(schema, note.content)`. If the
   content contains a node type this build's schema cannot parse, it falls back to a
   plain-text stand-in and sets `core.contentPersistenceDisabled = true`, warning the user
   via a persistent toast (`reportDegradedContentNotice`). **This flag must never be
   cleared while that degraded doc is showing** — it is the only thing preventing the
   plain-text stand-in from being serialized back over the note's real, unparseable
   content on the next autosave.
2. Registers an editor "persistence session" (`registerEditorPersistence`) so code outside
   the editor (e.g. a snapshot restore) can suspend/flush this note's saves without
   importing editor internals.
3. Builds the ProseMirror `EditorState` and mounts (or updates) the `EditorView`.

**Edit**: every keystroke becomes a ProseMirror transaction, applied inside the view's
`dispatchTransaction`. When `transaction.docChanged`, `scheduleContentUpdate(nextState.doc)`
debounces a serialize via `createIdleTaskScheduler`. On flush,
`flushPendingContentUpdate()` calls `serializeDocToNoteContent(doc)` and, **only if
`contentPersistenceDisabled` is false**, invokes `callbacks.onContentUpdate(content)`,
which is wired (in `useWorkspaceEditorCore.ts`) to eventually call `noteStore.setContent`.

**The critical rule** (also stated in `AGENTS.md`, restated here because it is easy to get
backwards): **while a note's `EditorView` is mounted, calling `noteStore.setContent`
directly (bypassing the editor) is ignored and clobbered** — the editor's own debounced
flush will overwrite it with whatever is still in the live ProseMirror doc. To change a
node's attributes for a note that is currently open, dispatch a transaction on the live
`EditorView` instead. When the note is **not** open (no mounted `EditorView` for it), go
through `noteStore.setContent` followed by a save — there is no live doc to clobber it.

**Save**: `noteStore.persistActiveNote()` first flushes the registered editor session's
pending content (`session.flushContent()`), then — if `isDirty` — enqueues
`backend.saveNote(note)` on a per-note `saveQueue` that serializes concurrent save
attempts (autosave, blur, navigation, app-close) so the newest revision always wins. On
the Rust side, `note::save_note` (`src-tauri/src/commands/note/crud.rs`):
1. Takes a per-(workspace, note) lock (`note_lock`) shared with the snapshot-restore path.
2. Writes `note.json` atomically (`write_atomic`).
3. Writes a throttled version snapshot (`store_note_snapshot`, ≥300s apart).
4. Updates the note's manifest entry (title/icon/updatedAt) and saves the manifest.
5. Best-effort upserts the note into the SQLite metadata index
   (`note_index::upsert_note_document`) — a failure here is logged but never fails the
   save, because the index is a rebuildable cache (`note_index::reindex_all`).

`create_note`, `move_note`, and `delete_note` follow the same "best-effort index update,
never fails the primary operation" pattern.

**Restore** (history panel → `noteStore.restoreSnapshot(noteId, snapshotId)`,
`src/stores/note.ts`): a save barrier around the backend restore, so it can never race a
concurrent autosave of the note being replaced. When `noteId` is the active note: 1)
`persistActiveNote()` flushes and, if dirty, saves the pending edit first — if that save
fails, the restore never runs; 2) `suspendEditorPersistence(noteId)` stops the mounted
editor session from writing `note.json` out from under the restore; 3) the backend performs
the restore (`restore_note_snapshot`, see `docs/data-model.md` §7 for the merge semantics
and the recovery snapshot it writes before touching anything); 4) `finally`, the note is
force-reloaded from disk (`loadNote(noteId, { force: true })`), bumping the session token so
any save closure still queued from before the restore becomes a no-op instead of
overwriting the restored content. The backend call returns a `RestoreNoteSnapshotResult`
with `warnings` (`manifestPending` and/or `pruneFailed`) for maintenance steps that failed
after the note itself was already durably committed — the caller treats these as a
successful restore with a separate warning, never as a failed restore.

**History navigation**: `/workspace/history` lists notes with snapshots from the workspace
backend. Selecting one opens `/workspace/note/:noteId/history`; the shell flushes pending
editor changes before navigation, then clears the editor's active note while preserving
open tabs and skipping startup-context updates. If the save fails, navigation returns to
the editor with the draft intact. `useNoteHistory` loads the live note and selected snapshot
directly from the backend for comparison, reports a live-note load failure instead of
showing a false no-differences state, and offers a retry; browsing or restoring history
does not open that note in the editor.

## 5. State ownership map

Handwritten notebooks use the canonical note route and the same note store, save
queue, snapshots, tree, and metadata as documents. `WorkspaceNoteHost` classifies
the loaded format before mounting a renderer: documents use `WorkspaceEditorPane`,
valid notebooks use `NotebookView`, and unsupported data uses a read-only diagnostic.
Notebook routes never mount a fake ProseMirror editor or its plugin mutation hooks.
The notebook `/canvas` route is replaced with the canonical note route.
Home and folder routes retain `WorkspaceEditorPane` and its existing plugin runtime.

`src/core/notebook/` owns lossless format validation, immutable page/object
operations, pressure-aware geometry, paper lines, and typed vector rendering.
Notebook composables own input arbitration, camera, selection, bounded history,
checkpoint/autosave scheduling, and export workers. The store holds raw immutable
snapshots; native note commands validate and persist them. `create_notebook`
raises the workspace compatibility gate before writing its first payload.
`selectionTransform.ts` owns immutable uniform scaling, rotation around a shared
selection center, and group fitting within the page; stroke widths stay within
version-1 pen/highlighter limits. `useNotebookSelectionCommands` sends move, scale,
rotation, recolor, duplication, and deletion through the document's existing
budget-checked commit/history boundary; `snapshotBytes.ts` shares UTF-8 delta sizing.
`useNotebookSelectionTransform` owns frozen SVG coordinate transforms, pointer
capture, cancellable page previews, and keyboard handle operations. `NotebookPage`
renders previews without changing the store; `NotebookSelectionOverlay` renders
screen-size controls with a minimum frame for tiny selections. The conditional
`NotebookSelectionToolbar` emits relative scale/angle changes, copy, recolor, and
clear commands. The view suppresses camera gestures during handle drags, keeps
selection on the active page, and handles Ctrl/Meta+D duplication. Each completed
command is one history entry; frame/preview state is excluded from save and export.
Input publishes a new preview point array once per animation frame, so page
rendering updates during pointer contact without committing unfinished ink.
Laser input skips checkpoints and document mutations. `useNotebookLaser` owns
bounded session-only traces, captured release styles, 1.6-second expiry timers,
and disposal guards for late input finalization. `NotebookLaserLayer` draws the
live/released SVG paths and glowing heads, fades released traces, and respects
reduced motion. Page IDs keep transient traces on their original pages; no laser
state enters the store snapshot, history, autosave, thumbnails, or exports.
`arrow.ts` computes a straight shaft and two head segments for both preview and
commit. Arrow gestures skip periodic ink checkpoints and commit all three ordinary
strokes together on completion; the document session owns the single Undo action.
The toolbar exposes arrow drawing separately from moving selected ink.
`ruler.ts` captures either ruler edge at pen/highlighter contact and projects every
sample onto that frozen guide, preserving pressure and the ordinary stroke format.
`useNotebookRulerOverlay` owns session-local visibility, pose, and placement within
the visible page on resize. `useNotebookRuler` owns pointer capture and keyboard
movement/rotation; `NotebookRuler` renders the page-coordinate SVG overlay with
millimeter ticks and constant screen-size controls. Overlay gestures bypass ink and
navigation arbitration and block camera changes until release. No ruler state enters
the document, Undo history, autosave, or export.
`NotebookShapePicker` owns the session-local shape popup and emits a tool choice;
it reuses shared popup positioning, dismissal, and keyboard navigation. Closed
convex half-pressure strokes of up to 65 points use `closedStroke.ts` to build exact constant-width
contours instead of freehand smoothing. Page previews, stored ink, thumbnails,
SVG/vector export, and lasso hit testing share these contours; raw points stay intact.
The page navigator is session-local UI state, starts closed, and can be toggled
from the toolbar at every viewport size.
`useNotebookCreation` immediately creates an untitled ruled notebook in the resolved
placement folder, prevents concurrent submissions, and opens the saved note through
the shell callback. Failures use the shared toast surface. Title and paper remain
editable in the notebook, without a creation dialog. The toolbar centers tools
between settings and actions in one desktop row. Container-size breakpoints reflow
these groups in narrower editor panes, and coarse pointers retain larger targets.
It uses numeric width controls and always includes paper in PDF export.
`savePatch` produces lossless immutable deltas; `saveTransport` sends them to a
worker that reconstructs and serializes the complete note away from input handling.
`src/tauri/notebookSave.ts` passes UTF-8 bytes to `save_notebook_note`. The command
accepts raw bytes and Tauri's Android JSON byte-array representation, enforces the
same byte budget, and rejects invalid byte values. It decodes and validates the
note on a blocking worker and reuses the existing note lock, atomic save, and
history flow. Both transports preserve the same complete persisted note format.
Shell background-save timers persist notebook checkpoints without finalizing the
active pointer contact; explicit save, navigation, and focus loss still flush input.
`commands/notebook_export/` validates vector commands and uses the existing Typst
compiler and destination adapter. Android lifecycle events and URI output are
separate native platform boundaries.

| Layer | Owns | Must never own |
| --- | --- | --- |
| `src/stores/*` (Pinia) | Shared app/workspace/note *metadata* state: active note's JSON snapshot (`note.ts`), workspace manifest/settings/plugins (`workspace.ts`), theme, tree, kanban board lists | Live ProseMirror editor state (`EditorState`/`EditorView`) — see `src/editor-core/AGENTS.md` |
| `src/editor-core/**` | Framework-agnostic ProseMirror schema, commands, plugins, node views, serialization, plugin-host sandboxing | Vue reactivity, Pinia, app components |
| `src/app/composables/**` | Stateful UI logic bridging editor-core and the Vue app (editor lifecycle, paste handling, plugin runtime wiring) | Framework-agnostic algorithms that belong in `src/core`/`src/utils`; ProseMirror state itself (holds a reference via `EditorCore`, does not own the document) |
| `src/core/**` | Framework-agnostic services: the workspace backend adapter (`src/core/workspace-backend/`, currently only `LocalBackend`), canvas/draw data model (`src/core/canvas/`), legacy-Yjs migration (`src/core/legacy-yjs/`), asset limits, block-ref resolution | Vue components, Pinia stores |
| `src/features/**` | Route-level product features (onboarding, graph, drawing, kanban/databases, query) — components + feature-scoped composables/state | Shared cross-feature state (put that in `src/stores`) |
| `src/ui/**` | Reusable presentational primitives and UI composables (popups, dialogs, toasts) | Business/domain state |
| `src-tauri/src/commands/<domain>` | The durable, on-disk source of truth for everything under `docs/data-model.md` | Anything the frontend can compute cheaply from data it already has (denormalized caches belong in `note_index`, not new Rust state) |

`NvIconPicker` renders its catalogue progressively. The per-instance render limit,
scroll container, and focus-driven expansion belong to
`src/ui/composables/useIconPickerProgressiveItems.ts`; the component owns the active
tab and search query. `iconPickerIcons.ts` lazily prepares and caches the shared Lucide
catalogue on first use of the icons tab. `iconPickerEmoji.ts` shares pending/completed
support-filter results and probes
glyphs in deferred, time-bounded batches. These caches are renderer-local and do not
change stored note icons.

## 6. Feature subsystems

- **Editor core + plugin host** — `src/editor-core/index.ts` re-exports the schema
  (`schema/index.ts`), state factory (`state.ts`), serialization (`serialization.ts`), and
  the plugin host (`plugin-host/`, entry `plugin-host/index.ts`). Sandboxed plugins run in
  a Web Worker (`plugin-host/sandboxWorker.ts`) behind a capability-checked message
  protocol (`plugin-host/sandboxProtocol.ts`).
- **Voice recording** — `src-tauri/src/commands/voice_recording/` captures microphone input
  on desktop with `cpal` and writes mono WAV with `hound`. The Rust commands return
  `unsupported` on Android and iOS, where the editor action is hidden. Recordings start
  in `<app_cache>/voice-recordings/` and are imported into workspace assets when stopped. The
  editor renders the temporary placeholder inside a paragraph slot in the
  ProseMirror document and tracks the active widget in plugin state. It reuses
  an empty paragraph or inserts a plain one, then replaces an empty slot with the
  audio block on Stop or inserts beside a slot that gained text. The
  `src/core/voice-recording/activeRecording.ts` registry lets the router, active-note
  watcher, and app-close guard finish recording before the editor is unmounted or saved.
- **Canvas / draw** — the data model and pure editing algorithms live in `src/core/canvas/`
  (entry `index.ts`: geometry, hit-testing, strokes, connectors, mind-map layout,
  migration of legacy canvas shapes). The interactive drawing feature UI is
  `src/features/draw/` (canvas store, context toolbar, properties panel).
- **Graph** — `src/features/graph/index.ts` is the feature entry (`GraphView.vue` for the
  full graph, `LocalGraphPanel.vue` for the per-note local graph), backed by a D3
  force-directed layout and the Rust `graph_*` commands
  (`src-tauri/src/commands/graph.rs`, not covered in depth here). `GraphHeader.vue`
  renders navigation, search, counters, and the phone filter toggle; `GraphView`
  owns search and filter state and forwards navigation events. The right panel's
  Graph tab lazily mounts `LocalGraphPanel` in embedded mode. It renders the active
  note and its direct incoming/outgoing neighbors from `useGraphStore`, with note
  metadata resolved from the workspace tree. The editor lifecycle loads these
  connections when the active note changes; stale asynchronous results are discarded
  so switching notes cannot display the previous note's connections.
- **Databases / Kanban** — `src/features/databases/kanban/` (entry `KanbanView.vue`) is a
  Notion-like board view over kanban boards persisted via the `kanban::*` /
  `kanban_ops::*` Tauri commands.
- **Query / note-index** — `src/features/query/` (`queryBlockData.ts`) renders Dataview-style
  query blocks in the editor against the SQLite note index described in
  `docs/data-model.md`, reached through the `note_index::query_notes` command.
- **MCP bridge** — lets external coding agents read/edit workspace notes over a local
  loopback endpoint. Rust side: `src-tauri/src/mcp_bridge/` (`server.rs`, `http.rs`,
  `webview.rs`, `permissions.rs`, `handlers/{editor,notes,write}.rs`). Installed desktop
  builds expose a headless `--mcp-server` stdio mode in `src-tauri/src/mcp_stdio/`;
  `src-tauri/src/commands/mcp_registration/` safely registers it in Codex and Claude
  Code user configurations. The optional `packages/mcp-server` Node client shares the
  same tool catalog. See `docs/mcp-bridge.md` for setup, access, and the wire protocol.
- **Plugin SDK** — `packages/plugin-sdk` is the public API surface third-party plugins
  compile against (types in `protocol.ts`, conformance checks in `conformance.ts`). See
  `docs/plugins.md`, `docs/plugin-capabilities.md`, and `docs/plugin-security.md` for the
  capability model and sandboxing rules; do not add a new capability without reading
  those.
- **Export / import** — Markdown, HTML and DOCX are **serialized in the frontend**
  (`src/utils/noteExport/{markdownSerializer,htmlSerializer,docxSerializer}.ts`); the Rust
  commands in `src-tauri/src/commands/note/export.rs` receive the already-serialized
  `content` string, pick the destination through a save dialog, and write the file plus its
  copied assets. Adding a block's export therefore means editing the TS serializers, not
  `export.rs`. PDF is the exception: `src/utils/noteExport/buildTypstExport.ts` produces
  Typst source and the `typst_export` command module renders the PDF in Rust — see
  `docs/decisions/0004-pdf-export-via-typst.md`. Markdown/Notion/Obsidian **import**
  parsing lives in `src/utils/noteImport/` (`markdownParser.ts`, `notion/`, `obsidian/`),
  backed by the Rust `notion_import::*` commands
  (`src-tauri/src/commands/notion_import/`) and `note::read_obsidian_vault` /
  `note::import_vault_asset` (`src-tauri/src/commands/note/vault_import.rs`).

## 7. Removed subsystems — do not reintroduce

Two features were fully removed from the app on 2026-09-19: **Yjs-based real-time
collaboration** and **cloud "shared storages"** (multi-device sync + OAuth). If you find
a reference to either while working elsewhere in the codebase, it is one of the following
pieces of intentional, still-needed residue — not a partially-finished removal to "clean
up" as a drive-by:

- `src/core/legacy-yjs/` — decodes and migrates a workspace's old per-note
  `.nevo/collab/<id>.yjs` Y.Doc files into `note.json` the first time such a workspace is
  opened by a build that no longer has live Yjs (`migrateWorkspaceYjs.ts`,
  `decodeLegacyNoteYDoc.ts`). Invoked once per workspace open from
  `workspace.ts`'s `migrateLegacyYjsState` (§3). Needed for as long as pre-migration
  workspaces exist in the wild.
- The `vendor-yjs` Rollup `manualChunks` entry in `vite.config.ts` — keeps the `yjs`
  package (a transitive dependency of the migration code above) in its own lazily-loaded
  chunk instead of the startup bundle.
- `runLegacyCloudCleanup()` (`src/app/legacyCloudCleanup.ts`, called once from `main.ts`,
  §2 step 9) — best-effort, one-time removal of leftover cloud-feature state
  (`localStorage` server URL, an IndexedDB offline cache, secure-store auth secrets).
  Gated by a `localStorage` flag so it runs at most once per install.
- `src-tauri/src/commands/note/collab.rs` and `restore_journal.rs`'s two-entry marker
  handling — a snapshot-restore journal marker written by an *older* build could still
  carry a `.yjs` entry alongside the `note.json` entry; the generic replay logic in
  `restore_journal.rs` rolls both forward without caring how many entries a marker has.

The rationale for both removals is recorded in
`docs/decisions/0001-note-json-single-source-of-truth.md` and
`docs/decisions/0002-remove-cloud-workspaces.md`.

Do not add new Yjs plumbing, a new collaboration transport, or a new cloud-sync/OAuth
flow without an explicit, separate design decision — none of the above is a foothold for
reintroducing either feature.

## 8. Where do I put X?

- **A new user-facing setting** → add the field to the relevant `WorkspaceSettings`
  sub-struct in `src-tauri/src/commands/workspace/types.rs` (with a `#[serde(rename)]` +
  a sensible `default`), mirror it in the matching TS interface in
  `src/types/workspace.ts`, and normalize it in
  `src-tauri/src/commands/workspace/settings.rs::normalize_settings_value`.
- **A new Tauri command** → see `nevo-tauri-command` skill; the checklist (Rust module +
  `generate_handler!` registration + capability + TS wrapper) is easy to half-do.
- **A new ProseMirror node/block/mark** → see `nevo-editor-block` skill; touches schema,
  node view, commands, slash menu, serialization, and every export path.
- **A new plugin capability** → see `nevo-plugin-capability` skill; a capability missing
  from one of several independent registration points fails silently or, worse, becomes
  an unguarded privilege escalation.
- **Shared cross-feature UI state** → a Pinia store in `src/stores/`, never editor state.
- **A framework-agnostic algorithm reused by more than one feature** → `src/core/` or
  `src/utils/`, not duplicated inside a `src/features/*` directory.
- **A new locale string** → see `nevo-i18n-key` skill; all 5 locale catalogs
  (`en, ru, fr, es, de`) must stay key-for-key compatible.
- **Styling for a Vue-owned element** → Tailwind v4 utilities with the `tw:` prefix in the
  template (no Preflight; semantic tokens from `src/styles/tailwind.css`, backed by
  `src/styles/tokens.css`). Keep the element's existing class hook for user custom CSS.
  Utilities live in `@layer utilities`, so any unlayered rule — including a scoped
  `<style>` block — beats them regardless of specificity: delete a declaration from CSS
  when it moves to a utility, and keep shared hooks (`.nv-btn*`, `.search-field`,
  `.ui-input`, …) inside `@layer components`. Plain CSS remains only for tokens, platform
  rules, ProseMirror/generated DOM, JS-driven geometry, keyframes and transition classes;
  `docs/superpowers/specs/2026-09-25-tailwindcss-residual-css.md` lists what stays and why.
