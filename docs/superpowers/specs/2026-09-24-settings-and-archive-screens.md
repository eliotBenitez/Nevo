# Settings and Archive as Screens — Implementation Spec

**Status:** Ready for implementation
**Date:** 2026-09-24
**Intended executor:** Gemini (any agent that reads `AGENTS.md` via `GEMINI.md`)
**Builds on:** `docs/superpowers/specs/2026-09-23-settings-and-archive-ui.md` (Archive rename, settings component contract — already implemented)
**Parent design:** `docs/superpowers/specs/2026-09-22-solid-ui-redesign-design.md` (Borderless, frame + island; see the Settings and Archive rows in its screen table)
**Visual reference:** `docs/design/nevo-reference.html` — sections `#settings`, `#trash` (titled "Архив") and, for the pattern both copy, `#history`. Open it in a browser.
**Progress/handoff file:** `docs/superpowers/plans/2026-09-23-borderless-ui-progress.md`

## 0. Read first

1. `AGENTS.md` (root), `src/ui/AGENTS.md`, `src/locales/AGENTS.md`. They are binding. Answers to the user are in Russian; code, identifiers and `changes.md` are in English.
2. The three reference sections above. The effective look of each is its base CSS rule **plus** the `html[data-surface="borderless"] …` override block in the reference's `<style>` (`.set-view`, `.set-nav`, `.set-main`, `.trv*`, `.hist`, `.tl*`, `.diff*`, `.mstrip`).
3. The handoff file's "Ground rules" and "Verification baseline". What matters here:
   - The working tree contains a lot of **user-owned uncommitted work**, including the files you will edit. Never run `git checkout`, `git stash`, `git reset`, or revert files. Edit on top of the current contents. Do not commit.
   - Only semantic and component tokens (`--surface-*`, `--text-*`, `--frame-bg`, `--island-bg`, `--input-bg`, `--input-ring`, `--shadow-raised`, `--focus-ring`, `--danger`/`--warning`/`--success`, …). No hard-coded colors, no legacy names (`--glass-*`, `--line-*`, `--text-1..4`, …), no `backdrop-filter` (`src/styles/no-backdrop-filter.test.ts` enforces this).
   - Borderless rules: no 1px dividers between regions, rows or groups; separate with spacing, mono uppercase group labels and tone. Removed borders stay as `border: 1px solid transparent` (forced-colors).

## 1. Goal

Settings and Archive stop being modal windows. Each becomes a **full-screen workspace route** that renders in the same content slot as the version-history screen (`HistoryView`), with the same layout pattern:

The whole screen sits on the shell's content island, like `HistoryView`, so it is visibly separated from the workspace sidebar:

- left: a column tinted like the history timeline, with a back button ("К пространству"), the screen title, a muted meta line, a search field and a list (settings sections / archived items);
- right: the island tone itself, with the content (the active settings panel / the selected archived item).

Only the destructive confirmations ("Удалить навсегда?", "Очистить архив?") stay modal.

## 2. Non-goals and hard constraints

- **No persisted-data or backend changes.** `manifest.trash`, `TrashedItem`, `treeStore.restoreFromTrash` / `permanentlyDeleteFromTrash` / `emptyTrash`, `settings.files.trashRetentionDays`, all Rust commands and the settings schema stay as they are.
- **Hotkey command ids stay** `workspace.open-trash` and `app.open-settings` (persisted in user hotkey settings). Only what they do changes (§5.4).
- **Settings behavior does not change:** same 12 sections, same panels, same `v-model`s, same settings search and `revealSetting` highlight, same phone exclusions (`mcp`, `hotkeys` hidden on phones), diagnostics and plugins still reloaded on entry.
- **Archive behavior does not change:** same data source (`useArchiveItems`), same confirmations, same retention math (`src/utils/archive/retention.ts`).
- Do not touch `src-tauri/`, `src/tauri/`, the history feature's behavior, or unrelated modals (templates, imports, favorites manager, board modal).
- No new runtime dependencies.

## 3. Current state (verify before editing — line numbers drift)

