# Handwritten Notebooks Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Tasks below use independent file ownership; review integration against the complete specification.

**Goal:** Implement persistent handwritten A4 notebooks, their editor, and vector PDF output in local Nevo workspaces.

**Architecture:** A notebook is a distinct document format. Framework-agnostic notebook modules own validation, immutable operations, geometry and vector rendering; Vue composables own the live editing session. The existing note store, save queue and Rust atomic-write/history flows remain the persistence boundary. Rust owns the workspace version upgrade and PDF output.

**Tech Stack:** Vue 3, TypeScript, Pointer Events, existing perfect-freehand geometry, Tauri 2, Rust, existing Typst runtime.

**Spec:** ../specs/2026-10-01-handwritten-notebooks-design.md

## Global Constraints

- Preserve all existing working-tree changes; do not stage or commit unrelated files.
- Legacy document notes remain documents. Notebook notes require `documentKind: 'notebook'`, notebook version 1, valid empty PM content and no automatically created canvas.
- A4 dimensions are 595.28 × 841.89 pt. Grid spacing is 5 mm, ruled spacing is 8 mm. Paper remains white in both themes.
- Unknown fields survive at every level. Invalid/future data opens without editing or automatic writes.
- First notebook creation upgrades workspace schema 1 to 2 before notebook writes. Ordinary workspace opening does not upgrade it.
- Maximums: 1,000 pages, 100,000 objects, 2,000,000 points, 4,096 points per stroke segment, 100 MiB serialized document.
- Touch navigates only; active pen suppresses touch navigation until suppressed contacts end. Preserve valid zero pressure.
- Undo: 100 actions / 32 MiB, retaining the latest action. Autosave: 300 ms debounce, 2 s maximum including long strokes.
- Windows/Linux/Android are targets; device/toolchain gaps must be reported and cannot be labeled passed.
- Use existing borderless Nevo tokens/primitives, visible focus, 44 px touch targets and all five locales.

## Review Focus

- Unknown format must never briefly mount a writable PM editor.
- Pending ink must survive production navigation flush, save failure and overlapping revisions.
- Metadata, history restore/copy and transfer must preserve unknown notebook fields.
- PDF must retain blank pages, exact dimensions, stroke clipping and object order.
- Repeated cancellation/finalization and pen arrival during touch navigation must not duplicate or discard accepted ink.

## Task 1: Pure notebook domain

**Ownership:** `src/core/notebook/**`, notebook additions in `src/types/note.ts`.

**Units:** types (wire contract), codec (strict lossless diagnostics), operations (immutable mutations), geometry (outline, eraser, lasso, constrained translation), paper (background lines), svg (safe page preview), export (typed vector payload).

**Interfaces:** Export versioned types, `createNotebook(paper?)`, `decodeNotebook(value)`, `decodeNoteFormat(note)`, immutable page/object operations, `notebookPageSvg(page, includePaper?)`, `createNotebookExport(snapshot, includePaper?)`. Vector pages contain width/height, paper line geometry, ordered paths with typed M/Q/L/Z commands, hex color and opacity.

- [x] Add codec tests for legacy, valid, malformed/future, duplicate IDs, limits and unknown-field preservation.
- [x] Add geometry/operation tests for dots, zero pressure, pressure-aware eraser, real lasso intersection, clipped rendering, ID remapping and page bounds.
- [x] Implement focused units reusing existing canvas algorithms.
- [x] Run focused Vitest and ESLint; publish exact interfaces to dependent agents.

## Task 2: Native safety and PDF

**Ownership:** `src-tauri/**` except generated schemas/build caches.

**Units:** `commands/note/notebook/{mod,create,validation}.rs`, `commands/notebook_export/{mod,render,output}.rs`, narrow existing note/workspace/transfer/MCP integrations, mobile lifecycle/output adapters where supported.

**Interfaces:** `create_notebook(workspace_path, folder_id, title, icon, paper)` returns NoteDocument. `export_notebook_pdf(workspace_path, note_id, file_name, pages)` returns exported/cancelled or error. Notebook source stays raw serde_json::Value. Typed vector commands follow Task 1's wire contract.

- [x] Add legacy/unknown-field/invalid/oversize schema and atomic-create tests before implementation.
- [x] Implement manifest upgrade, save validation, restore/copy/transfer gate and lossless MCP metadata; reject PM mutation tools for notebooks.
- [x] Reuse Typst compilation for validated native SVG pages and atomic desktop output. Implement URI-aware Android output and lifecycle under target gates.
- [ ] Initialize mobile scaffold through Tauri CLI and verify the actual Android build; the CLI attempt failed because the required mobile toolchain is absent.
- [ ] Verify command registration/payloads, Rust formatting and targeted/full tests. Report unavailable toolchains explicitly.

## Task 3: Notebook UI session

**Ownership:** `src/features/notebook/**`, `src/locales/*`, new `src/tauri/notebook.ts` and its tests.

**Units:** NotebookView layout; page, toolbar, pages panel; document/history/input/viewport/persistence/export composables; export worker.

