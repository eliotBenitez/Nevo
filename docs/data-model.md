# Data Model & Persistence

This is the persistence contract for a Nevo workspace: what is stored where, in what
shape, and the durability/compatibility rules that let an older build open data written
by a newer one (and vice versa) without corrupting or silently dropping it. See
`ARCHITECTURE.md` for how these artifacts are read and written during the workspace/note
lifecycle, and `AGENTS.md` for the general "preserve backward compatibility" rule this
document exists to make concrete.

## 1. On-disk layout

```
<workspace>/
  .nevo/
    workspace.json        # WorkspaceManifest — id, tree, root notes, trash, sidebar order
    settings.json          # WorkspaceSettings
    custom.css             # optional user CSS, only read/written if appearance.customCssEnabled
    notes.sqlite            # note metadata index (+ notes.sqlite-wal / -shm under WAL mode)
    plugins/                # installed plugin folders (bundled system + marketplace + user)
    assets/                 # imported images/files/media, content-addressed by hash prefix
    snapshots/<noteId>/     # per-note version history, one JSON file per snapshot
    journal/                # crash-recovery markers for in-flight snapshot restores
    collab/                 # legacy per-note Y.Doc state (pre-migration workspaces only)
    collab-legacy-<ts>/     # archived collab/ backup, written once migration completes
  notes/
    note-<uuid>.nevo        # one NoteDocument (JSON) per note, see §3
  folders/                  # created on workspace init; folder metadata itself lives in
                             # workspace.json's tree, not as files here (see below)
```

Confirmed against `src-tauri/src/commands/workspace/paths.rs` (`settings_path`,
`custom_css_path`, `plugins_dir_path`, `snapshots_dir_path`, `assets_dir_path`,
`notes_dir_path`) and `workspace/manifest.rs::create_workspace`, which creates
`.nevo/plugins/`, `notes/`, and `folders/` and writes `.nevo/workspace.json` +
`.nevo/settings.json`.

**Note filenames**: `note_path()` (`src-tauri/src/commands/note/mod.rs`) maps a note id to
`notes/note-<id>.nevo` after validating the id contains only ASCII alphanumerics, `-`, and
`_` (`path_utils::validate_id`) — this is the path-traversal guard for every command that
takes a note id.

**`folders/` is legacy/vestigial**: folder metadata (`FolderMeta`) is embedded directly in
`workspace.json`'s `tree` array, not stored as separate files. The `folders/` directory is
still created by `create_workspace` but nothing currently writes into it; a full-workspace
export deliberately skips walking it (see `workspace_transfer/collect.rs`'s doc comment on
`collect_full_workspace_files`, which also skips `.nevo/github`, `.nevo/marketplace`, and
the legacy `.nevo/collab*` directories for the same "not authoritative" reason).

## 2. Workspace manifest (`.nevo/workspace.json`)

Rust type: `WorkspaceManifest` in `src-tauri/src/commands/workspace/types.rs`. TS type:
`WorkspaceManifest` in `src/types/workspace.ts`. Every field pairs 1:1 via
`#[serde(rename = "camelCase")]` on the Rust side:

| TS field (camelCase) | Rust field | Notes |
| --- | --- | --- |
| `id` | `id` | UUID, set once at creation |
| `name`, `glyph`, `gradient` | same | display metadata |
| `schemaVersion` | `schema_version` | see version-gate below |
| `createdAt` | `created_at` | RFC3339 |
| `rootOrder` | `root_order` | ordering of root-level note ids |
| `tree` | `tree` | `Vec<FolderMeta>`, recursive — folders and their notes |
| `rootNotes` | `root_notes` | `Vec<NoteMeta>` not inside any folder |
| `trash` | `trash` | `Vec<TrashedItem>`, defaults to `[]` if absent |
| `sidebarNoteOrder` | `sidebar_note_order` | defaults to `[]`; used by the tag-preview sidebar mode |

`NoteMeta`, `FolderMeta`, and `TrashedItem` each carry an `extra:
serde_json::Map<String, Value>` field with `#[serde(default, flatten,
skip_serializing_if = "serde_json::Map::is_empty")]` — **any JSON field this build's Rust
struct doesn't declare round-trips through `extra` unchanged** rather than being silently
dropped on the next save. `WorkspaceManifest` itself has the same `extra` catch-all.
`TrashedItem` also carries a deleted note's `extra` forward
(`note::crud::delete_note_impl`), so restoring it later hands those fields back.