- **Router** `src/router/index.ts`: every `/workspace/*` path maps to `src/app/WorkspaceShell.vue`; there is no settings or archive route. History is `/workspace/note/:noteId/history`.
- **Shell** `src/app/WorkspaceShell.vue` (~1440 lines — already far over the 500-line threshold; **do not grow it**):
  - state `settingsModalOpen`, `settingsModalSection`, `trashModalOpen`;
  - `openSettings(section)`, `openTrash()`, `toggleSettings()`, `toggleTrash()`;
  - a capture-phase Escape listener for the archive (`onTrashWindowKeydown`, `toggleTrashEscapeListener`, `watch(trashModalOpen)`);
  - `workspaceBackEnabled` / `handleMobileBack` reference both flags;
  - the content slot chain: `WorkspaceHome` → `GraphView` → `KanbanView` → `DrawView` → `HistoryView` → sandbox plugin view, then the editor pane shell guarded by `!isGraphView && !isKanbanView && !isDrawView && !isHistoryView && !isMobilePrimaryView`;
  - template mounts `<NvModal :open="trashModalOpen" … panel-class="trash-modal-panel"><WorkspaceArchive @close=…/></NvModal>` and `<WorkspaceSettingsModal v-if="settingsModalOpen" … />`;
  - scoped styles `.trash-modal*` (dead once the modal is gone);
  - entry points: titlebar settings button, `WorkspaceSidebar` (`open-trash`, `open-settings`), mobile More view (`@trash`, `@settings`), title-bar/search-overlay setting results (`handleTitleBarSearchSelect` → `openSettings(result.section)`), `useWorkspaceKeymap` (`openTrash: toggleTrash`, `openSettings: toggleSettings`).
  - watchers that matter for data safety: `watch(activeNoteId)` flushes the outgoing note; `watch([activePath, activeNoteId, activeFolderId])` calls `workspaceStore.updateLastContext(...)`; `rememberNoteView` is skipped for draw/history.
- **Settings** `src/app/components/WorkspaceSettingsModal.vue` (461 lines): wraps everything in `NvModal size="full"`; desktop `.settings-shell` (sidebar head with a hard-coded `⌘,`, search, nav, footer; main with search results or the active panel) and a phone flow (`mobilePage: 'root' | 'detail'`, own `useMobileBackButton`). Own Escape listener that respects `nv-select-open` and hotkey capture. Styles: `src/styles/settings.css`, `src/styles/mobile-settings.css` (imported by the SFC), `settings-panels.css`. Tests: `WorkspaceSettingsModal.mobile.test.ts`.
- **Archive** `src/app/components/archive/`: `WorkspaceArchive.vue` (208 lines; header, search, roving-focus list of `ArchiveItemRow`, empty/no-results states, footer with "Очистить архив…" and "Готово"), `ArchiveItemRow.vue` (row with inline Restore / Delete forever), tests `WorkspaceArchive.test.ts`. Logic `src/app/composables/useArchiveItems.ts` (+ test). Styles `src/styles/app/archive.css` (targets `.trash-modal-panel`).
- **History screen** `src/features/history/HistoryView.vue` + `src/styles/features/history/*.css`: the model to copy for how a route fills the content slot. `HistoryBlockContent.vue` + `normalizeHistoryBlocks()` (`src/utils/noteHistory.ts`) render a read-only block preview of a `NoteDocument`.
- **Reading a trashed note:** trashing leaves `note.json` on disk (restore re-reads it), so `workspaceStore.backend.loadNote(id)` works for archived notes. Archived **folders** have no loadable document.

## 4. Routes

| Path | Screen | Notes |
| --- | --- | --- |
| `/workspace/settings` | Settings | Desktop: shows `general`. Phone: the section list (current "root" page). |
| `/workspace/settings/:section` | Settings | `section` is a `SettingsSectionId`. Unknown ids, and `mcp`/`hotkeys` on phones, `router.replace` to `/workspace/settings`. Phone: the section detail page. |
| `/workspace/archive` | Archive | Selection is component state, not part of the URL. |