**Interfaces:** NotebookView accepts NoteDocument, workspacePath, saveStatus; emits `update:notebook` and `update:title`. Session calls existing registry flush/suspend and store durable flush. IPC wrappers use Task 2's exact command names.

- [x] Read design-taste-frontend and existing Nevo tokens/reference/primitives. Build compact toolbar and page navigator, narrow-screen drawer, focus-safe confirmations.
- [x] Add deterministic pen/mouse/touch/coalesced/cancel tests and history tests, then implement tools, zoom/pan, virtualization and checkpoint/autosave.
- [x] Add all new keys to en/ru/fr/es/de; provide page accessibility summaries and field-safe shortcuts.
- [x] Add mounted NotebookView persistence/navigation tests and immutable worker export tests; run focused tests and ESLint.

## Task 4: App integration and surrounding surfaces

**Ownership:** Existing frontend store/backend/tree/router/shell/create-menu/export/history/MCP-host files plus new host and creation composable; assigned after Task 1 finishes.

- [x] Add typed backend creation, `setNotebook`, raw snapshots and draft identity comparisons with cache/saveQueue regressions.
- [x] Add WorkspaceNoteHost selecting editor only after format validation; canonicalize canvas notebook routes and omit document/canvas switching.
- [x] Add notebook creation dialog with title/paper and confirmed native result placement in the existing note tree.
- [x] Implement history page preview/diff and copy/restore, unsupported text export guards, PM/plugin/MCP boundaries.
- [x] Verify real mounted host/navigation save-failure/no-op reopen, wrapper tests and existing integration regressions.

## Task 5: Acceptance, docs and graph

- [x] Review final scoped changes against the saved baseline, then run focused tests, locale suites, full lint/tests/build and Rust fmt/tests. Record failed baseline and environment gates explicitly.
- [x] Run real Windows QA in an isolated profile, light/dark at desktop/portrait/phone sizes, keyboard and pointer input, save/reopen and the performance fixture.
- [ ] Complete native PDF, Android build/device and Linux acceptance in suitable environments.
- [ ] Verify PDF page count/size and visual parity, performance fixture and residual hardware gaps.
- [x] Update architecture/data-model/testing/MCP documentation to describe implemented behavior. Update changes.md after scoped implementation checks pass, without claiming platform release.
- [x] Run git diff --check, direct scoped diff review and graphify update .; report actual failures and unverified acceptance gates.

## Execution ledger

- Planning: approved supplied spec; implementation requested explicitly, no further approval gate.
- Baseline: 536 tracked dirty paths at start; saved user diff and original source copies under the session's temporary baseline directory.
- Ruling: work in the supplied checkout on `dev`, because this implementation depends on existing user-owned uncommitted subsystem removals. Do not create a clean checkout that loses those changes; do not commit.
- Ruling: tasks 1, 2 and 3 may run concurrently with non-overlapping ownership and exact shared contracts. Task 4 starts when domain contracts exist.
- Baseline checks: vue-tsc failed on a literal `\\n` in WorkspaceEditorPane.vue:227. User explicitly authorized the single-line repair; UI coder applied it. Initial full lint failed with 31 errors, chiefly local tooling/QA files; preserve these unrelated files.
- Initial full tests: 296 suites passed; existing style/onboarding/router/windows-tool suites failed, alongside notebook tests observed during their intentional red phase. Log: `C:/Temp/nevo-notebook-baseline-tests.log`; do not count new missing-module failures as baseline defects.
- Hardware environment: only Windows Rust target is installed. Android SDK/NDK/JDK/adb unavailable. Real Linux and Android device acceptance must remain unverified unless an environment becomes available.
- Review rulings: real pressure requires perfect-freehand `simulatePressure: false`; shared `actionId` across long-stroke segments is valid; cancellation adds no unconfirmed point; semantically empty PM content is checked structurally, preserving unknown keys.
- Task 1 independently verified: 19 tests passed across four notebook-domain suites; scoped ESLint passed. Task 4 integration assigned to the domain coder after this verification.
- Native verification currently blocked at execution: the compiled Windows Rust test harness aborts before test discovery with `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139). Diagnose the runtime separately from compilation and do not report unexecuted tests as passed.
- The user authorized the primary session to finish implementation and verification after the mandated Luna/Sol agents reached the account limit.
- Additional save units: `savePatch.ts` owns lossless deltas; `saveTransport.ts` owns worker request ordering and retry; `workers/notebookSave.worker.ts` owns complete-note serialization; `src/tauri/notebookSave.ts` owns the binary IPC edge; native `note/notebook/save.rs` validates that edge and delegates to the existing atomic save path.
- Real WebView2 profiling exposed synchronous full-note serialization and the shell's 15-second timer ending active strokes. Worker encoding and background snapshot saves fixed both; mounted regression coverage includes the real shell persistence composable alongside NotebookView and the note store.
- Final device/platform evidence and reproducible check outcomes are recorded in `../qa/2026-10-01-handwritten-notebooks.md`. Outstanding release gates remain unchecked above.
