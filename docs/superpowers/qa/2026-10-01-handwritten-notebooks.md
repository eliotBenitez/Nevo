# Handwritten notebooks verification — 2026-10-01

The editor and native integration are implemented in the existing dirty checkout.
This report records observed evidence; the three-platform release gates in the
design specification remain open. No commit or production workspace was created.

## Automated checks

| Check | Result |
| --- | --- |
| Focused Vitest (domain, UI/session, store/queue/cache, backend, host/router, history, MCP, IPC, locales, editor serialization/regression) | 38 suites, 288 tests passed |
| ESLint on the changed frontend files | Passed |
| `pnpm test:run --maxWorkers=2` | 320 suites / 2,458 tests passed; four unrelated suites / four tests failed |
| Vite production build | Passed; bundle budgets passed separately |
| `pnpm build` | Failed only on the unchanged `vegaToSvg.integration.test.ts:22` fixture typing error |
| Full frontend lint | Failed with 30 errors and 91 warnings in pre-existing local tooling/QA/primitives |
| Rust formatting | Passed |
| `graphify update .` | Passed; regenerated the code graph without manual edits |
| `cargo check --no-default-features --tests` | Passed, including the notebook transport and native tests |
| `cargo test --no-default-features -j 1 notebook -- --test-threads=1` | Compiled, then the Windows loader aborted before discovery with `0xc0000139 / STATUS_ENTRYPOINT_NOT_FOUND`; no native test was counted as passed |
| Full `cargo test` | Failed during compilation with an out-of-memory error; the serial targeted retry above compiled successfully |

The full frontend run retains four unrelated failing suites: legacy
`--shadow-pop` in KanbanCardEditorPane, the global focus-layer assertion, two
CreateWorkspaceView starter-note assertions, and a Node test file collected by
Vitest without a Vitest suite. Notebook regressions pass in the focused run.

Global `git diff --check` still reports user-owned whitespace in EditorSurface
and useEditorCore. Comparing against the saved source baseline also includes
concurrent editor-context-menu edits; these are outside the notebook change.
They were preserved. New notebook files and the notebook edits were reviewed.

## Real Windows application

The purpose-built Windows QA launcher ran the actual Tauri app in the isolated
`com.eliotBenitezhvat.nevo.qa` profile. Its fixture workspace lives under
`.qa/windows/workspaces/notebooks-20261001`; the production profile was not used.
All owned QA processes were stopped after verification.

- Windows 11 Pro, build 10.0.26300; AMD Ryzen 7 7840HS, 8 cores / 16 threads.
- WebView2 reports Edge/Chromium 154.0.0.0; captured renderer DPR was 2.
- Light/dark layouts were reviewed at 1280×800, 800×1280, and constrained phone
  sizes (360×800 plus 390×844). These are renderer viewport overrides, not OS
  window resizing or Android-device evidence.
- Real CDP mouse input produced persisted strokes. Ctrl+Z / Ctrl+Shift+Z changed
  the drawing correctly; title controls remained separate from editor shortcuts.
- Tab from Pen focused Marker with a visible 2 px outline. Compact toolbar
  controls, the range input, and the paper selector have 44 px touch height; no
  document-level horizontal overflow was observed at 360×800.
- Page creation/navigation and the page drawer were exercised. Notebook canvas
  URLs canonicalized to the note route, without a ProseMirror editor.
- Unknown fields at note/notebook/page/paper/object/point levels survived an
  actual native save. A document-shaped overwrite of a notebook was rejected.
- A future version opened as a read-only diagnostic with source export available
  and no drawing or ProseMirror editor mounted.

Screenshots remain local under `.qa/windows/shots/`: `notebook-light.png`,
`notebook-dark.png`, `notebook-portrait-light.png`, `notebook-portrait-dark.png`,
`notebook-compact-light.png`, `notebook-compact-dark.png`,
`notebook-keyboard-focus.png`, and `notebook-future-readonly.png`.

## Performance and long-contact persistence

