# Testing

How testing is actually organized and run in this repo. For *which* checks a given change
requires, see the Verification Matrix in `AGENTS.md`; this document explains how those
checks work and how to run them, plus the load-bearing suites you should understand before
touching editor persistence, localization, or the SQLite index.

## 1. Layout and runners

**Frontend (Vitest)**: tests are colocated with their implementation as `*.test.ts` /
`*.test.ts` next to the file they cover (e.g.
`src/app/composables/editor/useEditorCore.test.ts` beside `useEditorCore.ts`), plus a
dedicated directory for editor-wide behavior: `src/editor-core/__tests__/`. There are 241
frontend test files in the repo today. Configuration lives in `vite.config.ts`'s `test`
block: `environment: 'jsdom'`, `globals: true` (so `describe`/`it`/`expect`/`vi` are
available without an import).

**Rust (cargo test)**: tests live inline in each command module as a trailing `#[cfg(test)]
mod tests { ... }` block (e.g. `src-tauri/src/commands/workspace/manifest.rs`,
`note_index/schema.rs`, `workspace/marketplace/tests.rs` — the latter split into its own
file because the module it tests is itself split across several files under
`workspace/marketplace/`). Run via `cargo test --manifest-path src-tauri/Cargo.toml`.

Commands, from `package.json`:
- `pnpm dev` — Vite dev server (strict port 1420).
- `pnpm build` — `vue-tsc --noEmit && vite build && node build-tools/check-bundle-size.mjs`.
  Type-checks the whole project before bundling; a change that breaks a public component
  contract or a type used across a module boundary is caught here even if no test exercises
  it.
- `pnpm test` — Vitest in watch mode.
- `pnpm test:run` — Vitest once (CI mode).
- `pnpm lint` — ESLint over the frontend tree.

## 2. Focused runs

- `pnpm exec vitest run <path>` — run one file or glob without the full suite. Prefer this
  while iterating; only run the full `pnpm test:run` before declaring a change done.
- `cargo test --manifest-path src-tauri/Cargo.toml <filter>` — `<filter>` matches on test
  name substring, e.g. `cargo test --manifest-path src-tauri/Cargo.toml manifest_round_trip`.
- `.codex/skills/nevo-verify-change/scripts/verify_change.sh --run` — derives the check list
  from the current `git diff` and runs it; add `--full` to force the full frontend + Rust
  gate set regardless of diff scope, and `--base <ref>` to diff against something other than
  the default base. Run this before reporting any change complete; it is the practical
  implementation of the Verification Matrix in `AGENTS.md`.

## 3. The load-bearing suites

These are worth understanding before you touch the areas they cover, because a change can
compile and still violate what they check.

- **`src/editor-core/__tests__/serialization.test.ts`** — round-trips a `BlockNode` tree
  (callouts, nested lists, checklist items, dividers, marks, math blocks, and more) through
  `parseNoteContentToDoc` → `serializeDocToNoteContent` and asserts the JSON is unchanged.
  This is the guard against a schema/serializer change that silently mutates or drops
  content on save. Run for any change to `src/editor-core/schema/**` or
  `src/editor-core/serialization.ts`.
- **`src/editor-core/__tests__/regression.test.ts`** — the largest editor test file
  (1300+ lines). Exercises real keyboard/command behavior against a live
  `createNevoEditorState` + `EditorView` — key dispatch (`dispatchEditorKey`), text input
  (`dispatchTextInput`), selection, keymap commands — normalizing expected output through
  `stripNullBlockIds` so lazily-assigned block ids don't make every fixture brittle. Run
  for any change to commands, keymap, selection handling, undo/redo, or node-view
  behavior.
- **`src/locales/locales.test.ts`** — asserts every non-English locale (`ru`, `fr`, `es`,
  `de`) has exactly the same flattened key set as `en.json` (`flattenKeys` recursion), plus
  a couple of shape-specific assertions (e.g. `editor.queryBlock.fields` must exist with
  the same field names in every locale). This is what "all 5 locales must stay
  key-for-key compatible" (`AGENTS.md`) actually enforces mechanically.
- **`src/i18n.test.ts`** — asserts `applyAppLocale` actually switches `i18n.global.locale`
  and `document.documentElement.lang` for every registered locale (`en`, `ru`, and,
  parametrized, `fr`/`es`/`de`). Catches a new locale being added to the catalogs but not
  wired into the locale-switching mechanism itself.
