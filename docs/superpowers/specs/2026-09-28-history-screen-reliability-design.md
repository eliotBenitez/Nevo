# History Screen Reliability — Agent Handoff Spec

**Status:** Proposed for review; implementation has not started under this spec.
**Date:** 2026-09-28
**Scope:** The existing `/workspace/note/:noteId/history` screen, snapshot restore/retention, and the note save boundary it depends on.

## 1. Goal and observed failures

Make version history safe to use as a recovery tool. A user must be able to inspect what a version contains, understand every change a restore will apply, restore it without losing the state it replaces, and return to the editor.

The 2026-09-28 WebKitGTK audit used a disposable local workspace and observed:

1. Editing a note less than five minutes after its last snapshot, then restoring that snapshot, removed the edit from both the note and every remaining snapshot. `restore_note_snapshot_impl` writes a snapshot of the restored document after replacing the current document; it never captures the state being replaced.
2. Clicking **Back to note** left the history route open. `WorkspaceShell.openNote` treats the shared `noteId` as proof that the editor route is already active.
3. One real text edit produced six changed rows. Five blocks were semantically equal, but `JSON.stringify` retained different property insertion orders from the editor and the stored snapshot.
4. The diff omits `properties` and `canvas`, although the restore replaces them. **As note** flattens callouts and checklists and cannot faithfully inspect tables, media, or formatting.
5. Automatic snapshot pruning uses a fixed limit of 50 while Settings accepts 1–200. Confirmation can outlive a selection change. A failed copy can leave the newly created empty note behind. At phone width, the back button has no accessible name and the tablist lacks arrow-key behavior.

Current touchpoints: `src-tauri/src/commands/note/{snapshots,restore_journal,crud}.rs`, `src/stores/note.ts`, `src/app/WorkspaceShell.vue`, `src/features/history/`, `src/utils/noteHistory.ts`, and `src/app/components/settings/SettingsFilesPanel.vue`. Existing focused tests pass but do not cover these cases.

## 2. Product contract

### 2.1 Restore and recovery

- A successful restore always leaves a selectable snapshot of the exact note state that was replaced, including content, canvas, properties, cover, marks, attributes, asset references, and unknown fields. This recovery snapshot must bypass the normal five-minute throttle.
- With retention set to **1**, the one retained snapshot after restore is the pre-restore state. Do not add a duplicate snapshot of the newly restored state. With a larger limit, prune oldest snapshots only after a successful restore. A restored state is already authoritative in the live note file.
- Read and validate the current note before replacing it. If it is missing, malformed, degraded, or cannot be safely snapshotted, abort before modifying it and show an error. Never substitute an empty document or silently discard unknown fields.
- Preserve the current note's identity and placement (`id`, `createdAt`, `folderId`) when applying historical editable data. Restore title, icon, cover, properties, content, canvas, and known editable extension data. Keep unknown current fields unless the code can prove a safe round trip. Do not move the note in the workspace tree as a side effect of restoring content.
- Flush the live editor's pending content and await the note's queued disk saves before the backend restore begins. Prevent any stale autosave from overwriting the restored document afterward. This must work when entering history from an editor route with the same `noteId`.
- The recovery snapshot must be durable before the journaled note replacement begins. If writing it fails, leave the note untouched. A crash before replacement may leave an extra recovery snapshot; a crash during replacement must retain both the recovery snapshot and the journal's ability to finish the replacement.
- Treat the note file and manifest metadata update as one recoverable restore operation. Preserve compatibility with older restore journal markers, including the legacy two-entry marker. After the durable commit, a cleanup or index failure must not be reported as if the note were unchanged; surface partial maintenance failure separately and keep the authoritative note readable.
- Refresh the rebuildable SQLite note index after a committed restore so search and metadata queries reflect the restored title, properties, and content. Index failure is logged and does not undo an authoritative commit.
- On success, refresh the timeline and make the pre-restore snapshot easy to identify and select for reversal. Do not imply that a restored duplicate is a new version. On failure, keep the selected version and show a recoverable error.

### 2.2 Snapshot retention

- Use the normalized workspace setting `files.snapshotRetentionCount` (1–200, default 50) for automatic snapshot pruning and explicit per-note pruning. Manual workspace cleanup and the timeline footnote must describe the same limit.
- Keep the existing on-disk snapshot naming and `NoteSnapshotMeta` shape. Existing snapshots remain readable; no migration or new authoritative store is introduced.
- Snapshot-list metadata may continue to avoid parsing every full document. A corrupt snapshot must fail when selected, and Copy/Restore must remain disabled for that failed selection.