The loaded fixture initially contained 100 pages, 10,000 strokes, and 500,000
points. CDP dispatched synthetic pen events for 30 seconds in the actual WebView2
renderer. Capture/bubble listeners measured batch handling; requestAnimationFrame
callbacks measured the next-frame scheduling interval. This is not physical
pen-to-pixel latency or a measurement of completed paint.

Profiling found two defects and led to regression fixes: full-note serialization
blocked the input thread, and the shell's 15-second background timer finalized a
live stroke. Serialization now runs in a worker, with lossless deltas at the
main-thread boundary; background saves persist checkpoints without ending input.
Explicit save, navigation, and focus loss still finalize accepted ink.

The final 30-second run dispatched 756 move events. Batch p95 was 0.3 ms; next-frame
scheduling p95 was 2.4 ms; PerformanceObserver recorded no tasks over 50 ms.
Only two pages and five thumbnails rendered. Pointer capture was released only
after pointer-up. The store and persisted native file both contained 501,653
points after this run, and save status settled to Saved. Segment boundary points
are intentionally duplicated. The performance scripts/results remain in the
session's temporary directory rather than the repository.

## Outstanding acceptance gates

- Physical active-pen pressure, pen/touch arbitration and a recording on Windows.
- Linux/WebKitGTK device input, rendering and PDF output: no Linux environment.
- Android CLI scaffold/build and tablet checks: JDK, SDK, NDK and adb unavailable;
  the CLI initialization attempt failed. Lifecycle/URI adapters are implemented
  behind target gates, but APK, pause/resume/process-kill, rotation and system
  output remain unverified.
- Native PDF dialog/cancellation, compiled page count/dimensions and visual parity:
  no native computer-use surface, and the Rust test loader failure blocks the
  compiled-PDF fixture. The frontend vector/worker fixtures passed.
- Native permission/disk-full/restore/transfer tests were added and compiled but
  cannot be treated as executed until the Windows test-loader issue is resolved.

These gaps prevent declaring the complete three-platform specification released.

## Follow-up: live ink and collapsible page navigator

Mounted real-component regressions reproduced both defects before the fixes:
desktop pages ignored the visibility state, and the reused preview-array reference
left the page's computed contour stale until pointer-up. Input now publishes a
fresh preview array per animation frame. The navigator starts closed, is toggled
at every size, and returns focus to its toolbar button after panel closing.

- Focused notebook, mounted-host persistence/close, and workspace-shell suites:
  13 files, 76 tests passed. Scoped ESLint passed for all five changed TS/Vue files.
- `pnpm build` stopped at the unchanged Vega fixture typing error in
  `src/utils/noteExport/vegaToSvg.integration.test.ts:22`.
- The isolated Windows/WebView2 app passed light/dark checks at 1280×800 and
  360×800: initial closure, toolbar toggle, panel close, focus return, and no
  document horizontal overflow. Screenshots are under `.qa/windows/shots/`, named
  `notebook-pages-{collapsed,open}-{desktop,phone}-{light,dark}.png`.
- CDP pen and mouse input both changed the visible contour before pointer-up;
  object counts stayed unchanged during contact and increased once after release.
  Live screenshots are `notebook-live-pen.png` and `notebook-live-mouse.png`.
- A further 30-second pen run on the large fixture dispatched 801 moves. Batch
  p95 was 0.2 ms and next-frame scheduling p95 was 3.6 ms, with no tasks over 50 ms.
  Pointer capture ended after pointer-up, and save status settled to Saved.
  These timings measure scheduling and synthetic input, not physical pen latency.
- Global `git diff --check` still reported pre-existing whitespace in
  `EditorSurface.vue` and `useEditorCore.ts`; the follow-up diff was checked separately.

This follow-up does not close the physical-device, Linux, Android, or native-PDF
acceptance gaps listed above.

## Follow-up: simpler creation and toolbar controls

- The notebook toolbar now centers its tool row, uses the existing number input
  with an accessible input name, and exports with paper without a checkbox.
  The create action immediately opens an untitled ruled notebook; its title and
  paper remain editable. Creation failures use shared toasts and can be retried.