- **`src/app/composables/editor/useEditorCore.persistence.test.ts`** — see §4 below; this
  is the one that actually proves the note-persistence contract end to end rather than in
  isolation.

- **`src/styles/*.test.ts` (style contracts)** — read source text rather than render:
  `no-backdrop-filter.test.ts` forbids surface blur; `tailwind-cascade.test.ts` pins the
  layer order and asserts the global focus rings and shared hooks (`.nv-btn`,
  `.search-field`, `.ui-input`) stay layered so `tw:` utilities can override them;
  `tailwind-class-conflicts.test.ts` fails when an element's static `class` and its
  `:class` both carry a `tw:` utility for the same property and variant (equal
  specificity, so Tailwind's sort order — not intent — would pick the winner). The last
  one cannot see classes returned by helper functions. Run `pnpm exec vitest run
  src/styles` for any change to templates' `tw:` classes or to `src/styles/**`.

Run `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts` for any change
touching `src/locales/**`, `src/i18n.ts`, or locale types — this is also called out
explicitly in `AGENTS.md`'s Verification Matrix.

## 4. Testing the editor properly

The platform rule (`AGENTS.md`, Platform Gotchas): local note persistence must be tested
through **real editor setup and the navigation flush**, not only the persistence helper in
isolation. `useEditorCore.persistence.test.ts` is the canonical example of this pattern —
its own top comment explains why: `note.json` is a note's only copy of its content, so
these tests exercise the same flush path `WorkspaceShell`'s navigation-away watcher uses in
production (`noteStore.saveNote()` → `persistActiveNote()` → the registered editor
session's `flushContent()`), not a mocked shortcut.

The setup/teardown pattern to copy:

```ts
// 1. Seed Pinia + the note store with the note under test.
setActivePinia(createPinia())
const noteStore = useNoteStore()
noteStore.activeNote = createNote(content)
noteStore.isDirty = false

// 2. Create a real EditorCore and mount a REAL EditorView into a detached DOM node.
const core = createEditorCore()
core.workspacePath = '/workspace'
const editor = useEditorCore(core, createCallbacks((content) => noteStore.setContent(content)))
const root = document.createElement('div')
document.body.appendChild(root)
await editor.setupEditorForNote(note, root, createDefaultWorkspaceSettings())

try {
  // 3. Dispatch a REAL ProseMirror transaction, not a mocked content update.
  const view = core.editorView!
  view.dispatch(view.state.tr.insertText('Edited: ', 1))

  // 4. Drive the SAME path production navigation uses to flush + save.
  await noteStore.saveNote()

  // 5. Assert against what was actually sent to the backend command mock.
  expect(noteCommands.saveNote).toHaveBeenCalledTimes(1)
} finally {
  // 6. Always tear down the view; afterEach also clears document.body.
  editor.destroyEditorView()
}
```

`noteCommands` is mocked at the module level (`vi.mock('../../../tauri/commands', ...)`) so
no real Tauri IPC or filesystem I/O happens — the point is to exercise the *frontend* flush
path faithfully, not to hit the Rust backend. `afterEach(() => { document.body.innerHTML =
'' })` cleans up the detached root between tests.

The same file's second test is the negative case worth copying whenever you touch the
degraded-content guard: build a note whose `content` contains a node type the schema can't
parse, assert `core.contentPersistenceDisabled === true` after setup, dispatch an edit,
flush, and assert `onContentUpdate`/`noteCommands.saveNote` were **never** called — proving
the plain-text fallback never gets written back over the original.

`useEditorCore.test.ts` (the general, non-persistence editor test file) uses the same
`createEditorCore()` + `useEditorCore(core, callbacks)` construction but mocks
`tauri/commands` and `utils/logger` more broadly, since most of its assertions are about
in-memory editor behavior (slash menu state, link picker, plugin host warnings) rather than
the save path — reach for `useEditorCore.persistence.test.ts`'s pattern specifically
whenever the thing under test is "does this reach disk," not "does the editor behave
correctly in memory."

## 5. Rust test patterns

The dominant pattern across `manifest.rs`, `settings.rs`, `note_index/schema.rs`,
`note_index/index.rs`, and `workspace/marketplace/tests.rs` is a **per-test temp
workspace**: a uniquely-named directory under `std::env::temp_dir()` (typically
`nevo-<area>-<Uuid::new_v4()>`), built either by calling the real `create_workspace()`
function (when the test needs a fully-initialized workspace — see `manifest.rs`'s
`TestWorkspace` helper) or by hand with `std::fs::create_dir_all` (when the test only needs
specific subdirectories to exist — see `restore_journal.rs`'s `TestDir`). Cleanup is either
an explicit `std::fs::remove_dir_all(&path)` at the end of the test, or a `Drop` impl on the
helper struct so cleanup happens even on an early `?`/panic.

For any change touching a data-touching command (manifest, note.json, settings, SQLite
index, snapshots), the required test categories — matching the "Add a migration" checklist
in `docs/data-model.md` §9 and `AGENTS.md`'s manifest/import-export row — are:

- **Round-trip**: write → read (→ write again) produces the same data, including any
  unknown/`extra` fields (see `manifest_round_trip_preserves_an_unknown_top_level_field` in
  `manifest.rs` for the pattern).
- **Legacy-data**: a hand-built fixture in an older/different shape still loads correctly
  (see `open_workspace_still_opens_an_older_schema_version`, or
  `migrates_legacy_flat_settings` in `settings.rs`).
- **Invalid input**: a malformed or out-of-range value degrades to a safe default rather
  than failing to load, or is explicitly rejected if silent recovery would be unsafe (see
  `settings.rs`'s `falls_back_to_default_ai_provider_for_unknown_api_kind`, and
  `open_workspace_rejects_a_manifest_schema_version_newer_than_supported` for the reject
  case).
- **Interrupted/failure path**: a partially-completed operation (a crash mid-restore, a
  marker pointing outside the workspace, a malformed journal marker) is recovered or
  quarantined without data loss or an unsafe write (see `restore_journal.rs`'s
  `recovery_rolls_a_crashed_commit_forward_including_a_legacy_two_entry_marker`,
  `recovery_is_idempotent_when_a_rename_already_completed`, and
  `a_marker_entry_escaping_the_workspace_is_quarantined_not_applied`).

## 6. Visual QA in the real app

Vitest runs in jsdom and never lays anything out. To see a UI state, run the actual Tauri
binary in WebKitGTK with `pnpm qa` (`tools/visual-qa/`): `start` boots an isolated
headless GNOME Shell (private D-Bus, own Wayland display, virtual monitor; `HOME`, XDG
dirs, dconf and keyring under `.qa/profile`), Vite if `:1420` is free, and a W3C
WebDriver session through `WebKitWebDriver` (`TAURI_WEBVIEW_AUTOMATION=true`). Then
`shot`, `click`, `type`, `key`, `eval`, `resize`, `wait` drive it, and `stop` tears it all
down. It needs Linux with GNOME Shell and the webkit2gtk-4.1 WebDriver, plus a debug build
(`cargo build --manifest-path src-tauri/Cargo.toml`). Native file dialogs and the OS
clipboard are outside the webview and stay manual. The checklist of what to look at is
`.codex/skills/nevo-visual-qa/SKILL.md`.

**Windows**: use `.codex/skills/nevo-windows-qa/SKILL.md`. Start the current Tauri
source with `powershell -NoProfile -ExecutionPolicy Bypass -File
tools/visual-qa/windows-session.ps1 -Action start`. The launcher owns hidden Vite
and Tauri dev processes, applies a QA identifier/configuration overlay, uses a
separate WebView2 data folder and preserves logs under `.qa/windows`. Its
bootstrap skips legacy credential cleanup in that isolated renderer because the
current OS credential-store service is shared across identifiers. Use disposable
fixture workspaces; secret-store and native-dialog checks need separate isolation
or native UI tooling.

`node tools/visual-qa/windows-qa.mjs --port 9223 help` lists screenshot, click,
typing, keyboard, evaluation, wait and navigation commands. Each operation checks
native app metadata before acting; plain-browser pages and production profiles are
rejected. `resize` emulates viewport dimensions, not the OS window. Always inspect
the captured images and stop the owned session with `windows-session.ps1 -Action
stop`. Windows results establish WebView2 behavior and do not replace Linux
WebKitGTK evidence. Protocol/keyboard regression checks run with
`node --test tools/visual-qa/windows-cdp.test.mjs`.

## 7. Handwritten notebooks

Selection-transform regressions cover shared-center uniform scaling/rotation,
page fitting, valid pen/highlighter widths, unknown-field and codec round trips,
unchanged unselected ink, blocked/invalid/no-op commands, grouped copy IDs and
selection, byte-budget rejection, and one-step history. Mounted editor tests
exercise lasso, live previews without snapshot mutation, pointer cancellation,
focused-handle Undo/Redo, recolor, copy, and clear. Overlay tests keep tiny edge
selection controls distinct at 50%, 100%, and 350% zoom. Native Windows acceptance
checks pointer/touch/keyboard transforms, relative numeric scale, Escape, Ctrl+D,
light/dark responsive layout, native save/reload with unknown fields, and compiled
vector PDF preview without the selection frame.

Laser tests cover immediate mouse/pen preview, long contact without checkpoints,
document/history isolation, independent expiry, bounded temporary traces, disposal
and late callbacks, captured colors/widths, tool selection, and returning to normal
ink. Native Windows acceptance verifies fade/expiry, keyboard selection, reduced
motion, immutable native save/reload and SVG output, and responsive light/dark UI.

Ruler regressions cover both edge guides, zoom-aware acquisition, rotated projection,
pressure retention, frozen gesture guides, live preview/checkpoints, and ordinary ink
Undo/Redo through the mounted notebook. Overlay tests verify initial hidden state,
visible-page placement and resize bounds, screen-size controls, pointer cancellation,
SVG screen-coordinate transforms, keyboard movement/rotation/reset, and isolation
from document edits and page touch navigation. Native Windows QA additionally checks
touch handles, Tab focus, save/reload, SVG exclusion, both themes and 350% zoom.

Handwritten notebook changes also require the pure suites under
`src/core/notebook/`, input/history/viewport/persistence/export suites under
`src/features/notebook/`, typed notebook IPC tests, and the note-store,
router, workspace-switch, backend, and history integration regressions. A mocked
flush helper alone does not prove durability: mount the real notebook session
with the note store and exercise the production navigation barrier, including
pending ink before the dirty flag changes, failure, overlapping writes, checkpoints,
and no-op reopen. Native notebook tests cover the workspace gate, raw-field
preservation, invalid writes, restore/transfer, destination failure, and compiled
PDF page counts and dimensions.
Save-transport regressions cover concurrent notes, worker failure/retry, immutable
deltas including deleted unknown fields, and the raw UTF-8 IPC contract. Store tests
mock the native transport boundary; transport tests execute the real patch/encoding
logic, and mounted host tests retain the production session and navigation flow.
`NotebookView.interaction.test.ts` mounts the real page, toolbar, and navigator:
it verifies the closed initial state, both toggle/close paths and focus return at
wide/narrow sizes. Mouse and pen cases advance animation frames before pointer-up
and assert that the rendered contour changes while the stored page stays untouched.
Arrow cases cover live pen/mouse preview, three segments committed only on release,
and one-step Undo. Pure arrow tests cover endpoint geometry, reversed/short arrows,
and degenerate input; document tests cover atomic budget rejection, lossless codec
round trips, and three-path vector export without a new serialized object kind.
Shape regressions cover exact rectangle/triangle contours and widths, lossless
reopening of existing closed strokes, vector export, tiny/reversed loops, and lasso
selection of the outline without selecting an empty interior. Toolbar tests cover
the single shape popup, selection, active radio state, and Escape dismissal.
Toolbar tests cover numeric widths for pen, marker, and eraser and the absence of
the paper-export checkbox. Creation tests cover default title/paper, folder placement,
concurrent-click suppression, and failure/retry; the shell regression verifies direct
creation and navigation without a dialog. `NvNumberInput` coverage checks its input's
accessible name, fractional keyboard stepping, and bounded values.

Real-device notebook acceptance remains separate from jsdom tests. Check light/dark
at 1280×800, 800×1280, and 360×800, keyboard focus, page operations, drawing,
save/reopen, clipping, and PDF output. The performance fixture contains 100 pages,
10,000 strokes, and 500,000 points. Record device/webview details and input/render
timings; viewport emulation does not establish active-pen pressure, palm rejection,
native window sizing, or Android lifecycle/process-kill behavior. Android requires
the actual mobile build and device, and Linux requires WebKitGTK evidence.

## 8. Baseline failures

Per `AGENTS.md`: if the repository already has unrelated lint or test failures on `main`/
your starting branch, do not expand your task to fix them. Run the focused checks for the
files you actually changed, state the pre-existing failure explicitly in your report
(don't silently work around or hide it), and make sure your change introduces **no
additional** failure beyond that baseline. `verify_change.sh` narrows checks to the current
diff specifically so an unrelated baseline failure elsewhere in the suite doesn't block or
obscure verification of your change.