Add them to `src/router/index.ts` pointing at `WorkspaceShell.vue`, like the other workspace routes (either two records, `/workspace/settings/:section?` and `/workspace/archive`, or three literal ones — nothing shadows them today).

## 5. Shell integration

### 5.1 New unit — keep the shell from growing

| File | Single responsibility |
| --- | --- |
| `src/app/routing/systemRoutes.ts` (new, framework-agnostic) | Path builders and parsers: `settingsPath(section?: SettingsSectionId \| null)`, `ARCHIVE_PATH`, `parseSettingsSection(param: unknown, allowed: readonly SettingsSectionId[]): SettingsSectionId \| null`, `isSettingsPath(path)`, `isArchivePath(path)`, `isSystemPath(path)`. |
| `src/app/composables/useSystemViews.ts` (new) | Everything the shell needs about these two screens: `isSettingsView`, `isArchiveView`, `settingsSection` (computed from the route), `openSettings(section?)`, `openArchive()`, `toggleSettings()`, `toggleArchive()`, `leaveSystemView()`. It owns the "return to" logic (§5.3). Takes `router`, `route` and a `closeMobileSidebar` callback; no store writes. |

`WorkspaceShell.vue` **net line count must go down**: delete the three modal refs, the archive Escape listener block, both modal mounts and the `.trash-modal*` styles; replace the old functions with the composable's.

### 5.2 Content slot

- Add `SettingsView` and `ArchiveView` as `defineAsyncComponent` imports and render them in the content-slot chain next to `HistoryView`:
  `<WorkspaceSettingsView v-else-if="isSettingsView" … @back="leaveSystemView" />`, `<WorkspaceArchiveView v-else-if="isArchiveView" @back="leaveSystemView" />`.
- Extend the editor-pane-shell guard with `!isSettingsView && !isArchiveView`, exactly as for history.
- Workspace sidebar, titlebar and right panel behave exactly as they do on the history route (check the right panel is hidden there too). No tab is opened for these routes (same as graph/history).
- On phones, add the two routes to `hideWorkspaceTitlebar` (the screens have their own top bar, as the settings phone flow does today).

### 5.3 Leaving the screen ("К пространству", Escape, hotkey toggle)