**Schema-version gate** (`CURRENT_WORKSPACE_SCHEMA_VERSION = 2`,
`src-tauri/src/commands/workspace/types.rs:12`): `open_workspace`
(`workspace/manifest.rs`) rejects any manifest whose `schema_version` is **greater** than
this build's constant, with error `workspace-schema-too-new:<found>:<supported>`, *before
any write touches the workspace* — this is what stops an older build from clobbering
fields a newer build already migrated. A manifest whose `schema_version` is **lower**
opens unmodified. New workspaces still start at version 1. Creating the first handwritten
notebook atomically writes version 2 before writing its note payload or metadata. This
gate prevents a reader supporting only version 1 from opening a workspace containing
notebooks. Opening a workspace alone never upgrades it. Importing notebooks into an
existing workspace applies the same gate before copying note files; archive import
rejects a header/manifest mismatch or notebook payload in a version-1 archive.

## 3. `note.json` (`NoteDocument`)

One file per note, `notes/note-<id>.nevo`, holding a `NoteDocument`. Rust type in
`src-tauri/src/commands/note/mod.rs`; TS type `NoteDocument` in `src/types/note.ts`.

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `title`, `icon` | string | |
| `cover` | `string \| undefined` | optional cover image src |
| `folderId` | `string \| null` | |
| `createdAt`, `updatedAt` | string (RFC3339) | |
| `properties` | `NoteProperties \| undefined` | `type`, `tags`, `date`, `status` are indexed into `notes_index`/`note_tags` (§5); unknown keys survive Rust and frontend load/save round trips |
| `content` | `BlockNode` (TS) / `serde_json::Value` (Rust) | the note body, ProseMirror-doc-shaped JSON |
| `canvas` | `CanvasSnapshotV1 \| undefined` | a note's canvas source of truth, when the note has one; `{ version, frame, elements, connectors, order }` (`src/core/canvas/types.ts`) |
| `documentKind` | `'document' \| 'notebook' \| undefined` | absent means a legacy document; this is independent of `properties.type` |
| `notebook` | `NotebookSnapshotV1 \| undefined` | ordered pages and vector ink; only present with `documentKind: 'notebook'` |
| `extra` | catch-all | same round-trip guarantee as the manifest's `extra` |

`note.json` is a note's **sole** source of truth for `content`, `canvas`, and `notebook` — there is
no separate CRDT/Y.Doc copy any more (removed; see `ARCHITECTURE.md` §7). The Rust side
keeps `content` as an untyped `serde_json::Value` deliberately: the backend never needs to
understand ProseMirror's node shapes, only to store and hand back exactly what it was
given.

### 3.1 Handwritten notebooks

Drawn arrows use three ordinary `stroke` objects (shaft and two head segments)
with a shared `actionId`. They are committed atomically and undone together.
They require no new object kind or format version and follow existing stroke
validation, save/reopen, selection, erasing, and vector export paths.

Straight lines are a single two-point `stroke`. An optional `dash` field
(`solid`, `dashed`, or `dotted`; absent means solid) records the line style.
The UI, native SVG, and PDF expand it into filled dashes or dots at render time,
so it introduces no new object kind or format version and keeps the stored
two-point geometry.