- Focused notebook, creation, number-input, mounted-host, and shell suites passed:
  16 files, 84 tests. Scoped ESLint passed. `pnpm build` still stopped only at the
  unchanged Vega fixture typing error recorded above.
- The actual isolated Windows/WebView2 app passed both themes at 1280×800,
  800×800, and 360×800. Tool-row and toolbar centers matched within 1 px; no
  document overflow, width sliders, or paper checkboxes were present.
  Screenshots are `notebook-toolbar-{1280,800,360}-{light,dark}.png`.
- Creating through the sidebar menu opened the notebook directly. CDP keyboard
  input changed width to 2.75, then ArrowUp to 3; the input had a visible 2 px focus
  ring. Editing the title to Toolbar QA and changing paper to grid succeeded;
  a native reload confirmed both values after durable save.
- Scoped whitespace checks passed; the unrelated global whitespace failures
  remained unchanged. The owned QA processes were stopped afterward.

Renderer viewport checks do not establish physical Android/Linux input or native
window resizing. The outstanding acceptance gates above remain separate.

## Follow-up: compact notebook chrome

- Desktop toolbar controls were reduced from 44 to 32 px and tool icons from
  18 to 16 px. Settings, centered tools, and actions share one 44 px row when the
  editor is wider than 900 px. Title spacing was tightened. The page navigator
  retained its existing targets; emulated coarse pointers retained 44 px controls.
- All 42 notebook tests in 11 files passed, as did scoped ESLint. This CSS/layout
  follow-up did not change component contracts or persistence.
- The isolated Windows/WebView2 app passed both themes at viewport widths 1440,
  1280, 1100, 1000, 900, 800, 560, and 360 px. The tool group remained exactly
  centered, without overlapping controls or horizontal overflow. At 1440 and 1280,
  toolbar height was 44 px; narrower editors reflowed using container queries.
- Touch-pointer emulation at 360 px confirmed 44 px targets and no overlap.
  Native keyboard input changed numeric width from 2.75 to 3 with ArrowUp and
  preserved the visible focus ring. The page navigator still opened normally.
- Reviewed screenshots: `notebook-compact-{1440,1280,800,360}-{light,dark}.png`,
  `notebook-compact-touch-{light,dark}.png`, and `notebook-compact-focus.png`.
  The owned session was stopped after verification.

Scoped whitespace checks passed. Global whitespace failures stayed in the same
unrelated files listed above. Linux/WebKitGTK and physical touch devices were not
verified in this follow-up.

## Follow-up: arrow drawing (2026-10-02)

- The diagonal-arrow button now draws a straight arrow with a live preview.
  Selected-ink movement has a separate four-way icon and tooltip. Arrows reuse
  three ordinary strokes with one action ID, preserving the existing format,
  vector exporter, save gate, and one-step Undo/Redo.
- Visual review caught endpoint shortening in two-point stroke smoothing. These
  segments now reach their actual endpoints, connecting the shaft and head.
  A regression test reproduces the former gap through the shared vector geometry.
- All 97 tests in the 23 focused notebook, locale, and mounted persistence files
  passed, as did ESLint on all changed TS/Vue files. `pnpm build` still failed
  only at the unchanged Vega fixture typing error recorded above.
- The optional locale-diff helper reported three existing Russian plural-branch
  count differences outside notebook keys; their values matched the pre-arrow
  backup. Scoped whitespace checks passed. Global whitespace failures remained
  in the unrelated editor files recorded above.
- The default QA build was blocked by a running non-QA `nevo.exe`. The owned
  failed session was stopped; QA used a separate Cargo target directory and
  retained its isolated application profile and fixture workspace.
- Actual WebView2 pen and mouse events produced three changing preview paths
  before release. Holding for over two seconds left stored objects untouched.
  Release added exactly three strokes; single Undo removed them and Redo restored
  them. A successful durable flush and native reload preserved the snapshot,
  comparing point coordinates within 1e-9 points to allow native float parsing.