- `leaveSystemView()`: if the previous history entry is a workspace route that is **not** a settings/archive route, go back to it (`router.back()` when `router.options.history.state.back` matches, otherwise `router.push(back)`); otherwise `router.push(isPhone ? '/workspace/more' : '/workspace')`. Moving between settings sections must not count as the "previous" route: use `router.replace` when switching sections on desktop, so one back action always leaves settings.
- Escape: each screen installs a capture-phase `keydown` listener while mounted (move the settings modal's current logic: ignore when `document.body.classList.contains('nv-select-open')`; cancel hotkey capture first; clear a non-empty search first; otherwise emit `back`). The archive does the same; do **not** leave the archive while its confirm dialog is open (the confirm dialog handles its own Escape — verify the event order with a test).
- `toggleSettings()` / `toggleArchive()` (hotkeys): on the matching route → `leaveSystemView()`, otherwise open it. Opening settings from archive (or vice versa) uses `router.replace` so back returns to where the user came from.

### 5.4 Entry points (all go through the composable)

Titlebar settings button, sidebar `open-settings` / `open-trash`, mobile More `settings` / `trash`, search results of type `setting` (`openSettings(result.section)` → `/workspace/settings/<section>` and then `revealSetting(result.title)` once the panel is mounted — pass the title via a one-shot `history.state` field or a small reactive "pending reveal" ref in the composable; do not put it in the URL), and the two hotkeys.

### 5.5 Data-safety requirements (load-bearing)

- Navigating from an open note to settings/archive changes `activeNoteId` to `null`, which runs the existing flush in `watch(activeNoteId)`. Keep that: unsaved edits must be flushed exactly as when opening the graph. Add a regression test (§8).
- `updateLastContext`: **skip** the update while `isSystemPath(route.path)` is true, so quitting the app from settings/archive still restores the last note/folder on next launch. Test it.
- Do not call `noteStore` to load the archived note preview (§7.3). The preview must never touch the active note, the editor, or autosave.

### 5.6 Mobile back

- Shell `workspaceBackEnabled`: replace `!settingsModalOpen.value` with `!isSettingsView.value` (the settings screen keeps owning the hardware back on phones, as today); remove `trashModalOpen` from both `workspaceBackEnabled` and `handleMobileBack`; add `isArchiveView → leaveSystemView()` to `handleMobileBack`.
- Settings phone back: non-empty search → clear; `/workspace/settings/:section` → `router.replace('/workspace/settings')`; root → emit `back`.

## 6. Settings screen

### 6.1 Units

Rename `WorkspaceSettingsModal.vue` to **`src/app/components/settings/WorkspaceSettingsView.vue`** (use `git mv` semantics only if safe; otherwise create the new file and delete the old one) and split it — it is at the threshold already:

| File | Single responsibility |
| --- | --- |
| `src/app/composables/useSettingsSections.ts` (new) | Section metadata (ids, labels, icons, plugin count, phone filtering), mobile groups, the `SettingsSectionId → panel component` map (async panels as today), search catalog and ranked results. |
| `src/app/components/settings/SettingsNavColumn.vue` (new) | Desktop left column: back button, title, meta line with the resolved `app.open-settings` chord (use `resolveBindingChord`, not the hard-coded `⌘,`), search field, section nav (`aria-current="page"`), version footer. Emits `select`, `back`, `update:search`. |
| `src/app/components/settings/SettingsSearchResults.vue` (new) | The search-results panel (moved as is). |
| `src/app/components/settings/MobileSettingsHome.vue` (new) | Phone root page (search + grouped section list + version). |
| `src/app/components/settings/WorkspaceSettingsView.vue` | Container: reads `section` prop (from the route), wires the pieces, loads diagnostics/plugins on mount, Escape and phone back (§5.3, §5.6), `revealSetting` via `useSettingHighlight`. No `NvModal`, no focus trap. |

Each file well under 500 lines. Keep the CSS files; import `settings.css` / `mobile-settings.css` from the view as the modal did (lazy chunk). Remove selectors that only existed for the modal panel (`.settings-modal-panel*`, `.settings-modal-body`, NvModal overrides) and the dead `--no-header` variant.

### 6.2 Layout (reference `#settings`)

- Root: `display: grid; grid-template-columns: 240px minmax(0,1fr); height: 100%` on the island tone (`var(--workspace-editor-surface, var(--surface-canvas))`), no padding — it sits on the shell's content island exactly like `HistoryView`. **Do not paint the root with `--frame-bg`:** the left column would merge with the workspace sidebar (fixed 2026-09-24).
- Left column: the history timeline's tint (`color-mix(in oklab, var(--workspace-navigation-surface) 34%, var(--workspace-editor-surface))`), `padding: 14px 8px`; head block (ghost small button with `ArrowLeft` + "К пространству", 14px/600 title "Настройки", muted 12px meta "{workspace name} · {chord}"), filled search, nav items (radius 8, hover `--hover`, active = `--surface-overlay` + `--shadow-raised` + weight 500 + accent icon), version footer pinned to the bottom. The column scrolls independently if it overflows.
- Right: transparent on the island (`overflow-y: auto`), containing the panel exactly as today (the panels already follow the `SettingsSectionHeader`/`SettingsGroup`/`SettingsRow` contract).
- The heading `id="workspace-settings-heading"` stays and labels the view: the root element is `<section aria-labelledby="workspace-settings-heading">`.
- Focus: on entering the route, focus the active nav item (desktop) or the phone top bar's back button; on section change, move focus to the panel heading only when the change came from the keyboard (don't steal focus from pointer users).
- Width < 900px (desktop runtime, narrow window): the left column collapses to 200px; below 720px use the phone flow layout (list page / detail page) driven by the route, same as `isPhone`.

### 6.3 Phone