### 2.3 Comparison and preview

- Compare block trees by semantic values. Object key insertion order is irrelevant; array order, text, node type, marks, and attributes remain meaningful. A recursive canonical representation may be local to `src/utils/noteHistory.ts` unless an existing helper is found.
- Show no changed row for a block whose only difference is JSON object key order. Show a meaningful description when formatting, block type, or attributes change without visible text changes; identical text marked only **Changed** is insufficient.
- Include title, icon, cover, `properties` (type, tags, date, status), and canvas presence/layout in the comparison. For canvas, a clear structural summary is acceptable; a visual canvas diff is outside scope. Never show **No differences** when restore would change any of these fields.
- **As note** is a read-only preview. Render common native block types with their meaningful structure and state, including lists, checked items, callouts, tables, images, and text marks. If a plugin or unsupported block cannot be rendered safely, show its type and an explicit preview limitation; do not silently flatten it into ordinary prose or execute plugin code.
- Do not mutate a snapshot while previewing it. Render text and URLs through the project's safe rendering rules; imported HTML/SVG and asset paths remain untrusted.

### 2.4 Screen interactions and accessibility

- **Back to note** and selecting the same note from the sidebar leave history for `/workspace/note/:noteId`. Browser back and mobile back continue to work. Opening a copied note still navigates to the new note.
- Opening restore confirmation binds it to one loaded snapshot ID and shows that version's timestamp. Changing the timeline selection closes confirmation. Confirm is disabled while the snapshot is loading or has failed to load. A failed restore leaves a retryable state for that same version.
- Copy is enabled only for a successfully loaded snapshot. If creating or saving the copy fails, the operation must not leave a visible empty note. If rollback itself fails, report the remaining note ID so the user can find it; do not silently claim nothing was created.
- At widths at or below 480px, the icon-only back control has an accessible name. The three view tabs expose a complete tab relationship (`aria-controls`/panel association and selected state), support Left/Right/Home/End keyboard navigation, and keep visible focus. Confirmation text and Cancel/Confirm controls form a readable, ordered layout at 390px and 360px.
- Loading and error states announce their purpose to assistive technology. Failed timeline and snapshot loads offer a retry path without requiring navigation away.

## 3. Architecture and state ownership

| Unit | Responsibility |
| --- | --- |
| `src-tauri/src/commands/note/snapshots.rs` | Snapshot creation, restore ordering, retention count, and backend result semantics. Keep blocking filesystem work off the webview thread. |
| `src-tauri/src/commands/note/restore_journal.rs` | Recoverable commit of the note and manifest metadata; preserve old marker recovery. |
| `src/stores/note.ts` and `src/core/document-session/` | Await and suspend the active note's editor/save session around restore; reload authoritative disk state afterward. No ProseMirror state in Pinia. |
| `src/utils/noteHistory.ts` | Framework-agnostic semantic comparison and preview data. No Vue or I/O. |
| `src/features/history/useNoteHistory.ts` | Timeline, selection, loading, copy/restore action state, and stale-request cancellation. |
| `src/features/history/HistoryView.vue`, `HistoryTopBar.vue`, `HistoryDiffPane.vue`, `HistoryBlockContent.vue`, `HistoryMetadataStrip.vue` | Route composition and accessible presentation. Do not put persistence logic in components. |
| `src/app/WorkspaceShell.vue` | Route transitions between editor and history. |
| `src/app/components/settings/SettingsFilesPanel.vue` | Display the effective retention limit; no independent retention policy. |

The note file remains the sole source of truth. Snapshot JSON remains a full, immutable `NoteDocument` copy. No persisted schema, public plugin API, cloud service, collaboration state, or new runtime dependency is required.

## 4. Agent work packages and ownership

The Sol orchestrator should review the current dirty tree and assign non-overlapping work. Use `gpt-6-luna` for coding and `gpt-6-sol` for independent verification, as required by `AGENTS.md`. Do not overwrite unrelated user changes. Parallel work is safe only within the ownership below; integrate sequentially when an interface changes.