- The seven-tool toolbar passed both themes at 1440, 1280, 1100, 1000, 900, 800,
  560, and 360 px, without overlap or horizontal overflow. Coarse-pointer
  emulation retained 44 px targets; numeric keyboard stepping retained focus.
  Reviewed screenshots: `notebook-arrow-committed.png`,
  `notebook-arrow-live-{pen,mouse}.png`, and
  `notebook-arrow-toolbar-{1280,360}-{light,dark}.png`.

Linux/WebKitGTK, physical stylus/touch input, and compiled arrow PDF output were
not verified in this follow-up. Vector commands and codec round trips passed
focused tests. The owned QA session was stopped after verification.

## Follow-up: 350% zoom (2026-10-02)

- Raised the shared viewport maximum from 2.5 to 3.5, keeping toolbar, wheel,
  and pinch input on the same clamp and preserving the scroll anchor.
- All eight viewport/interaction tests and ESLint on the two changed TS files
  passed. Actual isolated Windows/WebView2 input reached 350% using the toolbar,
  decreased to 315%, and returned to the 350% limit with Ctrl+wheel.
- Reviewed `notebook-zoom-350.png`; the page rendered at 2083.48 px width and
  the toolbar displayed 350%. The owned QA session was stopped afterward.
- This follow-up did not change types, component contracts, or styles. Linux
  and physical pinch devices were not exercised.

## Follow-up: shape popup and exact contours (2026-10-02)

- Four shape buttons became a single Shapes popup with icons, selected radio
  state, focus return, and shared positioning/dismissal. Narrow toolbar layouts
  wrap the tool group without overlapping page/export controls.
- Sparse closed shape vertices previously went through freehand smoothing,
  displacing corners and leaving a gap. Closed convex half-pressure strokes now
  use exact outer/inner contours at constant width; tiny shapes omit inverted
  holes, and sharp joins are bounded. Freehand pressure and marker rendering keep
  their existing paths. Stored points, unknown fields, format version, and Undo
  remain unchanged. Existing shapes benefit when reopened.
- All 120 tests in 23 notebook/locale files passed. Additional popup assertions
  and scoped ESLint passed. `pnpm build` still failed solely at the unchanged Vega
  fixture typing error; global whitespace findings remained in unrelated editor
  files. Scoped whitespace checks passed.
- Actual isolated Windows/WebView2 pen/mouse gestures drew square, triangle,
  ellipse, and circle. Shift constrained the square; live paths matched committed
  paths exactly, and each shape passed single Undo/Redo. Native durable save and
  reload matched within 1e-9 points for floating-point coordinates.
- Keyboard Enter/Home/ArrowDown selected a shape, Escape restored trigger focus,
  and outside clicks dismissed the popup. The nine-button toolbar passed both
  themes at 1440, 1280, 1100, 1000, 900, 800, 560, and 360 px. Popup checks at
  1280/360 px stayed inside the viewport; touch emulation retained 44 px items.
- Reviewed `notebook-shapes-corrected.png`,
  `notebook-shapes-popup-{1280,360}-{light,dark}.png`, and
  `notebook-shapes-typst-preview.png`. The native Typst SVG preview compiled to
  one A4 page with all four complete outlines and empty interiors. This exercised
  the shared Typst/SVG rendering path, without the notebook PDF destination dialog.

Linux/WebKitGTK, physical touch/stylus devices, and the notebook PDF save-dialog
flow were not exercised. The owned QA session was stopped after verification.


## Ruler implementation verification — 2026-10-02