Pen and highlighter strokes may carry an optional `path` string. The value
`"modeled"` means the stored points are already the output of the stroke model
(a TypeScript port of Google's Ink Stroke Modeler, see below): smoothed,
resampled to at least 120 points per second of drawing time, with pressure
interpolated and the end caught up to the pen-lift point. Only `"modeled"` changes
rendering: the outline is drawn without the lagging `streamline` filter
(`streamline: 0`, `smoothing: 0.2`, contour ends on the last point). Absent or any other
string renders with the legacy options (`streamline: 0.5`, `smoothing: 0.5`), so
older builds draw modeled strokes with legacy smoothing and keep the data
intact; the codec accepts any string and rejects only non-string values. The
field is copied with the object by erasing, moving, rotating and copying. Strokes
recognized as shapes, lines, arrows, shapes and ruler-guided strokes are never
modeled and carry no `path`. Prediction points of the live preview are never stored.

The model lives in `src/core/notebook/strokeModeler/`. It is ported from
[ink-stroke-modeler-rs](https://github.com/flxzt/ink-stroke-modeler-rs)
(MIT OR Apache-2.0), itself a Rust rewrite of
[google/ink-stroke-modeler](https://github.com/google/ink-stroke-modeler)
(Apache-2.0); license texts and the notice are kept in that folder.

Notebook version 1 stores `pages`, each with a stable `id`, A4 dimensions
`595.28 × 841.89` points, `paper.kind` (`plain`, `grid`, or `ruled`), and ordered
`objects`. An object stores `id`, `actionId`, `kind` (`stroke` or `highlighter`),
six-digit hex `color`, `width`, `opacity`, optional `dash`, and ordered
`{ x, y, pressure? }` points.
Segments of one long stroke share `actionId`; object and page IDs remain unique.
Zero pressure is valid. Unknown keys survive at snapshot, page, paper, object, and
point levels through immutable editing and native raw-JSON storage.

A notebook keeps semantically empty ProseMirror `content` and has no `canvas`.
The frontend codec and native write gate reject inconsistent markers, unsupported
versions/kinds, duplicate IDs, invalid geometry, and oversized data without silently
repairing it. Limits are 1,000 pages, 100,000 objects, 2,000,000 points, 4,096 points
per segment, and 100 MiB serialized data. Unsupported or damaged content is read-only;
saving must not remove its format markers or overwrite an unreadable original.
Ordinary notes are never converted automatically.

**Image objects.** A page object with `kind: "image"` places a raster picture on the
page. Fields: `id`, `actionId`, `src`, `opacity` (0..1), and exactly four `points`
(`{ x, y }`): the top-left, top-right, bottom-right, and bottom-left corners of the
displayed, possibly rotated rectangle. It has no `color`, `width`, or `dash`. `src` is the
`.nevo/assets/<name>` value returned by the asset import command: exactly one non-empty
segment (no `..`, `.`, or backslash) with a `png`, `jpg`, `jpeg`, `webp`, or `gif`
extension; SVG is rejected because it is active content. The codec and the native write
gate share these rules plus non-zero corner area and finite coordinates; a malformed image
makes the notebook `invalid`, while any other unknown `kind` is still `unsupported-kind`.
Objects render in array order (z-order), so ink added after an image lies on top of it. The
editor draws the image as a unit square mapped by `matrix(a b c d e f)` (`a,b = TR − TL`,
`c,d = BL − TL`, `e,f = TL`); native SVG history previews draw a gray placeholder
because an `<img>` data URI cannot load workspace files, and the PDF export embeds the
file. Because geometry is ordinary `points`, move, uniform scale, rotation, copy, and
selection bounds reuse the stroke code paths with a zero width margin. Neither eraser
touches images; they are removed only through selection and Delete. Insertion is a single
Undo step. No notebook version bump or migration: older builds that do not know the
`image` kind classify such a notebook as `unsupported-kind` and open it read-only
without modifying it, and notebooks without images are unaffected. Asset garbage
collection keeps the file because the note JSON contains `.nevo/assets/<name>`.

Notebook snapshots remain immutable raw objects in the common note store and use
the existing save queue and history files. Undo, selection, camera, outline caches,
and thumbnail caches are session state, not additional persisted sources of truth.
Lasso transforms bake uniform scale and rotation into existing stroke `points` and
`width`; recoloring only replaces `color`. Widths remain within the version-1
ranges (pen 0.25–8 pt, highlighter 2–24 pt), and the group is fitted and translated
without clamping individual vertices. Copies retain unknown object/point fields,
receive fresh object/action IDs, preserve segmented action groups, and use a
page-constrained 12 pt offset. Selection frames and drag previews remain session
state. Commands reuse the existing object/point/byte limits and single-step
Undo/Redo; rejected commands leave the snapshot and selection intact. No notebook
schema change or migration was required.

A blank "ghost" page always follows the last page in the editor so writing past the end
adds a page automatically (Goodnotes style). It is session-only state: it is never part of
the snapshot or `note.json` and enters them only in the same commit as the first content
that lands on it, so one Undo removes both the stroke and the page. Touching it with the
eraser, lasso or an empty gesture leaves the notebook unchanged, and no ghost is offered at
the page limit. The manual "Add page" command is unchanged.

The save worker receives lossless page/object deltas and serializes the full note as
UTF-8. Native `save_notebook_note` enforces the same validation and atomic-write path
as `save_note`; the bytes on disk and the workspace compatibility gate are unchanged
by this transport. Unknown fields, deletions, page order, and Undo remain lossless.

**Compatibility contract for new node attributes** (from `src/editor-core/AGENTS.md`,
restated here because it governs a persisted-data format): a new ProseMirror node attribute
must have a safe default and legacy-parse behavior. Treat `content` as a compatibility
contract the same way the manifest's `extra` fields are — a note written with an attribute
this build doesn't know how to interpret must degrade gracefully, not fail to open. The
concrete mechanism for a node type this build's schema cannot parse at all is
`parseNoteContentToDocSafe`, which falls back to a plain-text stand-in and disables
persistence for that note until it is reopened by a build that understands it (see
`ARCHITECTURE.md` §4, "the critical rule").

## 4. Workspace settings (`.nevo/settings.json`)

Rust type `WorkspaceSettings` in `src-tauri/src/commands/workspace/types.rs`; TS type of
the same name in `src/types/workspace.ts`. Sub-sections: `general`, `appearance`, `editor`,
`workspace`, `ai`, `plugins`, `pluginSettings` (a free-form
`Record<string, Record<string, unknown>>` bag, one entry per plugin id — preserved
verbatim), `features`, `mcp`, `hotkeys`, `files`, `advanced`.

`editor.slashMenuLayout` accepts `list` (default), `grid` (four-column keycaps), or
`preview` (three-column block previews). Existing `grid` values remain valid.

**Loading is defensive by construction, not by catching errors**:
`read_workspace_settings` (`src-tauri/src/commands/workspace/settings.rs`) parses the file
as a generic `serde_json::Value` and passes it through
`normalize_settings_value`, which reads each field with `.and_then(...).unwrap_or(default)`
and, for enum-like string fields, `.filter(|v| matches!(*v, "a" | "b" | ...))` before
falling back to a default. A missing file returns `WorkspaceSettings::default()`. This
means: a missing field gets its default, an invalid/out-of-range value (e.g. an
`accentPreset` this build doesn't recognize) silently falls back to the default rather than
failing to load, and **legacy flat fields are migrated on read** — e.g. a top-level
`defaultView`/`editorFontSize`/`spellCheck` from an older settings shape is still honored
via `.or_else(|| object.get("legacyKey")...)` fallbacks (see
`normalize_settings_value`'s tests, `migrates_legacy_flat_settings`). `pluginSettings` is
the one section copied through as opaque JSON without field-by-field validation, since its
shape is plugin-defined.

**Appearance values that no longer drive rendering** (borderless redesign,
`docs/superpowers/specs/2026-09-22-solid-ui-redesign-design.md` §9): `appearance.surfaceStyle`
(`glass | solid | tinted`), `appearance.backgroundScene`, `appearance.sidebarStyle`, and the
app-config `reduceTransparency` are still normalized and round-tripped unchanged, but the UI
ignores them and has no controls for them. New and missing `surfaceStyle` defaults to `solid`
(so an older build opened after a rollback shows no glass). `accentPreset` defaults to
`mineral`; the Rust allow-list is `violet | ember | sage | ocean | rose | azure | mineral`, so a
custom color string saved by the TS accent picker still falls back to `mineral` on the next Rust
read. `appearance.accentColoredHeadings` (`boolean`, defaults to `false`) persists heading accent tints in the editor and round-trips through Rust and frontend normalizers.

`SettingsSectionId` (`src/types/workspace.ts`) enumerates the settings-modal sections:
`general | appearance | editor | workspace | ai | plugins | mcp | hotkeys | files | backup
| advanced | about`.

`.nevo/custom.css` is a separate plain-text file, only loaded/applied when
`settings.appearance.customCssEnabled` is true (`load_custom_css` /
`workspace.ts::loadCustomCss`).

### 4.1 App config (`<app data dir>/config.json`)

Per-user, not per-workspace. Rust type `AppConfig` in `src-tauri/src/commands/config.rs`;
TS type of the same name in `src/types/workspace.ts`, normalized by `normalizeAppConfig`
(`src/utils/workspace-settings/normalizers.ts`). The Rust struct declares every field the
frontend writes (appearance extras such as `interfaceZoom`, `interfaceRoundness`,
`themeSchedule`, `reduceTransparency` as optional values) and keeps any other key in a
`#[serde(flatten)] extra` map, so a save never drops a field Rust does not know yet.

`onboarding` (first-run tour and the Home "First steps" checklist) is stored as an opaque
`Option<serde_json::Value>`; the TS normalizer is its schema authority:
`{ tourStatus: 'pending' | 'completed' | 'dismissed', firstSteps: FirstStepId[],
firstStepsHidden: boolean, seenHints: FirstUseHintId[], hintsEnabled: boolean }`
(`hintsEnabled` defaults to `true` for new and existing users). A config written before this field existed is treated as an
existing user when `recents` is non-empty (`dismissed`, checklist hidden) and as a fresh
install otherwise (`pending`). `firstSteps` holds only event-detected steps; `createWorkspace`
and `takeTour` are derived in `src/stores/onboarding.ts`.

`notebookPalette` (handwritten-notebook color palette, shared across workspaces) is an
optional `{ presets: string[], recents: string[] }`. Colors are lowercase `#rrggbb`;
`presets` are the user's own colors (at most 24, never a builtin color, no duplicates) and
`recents` is the shared most-recently-used ink list (at most 8, newest first). Rust does not
declare it: it round-trips through the `extra` map, and the TS normalizer
(`normalizeNotebookPalette` in `src/core/notebook/palette.ts`, called from `normalizeAppConfig`)
is its schema authority — invalid hex values are dropped and an absent field stays
`undefined`. The notebook writes it via `workspaceStore.saveAppConfig` with an ~800 ms debounce
(`useNotebookPalette`).

`notebookTools` (also shared across workspaces) is an optional
`{ penColor?, markerColor?, strokeWidth?, markerWidth? }` holding the last chosen pen and
marker colors and widths; `strokeWidth` is shared by the pen, line, arrow and shape tools. Every notebook
opens with these values. An absent field means "never changed" and the default applies
(`#000000`, `#f0c419`, 1.5 pt, 12 pt). The normalizer (`normalizeNotebookToolPreferences` in
`src/core/notebook/toolPreferences.ts`) drops invalid hex colors and widths outside the toolbar
ranges (stroke 0.25–8 pt, marker 2–24 pt). Like `notebookPalette`, Rust round-trips it through
`extra`; `useNotebookToolPreferences` writes it with a debounce and flushes on close.

## 5. Note index (SQLite, `.nevo/notes.sqlite`)

Schema in `src-tauri/src/commands/note_index/schema.rs`. `SCHEMA_VERSION = 2`, guarded by
`PRAGMA user_version` (`migrate()` short-circuits once `user_version >= SCHEMA_VERSION`, so
an already-current file skips the `CREATE TABLE`/`CREATE INDEX` batch on every open).
Connection setup: WAL journal mode, 5-second busy timeout
(`open_notes_index`) — mirrors the database-block store's connection settings for
consistent concurrent-reader/writer behavior.

Tables:
- `notes_index(note_id PK, title, folder_id, folder_path, note_type, status, date,
  created_at, updated_at)`
- `note_tags(note_id, tag)` with indexes on both `tag` and `note_id`
- `index_meta(key PK, value)` — currently one key, `backfilled`

**Backfill flag**: `index_meta.backfilled` (checked via `is_backfilled`, set via
`mark_backfilled`) gates a one-time full `reindex_all` walk of the manifest + every note
file — so `query_notes` only pays that cost once per workspace, not on every query. The
explicit `reindex_notes` command (exposed for a frontend "rebuild index" action) also sets
this flag afterward.

**Kept in sync incrementally** by best-effort calls from the note write paths
(`src-tauri/src/commands/note/crud.rs`):
- `create_note_impl` / `save_note_impl` → `note_index::upsert_note_document` (delete+insert
  the note's tag rows, then upsert the `notes_index` row, all in one transaction).
- `delete_note_impl` → `note_index::remove_note`.
- `move_note_impl` → `note_index::upsert_note_document` again with the note's recomputed
  `folder_path`.

Every one of these calls is wrapped so a failure is logged but **never fails the primary
operation** — the index is explicitly a rebuildable cache (`reindex_all`), not a source of
truth.

## 6. Assets (`.nevo/assets/`)

Imported images/files are content-addressed: `hash_bytes` (SHA-256, hex,
`src-tauri/src/commands/note/assets/naming.rs`) is computed over the file bytes, and
`find_existing_asset_path` looks for an existing file already named `<hash>-...` in the
assets directory before writing a new one — a byte-identical re-import reuses the existing
file (`ImportedImageAsset.deduplicated: true`) instead of duplicating it.
`ImportedImageAsset` (`src/types/note.ts` / `src-tauri/src/commands/note/mod.rs`) reports
`{ src, hash, deduplicated, bytes }` back to the caller.

Desktop voice recordings are imported as ordinary WAV assets and referenced by an existing
`media_block` with `kind: 'audio'` in `note.json`. The recording widget is transient
editor state and adds no persisted schema. While recording, a plain paragraph may reserve
its position in the document and be autosaved; Stop replaces an empty slot with the audio
block, while Cancel removes only an empty paragraph created for that recording. Voice
import allows up to 512 MiB, while the
general asset import limit below remains 100 MiB. Desktop audio playback streams through
the local HTTP media server, rather than the size-limited `nevoasset://` handler.

**Size limit**: 100 MiB, enforced in two places that must be kept in sync —
`MAX_ASSET_BYTES` (`src/core/assets/assetLimits.ts`, a fast client-side check before bytes
ever leave the browser) and `MAX_LOCAL_ASSET_BYTES`
(`src-tauri/src/commands/note/assets/import.rs:23`, the real enforcement boundary, since
the frontend check is bypassable by anything calling the IPC command directly). The
`nevoasset://` URI-scheme handler enforces a separate, identically-sized cap
(`MAX_WORKSPACE_ASSET_BYTES`, `src-tauri/src/commands/path_utils.rs:10`) on what it will
serve back out.

**Garbage collection** has two paths:
- `delete_unreferenced_asset` (`src-tauri/src/commands/note/assets/gc.rs`) — deletes one
  named asset only if no current note, legacy collab backup, or `.draw.json` payload still
  references it (`collect_current_asset_refs` scans `notes/`, any `.nevo/collab*`
  directory, `.nevo/boards`, and `.draw.json` files under `.nevo/assets` for
  `.nevo/assets/<name>` substrings).
- `cleanup_orphaned_assets` (`src-tauri/src/commands/workspace/maintenance.rs`, exposed to
  the frontend as `workspaceStore.cleanupOrphanedAssets()`) — a full sweep: computes the
  same reference set once, then removes every file under `.nevo/assets/` not found in it,
  returning a `WorkspaceCleanupReport { removedFiles, bytesFreed }`.

## 7. Snapshots (`.nevo/snapshots/<noteId>/`)

Each snapshot is a full `NoteDocument` JSON file named `<timestamp>-<uuid>.json`
(`create_snapshot_id`, `src-tauri/src/commands/note/snapshots.rs`), where the leading
`%Y%m%d%H%M%S%3f` timestamp is parsed back out for listing metadata without ever
re-reading the file body (`build_snapshot_metas` — with up to 50 snapshots per note,
parsing every one just to list it would be wasteful; `createdAt` comes from the filename,
`updatedAt` from file mtime, since a snapshot is written once and never modified).

`store_note_snapshot` throttles writes to at most one every `SNAPSHOT_MIN_INTERVAL_SECS`
(300s) per note — autosave runs roughly every 2s while typing, so without this the history
would grow by hundreds of full-document copies per session; the note file itself is always
written by `save_note` regardless, so throttling snapshots never risks losing current
content. `prune_note_snapshots_internal` caps each note at the configured retention limit
(oldest removed first by filename sort, which sorts chronologically because of the
timestamp prefix). `snapshot_retention_limit` (`src-tauri/src/commands/note/snapshots.rs`)
reads that limit from workspace settings' `files.snapshotRetentionCount`, an integer
clamped to 1–200; a missing, legacy, or unreadable settings file falls back to the default
of 50 rather than failing the save. Both the autosave path (`store_note_snapshot`) and the
explicit `prune_note_snapshots` command prune to this same limit.

**What a restore changes**: `restore_note_snapshot`
(`src-tauri/src/commands/note/snapshot_restore.rs`) is a merge, not a load-and-overwrite.
Before touching the current note, it durably writes a verbatim recovery snapshot of the
exact current `note.json` bytes — bypassing the 300s throttle above — so every restore is
itself reversible by restoring that recovery snapshot right back; it never writes a
snapshot of the *restored* state. The merge then copies only `title`/`icon`/`cover`/
`properties`/`content`/`canvas`/`documentKind`/`notebook` from the chosen snapshot onto the current note: `id`,
`createdAt`, `folderId`, and any field this build doesn't model are left untouched, and a
field the snapshot doesn't have (e.g. an older snapshot with no `cover` or `canvas`) is
removed from the result rather than left over from the current note. The merge operates on
raw `serde_json::Value`s rather than typed `NoteDocument` fields, so a nested unknown field
(e.g. a newer build's addition inside `properties`) survives byte-for-byte.

Notebook restores require the same supported document format on both sides and a
version-2 workspace gate. Page/object IDs and unknown notebook fields are preserved;
the frontend replaces its immutable session snapshot and resets session Undo.

**Journaled restore**: `restore_note_snapshot` commits the restored `note.json` through
`restore_journal::commit_note_restore` instead of a bare `write_atomic`
(`src-tauri/src/commands/note/restore_journal.rs`). The sequence is: stage a temp file next
to the target (`write_temp_sibling`), write a JSON marker recording `{tmp, target}` pairs
under `.nevo/journal/restore-<noteId>.json` (itself written via `write_atomic`, so the
marker landing on disk is itself durable), *then* rename the staged file into place
(`replace_file_durable`), then delete the marker. If the process crashes between the
marker landing and the final rename, `recover_pending_restores` — called once on every
`open_workspace` — replays each marker's rename; a marker whose target path would escape
the workspace, or that fails to parse, is moved to `.nevo/journal/failed/` (quarantined)
rather than applied or silently dropped. Temporary filesystem or manifest-resync failures
leave the valid marker active so a later workspace open can retry it. The whole restore additionally holds
`note_lock(workspace, noteId)` so it cannot interleave with a concurrent `save_note` for
the same note.

The marker also carries an optional `manifestMetaNoteId`: once the `note.json` rename is
durable, `commit_note_restore` resyncs the workspace manifest's `title`/`icon`/`updatedAt`
for that note from the now-authoritative file, taking its own `manifest_lock`. That resync
can fail independently of the already-committed rename (e.g. a corrupt manifest); when it
does, `restore_note_snapshot` still returns success with
`RestoreNoteSnapshotResult.warnings` containing `manifestPending`, and the marker is kept
so `recover_pending_restores` finishes the resync on the next `open_workspace`. A marker
written by an older build (or the legacy two-entry `.yjs` marker — see the removed-
collaboration residue below) has no `manifestMetaNoteId` and simply skips the resync on
replay. After a successful commit, pruning to the retention limit runs once more; the
recovery snapshot just written is always the newest file, so it survives any limit ≥ 1. If
that prune fails, the restore still reports success with `warnings` containing
`pruneFailed`, since the note itself is already committed.

## 8. Durability rules

- **`write_atomic`** (`src-tauri/src/commands/path_utils.rs`) — write a temp file beside
  the target (`write_temp_sibling`: `create_new`, write, flush, `fsync`), then
  `replace_file_durable` (platform-safe atomic rename — `std::fs::rename` on Unix,
  `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` on Windows — followed by an `fsync` of the
  target's parent directory so the rename itself survives a crash). Use this for **every**
  single-file write that must never be observed half-written: notes, manifest, settings,
  snapshots.
- **Journaled multi-step commits** (`restore_journal.rs`) — required when a logical
  operation must appear atomic across more than one file/step and a partial application
  would be unsafe to leave as-is. Currently used only by snapshot restore.
- **Locking**: `note_lock(workspace, noteId)` serializes `save_note` against a concurrent
  snapshot restore for the same note (per-process only — it says nothing about a second
  process or device writing the same `note.json`, and there is no on-disk
  optimistic-concurrency field to detect that). `manifest_lock(workspace)` serializes
  manifest read-modify-write cycles across note create/save/delete/move.
- **Never silently overwrite degraded/unparseable data**: a note whose stored `content`
  fails to parse cleanly must never be saved back over by whatever degraded/plain-text
  form was shown instead (§3, `contentPersistenceDisabled` in `ARCHITECTURE.md` §4). The
  equivalent rule for local note persistence in general — a permission failure to save
  must be distinguished from "no save was ever needed" — is stated in `AGENTS.md`'s
  Platform Gotchas section; it must be verified through real editor setup and the
  navigation flush, not the persistence helper in isolation (see `docs/testing.md` §4).

## 9. How to add a migration

There is currently no live migration ladder for any artifact — each one documents where a
future one goes. When you need to add one:

**Workspace manifest** (`schema_version` in `workspace.json`):
1. Bump `CURRENT_WORKSPACE_SCHEMA_VERSION` in
   `src-tauri/src/commands/workspace/types.rs`.
2. Add a step-by-step `match manifest.schema_version { N => { ...; manifest.schema_version = N + 1 } ... }`
   upgrade in `open_workspace` (`manifest.rs`), run *before* the
   `schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION` rejection, so old data is upgraded
   in place rather than rejected.
3. Coverage: a round-trip test proving a manifest at the old version opens, upgrades, and
   saves correctly; a legacy-data test using a hand-built old-shape JSON fixture (see the
   existing `open_workspace_still_opens_an_older_schema_version` test for the pattern); a
   failure-path test for a manifest whose version is *newer* than supported (must still be
   rejected, unmodified, exactly as today).

**`note.json`**: prefer additive fields with `#[serde(default)]` / a TS optional field, so
old notes parse without a dedicated migration at all — this is the same mechanism the
`extra` catch-all and `parseNoteContentToDocSafe`'s degraded-fallback already provide for
the editor content itself. If a genuine shape change is unavoidable, follow
`src/editor-core/AGENTS.md`: safe defaults, legacy parse, and add coverage in
`src/editor-core/__tests__/serialization.test.ts` (round-trip with the new shape) *and* a
regression fixture using the old shape (legacy-data coverage).

**Settings** (`.nevo/settings.json`): add the new field with a `default_*()` function and
`#[serde(default = "...")]` on the Rust struct, then add its normalization in
`normalize_settings_value` (`settings.rs`) — including any legacy-key fallback if the field
replaces something under a different name. Coverage: a test in `settings.rs`'s own
`#[cfg(test)]` module asserting the new field's default when absent, and, if replacing a
legacy field, a `migrates_legacy_*` test in the same style as
`migrates_legacy_flat_settings`.

**SQLite note index**: bump `SCHEMA_VERSION` in
`src-tauri/src/commands/note_index/schema.rs` and extend `migrate()`'s `CREATE
TABLE`/`ALTER TABLE` batch — remember it currently only ever creates fresh tables
(`CREATE TABLE IF NOT EXISTS`), so a genuine column addition to an existing table needs an
explicit `ALTER TABLE` step gated by the old `user_version`, not just a higher
`CREATE TABLE IF NOT EXISTS` statement. Coverage: since this index is a rebuildable cache,
the required proof is that `reindex_all` from scratch and the incremental
create/save/move/delete hooks all produce the same rows post-migration — extend the
existing round-trip tests in `note_index/index.rs` and `schema.rs`'s
`schema_creation_is_idempotent_and_migration_guard_short_circuits` pattern, plus a
failure-path check that a partially-migrated / corrupt database is handled without losing
the ability to fall back to a full `reindex_all`.