| Package | Owned files and deliverable |
| --- | --- |
| A — durable restore and retention | Own `src-tauri/src/commands/note/{snapshots,restore_journal,crud}.rs`, their Rust tests, `src/stores/note.ts` and focused store/editor-persistence tests. Define and test the pre-restore snapshot, save barrier, journal behavior, and settings-derived retention. Own updates to `docs/data-model.md` and `ARCHITECTURE.md` for changed persistence behavior. |
| B — truthful comparison and preview | Own `src/utils/noteHistory.ts` and its tests; `HistoryDiffPane.vue`, `HistoryBlockContent.vue`, `HistoryMetadataStrip.vue`, `HistoryDiffRow.vue`, `HistoryDiffRowChanged.vue`, their focused tests, and `src/styles/features/history/history-diff-*.css`. Produce a concise list of required new i18n keys for package C. |
| C — route and action UX | Own `src/app/WorkspaceShell.vue` and focused route tests; `HistoryView.vue`, `HistoryTopBar.vue`, `HistoryTimeline.vue`, `useNoteHistory.ts`, their focused tests, `src/styles/features/history/history-timeline.css`, and registered locale catalogs. Own copy rollback, confirmation binding, retry, navigation, mobile accessibility, and the effective-retention footnote. Coordinate any API expectation with A/B before editing. |
| Sol verification/integration | Review the actual combined diff and data-safety invariants, verify no ownership conflict, run the checks below, update `changes.md` only after verified implementation, then run `graphify update .`. Return defects to the owning coder and re-verify. |

If one package grows beyond a focused concern, split it at the existing service/composable/component boundary before coding; roughly 500 lines in a new file is a signal to redraw the boundary.

## 5. Acceptance scenarios

1. **Restore can be reversed:** save version A, edit to B inside the five-minute throttle window, restore A, and find B in a selectable recovery snapshot. Repeat with retention 1 and 2. Assert the exact semantic content, canvas, properties, marks, assets, unknown fields, title, and icon.
2. **No unsafe partial restore:** inject current-note parse failure, recovery-snapshot write failure, journal interruption, manifest write failure, and prune/index failure. A pre-commit failure leaves the note unchanged; a post-commit failure leaves a readable note, a recovery snapshot, and an honest result. Reopen the workspace to exercise journal recovery and idempotence.
3. **No stale-save overwrite:** edit in a mounted editor, immediately enter history, and restore before the normal autosave delay. After navigation, reload, and a later autosave tick, the restored note remains restored and the pre-restore edit remains in history.
4. **Retention matches Settings:** test 1, 12, 50, and 200; automatic saves and explicit cleanup agree. Test missing and legacy settings default to 50 without changing the stored schema.
5. **Diff is truthful:** equal nodes with reversed object-key order yield no changed row. Changes to text, marks, type, attributes, each property field, and canvas yield visible explanations. An unchanged full note yields **No differences**.
6. **Preview preserves meaning:** checklist state, callout, list, table, image, and formatting are inspectable or explicitly labeled unsupported. Previewing an unknown block never alters stored content or runs untrusted code.
7. **Actions match selection:** confirmation for A closes when B is selected; loading/corrupt B cannot be copied or restored; retry works; a failed copy leaves no visible empty note or reports a failed rollback explicitly.
8. **Navigation and accessibility:** click Back from history and select the same note in the sidebar; both reach the editor. At 390px and 360px in both themes, test confirmation layout, accessible back name, tab arrow keys, focus visibility, Escape/mobile back, loading, and error states in the real Tauri/WebKitGTK app.

## 6. Verification and handoff

- Run focused Vitest for `src/utils/noteHistory.test.ts`, history components, `WorkspaceShell`, `noteStore`, and editor persistence. Add tests that assert behavior and data, not CSS class strings alone.
- Run `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts`, ESLint on changed TS/Vue files, and `pnpm build` for changed types/component contracts.
- Run `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and targeted Rust note/snapshot/journal tests. Run broader Rust checks selected by `.codex/skills/nevo-verify-change` when the final diff warrants them.
- Run `pnpm qa` on the real app for light/dark, desktop and narrow mobile, keyboard and pointer flows. Save and inspect screenshots of comparison, confirmation, success, and errors. Stop the QA session afterward.
- Review the final scoped diff and `git diff --check`. Preserve all pre-existing dirty-worktree changes. Update `changes.md` only for verified behavior, update affected architecture/data-model/testing docs, and run `graphify update .` after source or project-document changes.
- Report completed packages, checks actually run, baseline failures, skipped platform checks, and any remaining risk. No agent should claim the restore is safe based only on component tests or a successful build.

## 7. Out of scope

- A new version-label system, Git integration, day-based retention, or a broader history redesign.
- Changes to import/export formats, the editor schema, cloud/collaboration subsystems, or plugin SDK contracts.
- Automatic deletion or rewriting of existing snapshots as a migration. Existing data must stay readable.