- Added session-local hidden-by-default ruler visibility/pose, native SVG millimeter ticks, move/rotate handles, keyboard arrows, Shift steps, and Home angle reset. Pen/highlighter guide acquisition captures one of the two edges once per gesture, preserving pressure, preview, checkpoints, ordinary storage, and Undo grouping.
- Automated: `pnpm exec vitest run src/core/notebook src/features/notebook src/locales/locales.test.ts src/i18n.test.ts` passed 138 tests across 26 files. `pnpm exec eslint src/features/notebook src/core/notebook/ruler.ts src/core/notebook/__tests__/ruler.test.ts` passed. Tests cover gesture guide freezing, both edges, 35%/100%/350% coordinates, SVG transform accuracy, cancellation, overlay resize/disposal, mounted-session document isolation, and Undo/Redo.
- Native Tauri 2/WebView2 QA used the profile-verified `com.eliotBenitezhvat.nevo.qa` application and only `.qa/windows/workspaces/notebooks-20261001`. CDP pen and mouse contacts produced collinear guided ink at 15 degrees with live preview, one-step Undo/Redo, durable save/reload, and 350% zoom. Stored JSON and the production `notebookPageSvg` output contained no ruler overlay/state.
- Light/dark renderer viewport checks passed at 1280, 1000, 950, 900, 800, and 360 px wide, all 800 px high. Handles remained within the viewport after resizing; the toolbar did not overlap or overflow. Existing line-style controls also passed overlap/overflow probes at 1280, 1000, 950, 800, 560, and 360 px.
- Real WebView2 CDP touch events at 360×800 moved and rotated the ruler without moving the scroller or changing ink. Tab reached both SVG handles, arrow keys moved/rotated, Shift stepped, and Home reset the angle. A 90-degree touch rotation measured 89.99994 degrees. Pointer rotation used the inverse SVG screen transform to avoid border/viewBox offsets.
- Screenshots inspected: `.qa/windows/shots/notebook-ruler-1280-light.png`, `notebook-ruler-360-dark.png`, and `notebook-ruler-350.png`; matching light/dark captures remain in the same ignored directory. Probe scripts were temporary files under `C:/Temp`.
- `pnpm build` still stopped on the pre-existing TS2345 error in `src/utils/noteExport/vegaToSvg.integration.test.ts:22`; no ruler type errors remained. Full-tree whitespace checking retained the unrelated baseline findings in WorkspaceEditorPane.vue, EditorSurface.vue, and useEditorCore.ts; the ruler-scoped check was clean.
- Verification used the repository matrix manually on Windows instead of running the Bash selector. Native OS window resizing, physical stylus pressure/palm rejection, Android/Linux webviews, and the PDF save dialog were not tested by these renderer probes. Existing export regression suites passed; the native SVG exclusion probe did not compile a new PDF artifact.


## Laser pointer verification — 2026-10-02

- Added a compact accessible laser tool with independent red-by-default color/width, immediate glowing SVG preview, and released traces that faded and expired after 1,600 ms. Reduced motion disabled the opacity animation while retaining expiry. Session history was bounded to 32 traces and the rendered tail to 2,048 points per trace; disposal cancelled expiry timers and ignored late gesture finalization.
- Automated: `pnpm exec vitest run src/core/notebook src/features/notebook src/locales/locales.test.ts src/i18n.test.ts` passed 146 tests across 27 files. `pnpm exec eslint src/features/notebook` passed. Tests covered preview during mouse/pen contact, long contact without checkpoints/ruler snapping, document/history isolation, independent lifetimes, bounded traces, disposal/late input, mounted editor expiry, and restored pen color/width.
- Native Tauri 2/WebView2 acceptance used the profile-verified QA application and disposable workspace only. Mouse and CDP pen traces appeared during contact, survived a contact held beyond two seconds without changing the notebook, visibly faded after release (sampled opacity 0.56/0.69), and expired. Keyboard Tab/Enter selected the laser. Undo/Redo still targeted permanent ink; native save/reload matched the pre-laser notebook exactly, and production SVG output contained no laser path or laser color.
- Native reduced-motion emulation produced `animationName: none` while the released trace still expired. Light/dark layout checks passed at 1440, 1280, 1000, 950, 900, 800, 560, and 360 px wide (800 px high), with 11 toolbar buttons and no overlap or page overflow. A live laser at 350% zoom also expired without changing saved data.
- Inspected screenshots: `.qa/windows/shots/notebook-laser-1280-light.png`, `notebook-laser-360-dark.png`, and `notebook-laser-350.png`. Temporary probe scripts lived under `C:/Temp`.
- `pnpm build` remained blocked only by the unchanged TS2345 fixture error in `src/utils/noteExport/vegaToSvg.integration.test.ts:22`. Full-tree whitespace checking retained the pre-existing WorkspaceEditorPane.vue, EditorSurface.vue, and useEditorCore.ts findings; the laser-scoped diff check was clean. The repository matrix was applied manually on Windows.
- Renderer/touch viewport emulation did not verify physical stylus/palm behavior, native OS resizing, Android, Linux/WebKitGTK, or the PDF save dialog. Existing export regression suites passed; native SVG exclusion did not generate a new PDF artifact. The owned QA session was stopped after acceptance.