Keep the current phone flow and styles, now route-driven: `/workspace/settings` = root list, `/workspace/settings/:section` = detail. The top bar shows the back arrow and the title (section label on detail pages). No "Готово" button is needed because nothing is modal.

## 7. Archive screen

### 7.1 Units

| File | Single responsibility |
| --- | --- |
| `src/utils/archive/grouping.ts` (new, pure) | `groupArchiveItems(items, now)` → ordered groups `today` / `thisWeek` / `earlier` (calendar-day arithmetic in local time, same approach as `retention.ts`; empty groups omitted). |
| `src/app/composables/useArchiveItems.ts` (extend) | Add `groups` (via `groupArchiveItems`), `selectedId`, `select(id)`, `selectedItem`, and keep selection valid after restore/delete/search (next item, else previous, else `null`). Existing API unchanged. |
| `src/app/composables/useArchivePreview.ts` (new) | Given `selectedItem`, loads a read-only preview for notes via `workspaceStore.backend.loadNote(id)` → `normalizeHistoryBlocks(doc.content)`, first 12 blocks + remaining count. Guards against stale responses (request token), exposes `loading`, `error`, `blocks`, `moreCount`. Folders → no request, `kind: 'folder'`. Never touches `noteStore`. |
| `src/app/components/archive/ArchiveListColumn.vue` (new) | Left column: back button, title, meta ("{count} · {retention}"), search, grouped `role="listbox"` with `role="option"` rows (`aria-selected`), roving selection with ArrowUp/Down/Home/End, Enter = restore, Delete/Backspace = delete-forever confirmation; footer with "Без отмены" hint and ghost-danger "Очистить архив…" (disabled when empty). |
| `src/app/components/archive/ArchiveListItem.vue` (new) | Compact option row (grid `28px | 1fr | auto`): icon tile, title, meta `{parentLabel} · {deletedLabel}`, days left with the existing tone colors (text always present; hidden when retention is `0`). No action buttons (actions live in the detail pane on desktop). |
| `src/app/components/archive/ArchiveItemDetail.vue` (new) | Right island: header (title, "Удалено {date} · окончательно удалится через {days} дн." or the forever variant), actions ghost-danger "Удалить навсегда" and primary "Восстановить"; meta strip ("Откуда: {parentLabel}", type); preview (mono eyebrow "Предпросмотр · только чтение", blocks via `HistoryBlockContent`, "Ещё блоков: {count}"), loading / error ("Предпросмотр недоступен") / folder ("Папка вернётся вместе с содержимым") / nothing-selected states. |
| `src/app/components/archive/WorkspaceArchiveView.vue` (new; replaces `WorkspaceArchive.vue`) | Container: two-column layout, wires composables and children, Escape (§5.3), emits `back`. On phones renders a single column: the list with the existing inline-action `ArchiveItemRow` (keep that component for the phone), no detail pane. |

Delete `WorkspaceArchive.vue` once nothing imports it; migrate its tests (§8). Retarget `src/styles/app/archive.css` from `.trash-modal-panel` to the view's classes (or split into `archive-view.css` + the existing row styles) — no modal selectors left.

### 7.2 Layout (reference `#trash`)

- Root grid `320px minmax(0,1fr)`, `height: 100%`, on the island tone with no padding (same rule as settings §6.2).
- Left column with the history timeline's tint; mono uppercase group labels (`.tl-day` style: 10.5px, `.06em`, `--text-muted`); selected option = `--island-bg` tone, radius `--r-sm`, 8px inset (like `.tl-item.on` in the borderless block); hover `--hover`; footer pinned to the bottom with no divider.
- Right pane transparent on the island; header row like `.diff-h`; meta strip on the frame tone, radius `--r-sm`, 16px side inset (like `.mstrip`); preview column max-width 68ch, 14px/1.6 text.
- Empty archive: left column shows head + disabled search; island shows the centered empty state (`Inbox`, `emptyTitle`, `emptyState`). No search results: the list area shows the existing no-results state; the island shows the nothing-selected state.
- After **Restore**: keep the user on the archive; show the existing success feedback if any (do not add a new toast unless one already exists for restore); selection moves to the next item.