## 2026-10-02 — Lasso selection transformations

- Implemented uniform scale, shared-center rotation, relative numeric scale/angle commands, offset duplication with fresh IDs, group recolor, and clear. SVG handles supported pointer/touch capture, Shift 15-degree rotation, arrow keys, and Escape cancellation. Ctrl/Meta+D copied selected ink; Ctrl+Z/Shift+Ctrl+Z also worked with a handle focused. Small edge selections retained distinct 44 px hit targets. Selection UI remained conditional; save status used its own toolbar row while the panel was visible.
- Boundaries: pure geometry in `selectionTransform.ts`; UTF-8 accounting in `snapshotBytes.ts`; bounded document commands in `useNotebookSelectionCommands`; transient handle gestures/previews in `useNotebookSelectionTransform`; separate frame and contextual-toolbar components. The document composable was reduced from 478 to 444 lines. No schema, native API, or migration changed.
- Automated: focused notebook, locales/i18n, mounted host persistence/close, notebook IPC/save transport, and notebook export suites passed 172 tests across 35 files. Scoped ESLint passed without warnings. Tests included codec-valid widths, lossless additional fields, no-op/blocked transforms, page fitting without individual-vertex clamping, byte-budget copy rejection, live preview/cancellation, and focused-handle Undo/Redo.
- Native Tauri/WebView2 QA used only the metadata-verified isolated profile and disposable fixture workspace. The final probe created its notebook through the production tree store and opened its sidebar row; routing only by hash was insufficient when an existing tab owned the mounted note, so fixture identity and empty initial state were explicitly checked. Mouse scale and rotation previewed during contact; a scale held beyond two seconds left native saved content unchanged. Release, numeric 150% scale, keyboard rotation/Undo/Redo, Escape, copy-button/Ctrl+D, and touch scale behaved correctly with single-step history. An unselected stroke stayed identical.
- Light/dark acceptance passed at 1280, 900, 560, and 360 px wide, 800 px high; controls stayed in the viewport, touch targets reached 44 px, and the save-status overlay was removed from the contextual panel. A 350% resize/Undo passed. Native save/reload preserved geometry (compared at 1e-9 point precision for Rust f64 decoding) and unknown notebook/page/object/point fields. The production vector SVG compiled into a one-page native Typst PDF preview without selection controls.
- Inspected `.qa/windows/shots/notebook-selection-1280-light.png`, `notebook-selection-360-dark.png`, `notebook-selection-350.png`, and `notebook-selection-typst-preview.png`. Temporary probes lived under `C:/Temp`; QA output and fixtures remained ignored. Color application was tested through the production color-change callback and mounted component, without opening the native OS color dialog.
- Final tool-switch acceptance hid both frame and contextual controls in Hand mode, restored the existing selection on return to lasso, and verified Ctrl+D/Undo with a handle focused. A focused mounted regression also passed. Copy commands charged both changed sides to the existing history byte budget. The owned QA session was restarted after its dev process exited during documentation updates, then stopped after the final acceptance probe.
- `pnpm build` retained the unrelated pre-existing TS2345 error in `src/utils/noteExport/vegaToSvg.integration.test.ts:22`. Full-tree whitespace findings remained in WorkspaceEditorPane.vue, EditorSurface.vue, and useEditorCore.ts; the selection-scoped diff was clean. Linux WebKitGTK, Android, hardware stylus/palm rejection, native window resizing, the OS color picker, and final PDF save dialogs remained unverified; viewport/CDP touch emulation did not claim those results.