## 8. Tests

Follow existing patterns (Vitest, `@vue/test-utils`, real Pinia, stubs as sibling tests do). Minimum:

- `src/app/routing/systemRoutes.test.ts`: builders; `parseSettingsSection` with valid, unknown, array and phone-excluded ids; `isSystemPath`.
- `src/app/composables/useSystemViews.test.ts` (memory-history router): open/toggle/leave for both screens; back returns to the originating note route; direct entry (no back state) leaves to `/workspace` (`/workspace/more` on phone); switching sections uses `replace` so a single leave exits settings.
- `src/app/WorkspaceShell.test.ts`: replace the settings-modal stub assertions and the "opens and closes the trash modal via Escape key" test with route-based equivalents (search result opens `/workspace/settings/<section>`; `open-trash` navigates to `/workspace/archive`; Escape returns). Add: opening settings from a dirty note flushes it; `updateLastContext` is not called with `null` while on a system route.
- `src/app/components/settings/WorkspaceSettingsView.test.ts` (+ migrate `WorkspaceSettingsModal.mobile.test.ts` → `WorkspaceSettingsView.mobile.test.ts`): renders the section from the prop; unknown section falls back; search results open the right panel and call `revealSetting`; Escape order (select open → ignored, capture → cancelled, search → cleared, else `back`); phone root/detail driven by the prop; the chord comes from the hotkey binding.
- `src/utils/archive/grouping.test.ts`: today / this week / earlier boundaries with fixed dates, empty groups omitted, order preserved.
- `useArchiveItems.test.ts`: selection stays valid after restore, delete and filtering.
- `src/app/composables/useArchivePreview.test.ts`: note → blocks + more count; folder → no backend call; backend error → error state; stale response ignored when selection changes mid-flight; `noteStore` untouched.
- `src/app/components/archive/WorkspaceArchiveView.test.ts` (migrated from `WorkspaceArchive.test.ts`): groups render; arrow keys change selection and the detail pane; Enter restores; Delete confirms; "Очистить архив…" disabled when empty; days-left hidden at retention `0`; phone renders inline-action rows and no detail pane.
- Locale tests (§9).

## 9. Locales (all five catalogs)

Edit `src/locales/{en,ru,fr,es,de}.json` **as text** — never round-trip them through a JSON serializer. Keep placeholders identical. Run `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts` and, if present, `node .claude/skills/nevo-i18n-key/scripts/locale_diff.mjs` (it has 2 pre-existing `ru` plural-branch findings — do not touch them, add none).

Reuse before adding: `workspace.history.timeline.today`, `settings.title`, `settings.search.*`, `workspace.trash.*` (title, countLabel, retentionDays, retentionForever, deletedRelative, rootFolder, searchLabel, emptyTitle, emptyState, noResults*, emptyAction, deleteItem, restore labels). Remove `workspace.trash.done` and `workspace.trash.actionHint` from all catalogs if they end up unused (grep first).

New keys:

| Key | ru | en | fr | es | de |
| --- | --- | --- | --- | --- | --- |
| `workspace.systemView.backToWorkspace` | К пространству | Back to workspace | Retour à l’espace | Volver al espacio | Zurück zum Arbeitsbereich |
| `workspace.trash.groups.today` | Сегодня | Today | Aujourd’hui | Hoy | Heute |
| `workspace.trash.groups.thisWeek` | На этой неделе | This week | Cette semaine | Esta semana | Diese Woche |
| `workspace.trash.groups.earlier` | Раньше | Earlier | Plus tôt | Antes | Früher |
| `workspace.trash.deletedAt` | Удалено {date} | Deleted {date} | Supprimé le {date} | Eliminado el {date} | Gelöscht am {date} |
| `workspace.trash.purgeIn` | Окончательно удалится через {days} дн. | Permanently deleted in {days} d | Suppression définitive dans {days} j | Se eliminará definitivamente en {days} d | Endgültig gelöscht in {days} T |
| `workspace.trash.from` | Откуда: {place} | From: {place} | Provenance : {place} | Origen: {place} | Herkunft: {place} |
| `workspace.trash.noUndoHint` | Без отмены | Can’t be undone | Irréversible | No se puede deshacer | Nicht umkehrbar |
| `workspace.trash.previewLabel` | Предпросмотр · только чтение | Preview · read-only | Aperçu · lecture seule | Vista previa · solo lectura | Vorschau · schreibgeschützt |
| `workspace.trash.previewMore` | Ещё блоков: {count} | {count} more blocks | {count} blocs de plus | {count} bloques más | {count} weitere Blöcke |
| `workspace.trash.previewUnavailable` | Предпросмотр недоступен | Preview unavailable | Aperçu indisponible | Vista previa no disponible | Vorschau nicht verfügbar |
| `workspace.trash.folderPreview` | Папка вернётся вместе с содержимым. | The folder is restored with its contents. | Le dossier sera restauré avec son contenu. | La carpeta se restaura con su contenido. | Der Ordner wird mit seinem Inhalt wiederhergestellt. |
| `workspace.trash.selectPrompt` | Выберите элемент, чтобы посмотреть его | Select an item to preview it | Sélectionnez un élément pour l’afficher | Selecciona un elemento para verlo | Wähle ein Element für die Vorschau |

Format `{date}` with the existing localized date helper used by history (do not use raw `toLocaleString()`).

## 10. Accessibility

- Each screen is a landmark (`<section aria-labelledby>`), not a dialog: no `role="dialog"`, no focus trap, no scrim, no `inert` on the rest of the app.
- Visible `:focus-visible` (2px `--focus-ring`) on every control; the back button is the first tab stop in the left column.
- Archive listbox: `aria-activedescendant` or roving `tabindex` (pick one, be consistent), `aria-selected` on the selected option, the detail pane is `aria-live="polite"` only for its title line.
- Icon-only buttons have `aria-label`s; decorative icons `aria-hidden="true"`.
- Forced-colors: the island keeps `border: 1px solid transparent`.
- Phones: 44px touch targets.

## 11. Verification (run all; report actual results)

- Record the baseline first: `pnpm test:run` before any edit, and list the failing tests (the handoff file's last known baseline may be stale). Add no new failures.
- Focused Vitest on every new or touched test file; locale tests (§9).
- `pnpm exec eslint` on changed TS/Vue files → 0 errors, no new warnings.
- `pnpm build` (vue-tsc + Vite, bundle budgets must pass — the settings view must stay a lazy chunk).
- `git diff --check`.
- Visual check in `pnpm tauri dev` (light and dark, desktop ≥1200px, a ~800px window, phone width): settings and archive match the reference; back/Escape/hotkeys return to the originating note with its edits saved. If you cannot run the app, say so explicitly — do not claim visual verification you did not do.

## 12. Deliverables

1. Code per §4–§7, tests per §8, locales per §9.
2. Docs: update `ARCHITECTURE.md` if it lists workspace routes or describes settings/trash as modals; add a short note to `docs/superpowers/plans/2026-09-23-borderless-ui-progress.md` ("Settings and Archive screens": done / left).
3. `changes.md`: under `## 🔄 Updated / Improved`, an entry "**Settings and Archive screens**" (past tense, English, `* **Detail**: Description`) — only after verification passes.
4. `graphify update .` if the CLI is available (say so if not).
5. Final report in Russian: files created / changed / deleted with one line each, locale keys added/removed, checks run with their results, baseline failures, known gaps.

## 13. Out of scope / later

- Archive multi-select, bulk restore, restore into a different folder.
- Previewing the notes inside an archived folder (needs a backend listing).
- Backlink / attachment counts in the archive meta strip (shown in the reference as an illustration; add only if a cheap existing source exists — otherwise leave out and mention it in the report).
- Deep links to individual archived items (`/workspace/archive/:itemId`).
- Redesigning the history screen's own top bar to match the reference's in-column back button.
