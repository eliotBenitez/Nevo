# Settings and Archive UI — Implementation Spec

**Status:** Ready for implementation
**Date:** 2026-09-23
**Intended executor:** Gemini (any agent that reads `AGENTS.md` via `GEMINI.md`)
**Parent design:** `docs/superpowers/specs/2026-09-22-solid-ui-redesign-design.md` (Borderless, frame + island)
**Visual reference:** `docs/design/nevo-reference.html` — sections `#settings` (click the navigation items: seven sections are interactive) and `#trash` (the Archive window). Open it in a browser.
**Progress/handoff file:** `docs/superpowers/plans/2026-09-23-borderless-ui-progress.md`

## 0. Read first

1. `AGENTS.md` (root) and `src/ui/AGENTS.md`, `src/locales/AGENTS.md`. They are binding. Answers to the user are in Russian; code, identifiers, and `changes.md` are in English.
2. The two reference sections above. The reference's effective look is each base CSS rule **plus** the `html[data-surface="borderless"] …` override block in its `<style>`.
3. The handoff file's "Ground rules" and "Verification baseline". Summary of what matters here:
   - The working tree contains a lot of **user-owned uncommitted work**. Never run `git checkout`, `git stash`, `git reset`, or revert files. Edit on top of the current contents. Do not commit.
   - Use only semantic tokens (`--surface-*`, `--text-*`, `--border-*`, `--shadow-raised/overlay`, `--scrim`, `--focus-ring`, `--danger/--success/--warning` and their `--surface-*` fills) and component tokens from `src/styles/surfaces.css` (`--frame-bg`, `--island-bg`, `--menu-bg`, `--modal-bg`, `--input-bg`, `--input-ring`, …). No hard-coded colors.
   - Legacy names (`--glass-*`, `--line-*`, `--text-1..4`, `--canvas-*`, `--bg-*`, …) and `backdrop-filter` are forbidden in `src/`. `src/styles/no-backdrop-filter.test.ts` enforces this.
   - Borderless rules: no 1px dividers between regions, rows or sections. Separate with spacing, mono uppercase group labels (10.5px, `letter-spacing: .06em`, `--text-muted`) and hover tone. Selected item = island tone + `--shadow-raised` + weight 500. Cards only for independent objects with their own actions. Removed borders stay as `border: 1px solid transparent` (forced-colors).

## 1. Goal

Bring two surfaces to the approved reference:

- **Part A — Archive.** The current "Trash" (Корзина) window becomes **Archive** (Архив) in all user-facing text. The window is rebuilt to the reference `#trash` layout, split into focused units, and gains retention countdowns, keyboard navigation and better states.
- **Part B — Settings.** All settings panels follow one component contract (section header, groups, rows, object cards) matching the reference `#settings`. Visual and structural only; settings behavior and persistence do not change.

## 2. Non-goals and hard constraints

- **Do not rename internal identifiers or persisted data.** These stay exactly as they are:
  - `manifest.trash`, the `TrashedItem` type (`src/types/workspace.ts`), `treeStore.restoreFromTrash`, `treeStore.permanentlyDeleteFromTrash`, `treeStore.emptyTrash`;
  - the hotkey command id `workspace.open-trash` (it is persisted in user hotkey settings);
  - `settings.files.trashRetentionDays` (TS) / `trash_retention_days` (Rust), and every Rust command;
  - locale **key names** (only values change; see §5).
- No backend, Rust, manifest, or settings-schema changes.
- Do not re-add settings removed by the redesign (surface style, background scene, sidebar style, reduce transparency).
- Do not change routes, settings search behavior, or which settings exist.
- No new runtime dependencies.

## 3. Naming decision — Archive

User decision (2026-09-23): the trash is called **Archive / Архив**.

### 3.1 Semantics the UI must communicate

This is still the same feature: deleted items are kept for `trashRetentionDays` days (default 30; `0` = keep forever; the purge runs in Rust when the manifest loads — `src-tauri/src/commands/workspace/manifest.rs`) and then deleted permanently. "Archive" usually implies "kept forever", so the UI must state the retention explicitly (header description and per-row countdown, §4.3). Otherwise users will lose data they believe is archived.

### 3.2 Terminology collision — do not resolve silently

"Архив/archive" already means other things in the app:
- a workspace export file (`.nevoz`) in `workspaceTransfer.*`, `onboarding.open.importArchive` ("Импорт из архива") and `export.saveTypstDialogTitle`;
- the workspace status "В архиве" (`settings.options.workspaceStatus.archived`).

For this task, **only change the strings listed in §5**. Do not edit `workspaceTransfer.*`, `onboarding.open.importArchive`, `export.*` or `workspaceStatus`. In your final report, list this collision as an open decision for the owner. The recommended follow-up is to call the export file "файл пространства (.nevoz)" / "workspace file".

## 4. Part A — Archive window

### 4.1 Current state

- `src/app/components/WorkspaceTrashBin.vue` (542 lines — above the 500-line design threshold): script (search filter, restore, delete, empty with confirm), template (`trash-shell`, `trash-header`, `trash-search`, `trash-list`, `trash-item`, `trash-state`, `trash-footer`) and a large scoped `<style>`.
- Mounted in `src/app/WorkspaceShell.vue` (~line 1250) inside `<NvModal :open="trashModalOpen" size="lg" :title="t('workspace.trash.title')" panel-class="trash-modal-panel">`. It is opened from the sidebar system item (`WorkspaceSidebar.vue`, `emit('open-trash')`), the mobile "More" view (`@trash`/`@open-trash` handlers in `WorkspaceShell.vue`), and the `workspace.open-trash` hotkey (`useWorkspaceKeymap`).
- Data: `manifest.trash: TrashedItem[]` with `{ id, type: 'note' | 'folder', title, deletedAt, originalParentId, icon? }`.
- Also check `src/styles/app/trash-modal.css`.

### 4.2 Target units (decide the split exactly like this)

| File | Single responsibility |
| --- | --- |
| `src/utils/archive/retention.ts` (new) | Pure, framework-agnostic helpers: `daysUntilPurge(deletedAt: string, retentionDays: number, now: Date): number \| null` (`null` when `retentionDays === 0`; never negative, clamps at 0) and `retentionTone(days: number \| null): 'none' \| 'normal' \| 'soon' \| 'last'` (`null → 'none'`, `> 7 → 'normal'`, `2..7 → 'soon'`, `≤ 1 → 'last'`). |
| `src/app/composables/useArchiveItems.ts` (new) | Stateful logic: search query, filtered list sorted by `deletedAt` descending, count, the retention setting from the workspace store, per-item `daysLeft`/`tone` via the helpers, the resolved parent label (`originalParentId` → folder title via the tree store, or the "workspace root" label), and the actions `restore(id)`, `deleteForever(id)`, `emptyArchive()`, which keep the existing `useConfirmDialog` confirmations and store calls. |
| `src/app/components/archive/ArchiveItemRow.vue` (new) | Presentational row: props `item`, `parentLabel`, `deletedLabel`, `daysLeft`, `tone`, `focused`; emits `restore`, `delete`, `focus`. No store access. |
| `src/app/components/archive/WorkspaceArchive.vue` (new; replaces `WorkspaceTrashBin.vue`) | Container: header description + count, search, list with roving focus, empty/no-results states, footer. Uses the composable and renders rows. |
| `src/styles/app/archive.css` (new, or rename `trash-modal.css`) | All Archive styles (move them out of the SFC). Import it the same way `trash-modal.css` is imported today. |

Delete `WorkspaceTrashBin.vue` once `WorkspaceShell.vue` imports `WorkspaceArchive.vue` (keep the async import). Each new file must stay well under 500 lines.

### 4.3 Layout and behavior (match reference `#trash`)

- **Modal:** keep `NvModal` (size `lg`); the title comes from `workspace.trash.title` ("Архив"). Overlay surface, radius 16, no header/footer dividers (already provided by `NvModal`).
- **Header area** (inside the body, top): 34px icon tile (`--surface-subtle`, Lucide `Archive` icon), description line and a mono count on the right (`workspace.trash.countLabel`). The description includes the retention: "Хранятся {days} дней, затем удаляются навсегда." or, when retention is `0`, "Хранятся без ограничения." (new keys, §5).
- **Search:** filled input (`--input-bg`, transparent border, 2px `--input-ring` on focus), `aria-label` = `workspace.trash.searchLabel`, `type="search"`.
- **List** (`role="list"`; rows `role="listitem"`), gap 2px, no dividers. Row grid: `30px | minmax(0,1fr) | 56px | auto`, min-height 52px, radius 10, hover `--hover`:
  1. Icon tile 30px (`--surface-subtle`): the item's own icon if set, otherwise `FileText` (note) or `Folder` (folder).
  2. Title (13px/500, fallback `editor.titlePlaceholder`), plus a folder chip "Папка" when `type === 'folder'`; below it a muted 11.5px meta line: `{parentLabel} · {deletedLabel}`, where `deletedLabel` = "удалено {relative}" using `workspaceStore.getRelativeTime` (localized — do **not** use `toLocaleString()` as today).
  3. Days left, mono 11.5px, right-aligned: `normal` → `--text-muted`, `soon` → `--warning`, `last` → `--danger`; the text is always present (e.g. "5 дн."). Hidden when retention is `0`.
  4. Actions: `Восстановить` (secondary small button with a `RotateCcw` icon) and an icon-only danger ghost button (`Trash2`) with `aria-label` = `workspace.trash.deleteItem` ("Удалить «{title}» навсегда").
- **Keyboard:** roving tabindex over rows (only the focused row has `tabindex="0"`). ArrowUp/ArrowDown move focus, Home/End jump, Enter restores, Delete/Backspace opens the permanent-delete confirmation. The focused row shows `--surface-raised` + `--shadow-raised` + a 2px `--focus-ring`. Escape closes the modal (NvModal already does this). After restore or delete, focus moves to the next row (or the previous row if it was the last).
- **Footer:** left — info icon + `workspace.trash.actionHint` ("Окончательное удаление нельзя отменить."); right — ghost danger `Очистить архив…` (disabled when empty) and a secondary `Готово` that closes the modal (emit `close`; wire it in `WorkspaceShell.vue` to `trashModalOpen = false`).
- **States:** empty (`Inbox` icon, `emptyTitle`, `emptyState`, centered, no border); no search results (`SearchX`, `noResultsTitle`, `noResultsDescription`). Announce the result count politely (`aria-live="polite"` on the count).
- **Confirmations:** keep today's `useConfirmDialog` flows and texts (updated values in §5). Emptying lists the item count in the message (new key with `{count}`).
- **Entry points:** the sidebar system item and the mobile "More" entry use the `Archive` icon instead of the trash icon and read `workspace.system.trash` ("Архив"). Leave every other `Trash2` usage (delete buttons in Kanban, Draw, etc.) untouched.

### 4.4 Settings → Files

In `SettingsFilesPanel.vue` the retention control keeps its values (7 / 30 / 90 / "Не удалять" = `0`), shown as a segmented control. Only its label and description change (§5).

## 5. Locale changes (all five catalogs)

Edit `src/locales/{en,ru,fr,es,de}.json` **as text**. Never load and dump them through a JSON serializer: it reorders and reformats the files. Keep placeholders identical. Verify with `node .claude/skills/nevo-i18n-key/scripts/locale_diff.mjs` if present. Its current baseline reports 2 **pre-existing** plural-branch issues in `ru` (`workspace.sidebarSubtitle`, `workspace.home.meta`): do not "fix" them and do not add new ones. Also run `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts`.

### 5.1 Changed values

| Key | ru | en | fr | es | de |
| --- | --- | --- | --- | --- | --- |
| `workspace.system.trash` | Архив | Archive | Archives | Archivo | Archiv |
| `workspace.trash.title` | Архив | Archive | Archives | Archivo | Archiv |
| `workspace.trash.description` | Восстановите удалённые элементы или удалите их навсегда. | Restore deleted items or remove them permanently. | *(unchanged)* | *(unchanged)* | *(unchanged)* |
| `workspace.trash.countLabel` | Элементов в архиве: {count} | Items in archive: {count} | Éléments archivés : {count} | Elementos en el archivo: {count} | Elemente im Archiv: {count} |
| `workspace.trash.searchLabel` | Поиск в архиве | Search archive | Rechercher dans les archives | Buscar en el archivo | Archiv durchsuchen |
| `workspace.trash.emptyAction` | Очистить архив | Empty archive | Vider les archives | Vaciar archivo | Archiv leeren |
| `workspace.trash.emptyTitle` | Архив пуст | Archive is empty | Aucune archive | El archivo está vacío | Archiv ist leer |
| `workspace.trash.emptyConfirm` | Очистить архив? Все элементы будут удалены навсегда. | Empty the archive? All items will be permanently deleted. | Vider les archives ? Tous les éléments seront définitivement supprimés. | ¿Vaciar el archivo? Todos los elementos se eliminarán definitivamente. | Archiv leeren? Alle Elemente werden endgültig gelöscht. |
| `settings.hotkeys.commands.openTrash` | Открыть архив | Open archive | Ouvrir les archives | Abrir archivo | Archiv öffnen |
| `settings.files.trashRetention.title` | Хранение в архиве | Archive retention | Conservation des archives | Retención del archivo | Archiv-Aufbewahrung |
| `settings.files.trashRetention.description` | Сколько дней хранить удалённые элементы, прежде чем удалить их навсегда | How many days to keep deleted items before deleting them permanently | Combien de jours conserver les éléments supprimés avant de les supprimer définitivement | Cuántos días conservar los elementos eliminados antes de borrarlos definitivamente | Wie viele Tage gelöschte Elemente aufbewahrt werden, bevor sie endgültig gelöscht werden |

Also grep every catalog for any other user-visible value that says Корзина/корзин*, Trash/trash, Corbeille, Papelera, Papierkorb (including settings-search strings and system-view labels) and update it consistently. List each such key in your report.

### 5.2 New keys (add under `workspace.trash`)

| Key | ru | en | fr | es | de |
| --- | --- | --- | --- | --- | --- |
| `retentionDays` | Хранятся {days} дн., затем удаляются навсегда. | Kept for {days} days, then deleted permanently. | Conservés {days} jours, puis supprimés définitivement. | Se conservan {days} días y luego se eliminan definitivamente. | {days} Tage aufbewahrt, dann endgültig gelöscht. |
| `retentionForever` | Хранятся без ограничения. | Kept until you delete them. | Conservés jusqu’à suppression manuelle. | Se conservan hasta que los elimines. | Aufbewahrt, bis du sie löschst. |
| `daysLeft` | {days} дн. | {days} d | {days} j | {days} d | {days} T |
| `deletedRelative` | удалено {time} | deleted {time} | supprimé {time} | eliminado {time} | gelöscht {time} |
| `rootFolder` | Корень пространства | Workspace root | Racine de l’espace | Raíz del espacio | Arbeitsbereich-Stamm |
| `emptyConfirmCount` | Очистить архив? {count} элементов будут удалены навсегда. | Empty the archive? {count} items will be permanently deleted. | Vider les archives ? {count} éléments seront définitivement supprimés. | ¿Vaciar el archivo? {count} elementos se eliminarán definitivamente. | Archiv leeren? {count} Elemente werden endgültig gelöscht. |
| `done` | Готово | Done | Terminé | Listo | Fertig |

If an existing key already covers one of these (for example a generic "Done"), reuse it only when it is in the same semantic namespace (`src/locales/AGENTS.md`).

## 6. Part B — Settings

### 6.1 Current state

- Shell: `src/app/components/WorkspaceSettingsModal.vue` (459 lines; desktop two-column layout plus a separate phone list/detail flow). Styles: `src/styles/settings.css`, `src/styles/settings-panels.css`, `src/styles/mobile-settings.css` (already recolored to Borderless tokens in slice 5).
- Panels (`src/app/components/settings/`): General 128, Appearance 238, Editor 284, Workspace 370 (+ `workspace/*Group.vue`), AI 313, Plugins 537 (above threshold), MCP 178, Hotkeys 131, Files 156, Backup 195, Advanced 102, About 117 lines; plus `PluginSettingsForm.vue` and `GithubSyncActions.vue`.
- Rows today are ad-hoc markup: `.settings-row`, `.settings-row--border`, `.row-title`/`.row-sub`, `.settings-card` (card chrome already neutralized), panel headers `.panel-header`.

### 6.2 Target component contract (new, presentational, in `src/app/components/settings/ui/`)

| Component | Responsibility |
| --- | --- |
| `SettingsSectionHeader.vue` | Section title (18px/600, `id` for `aria-labelledby`), muted description, optional `actions` slot on the right. |
| `SettingsGroup.vue` | Optional mono uppercase label (10.5px, `.06em`, `--text-muted`) and a `default` slot of rows; 18–22px top spacing between groups; no card, no divider. |
| `SettingsRow.vue` | Grid `minmax(0,1fr) auto`, 11–12px vertical padding, **no border**. Props `title`, `description?`, `controlId?`, `disabled?`, `layout?: 'inline' \| 'stacked'` (stacked puts the control under the text on narrow widths and on phones). Slots `default` (control) and `description`. Wires the title as `<label :for="controlId">` when a control id is given, and `aria-describedby` to the description id. |
| `SettingsObjectCard.vue` | For independent objects only (plugins, backups, MCP clients, hotkey conflicts): `--surface-raised`, `--shadow-raised`, radius 12, transparent border, optional `tone="warning"` → `box-shadow: var(--shadow-raised), inset 3px 0 0 var(--warning)`. Slots `icon`, `default`, `meta`, `actions`. |

Migrate **every** panel to these components. Keep all existing `v-model`s, handlers, `id`s used by settings search/highlight (`settings-row--highlight` behavior must keep working), and test selectors, or update tests minimally. Remove the now-unused ad-hoc classes from the stylesheets. When a panel file would still exceed ~500 lines (Plugins), extract a child component (for example `PluginCard.vue`, `PluginFilters.vue`).

### 6.3 Per-panel requirements (reference `#settings`)

- **Shell:** nav on `--frame-bg` with a filled search field; items radius 8, hover `--hover`, active = `--surface-overlay` + `--shadow-raised` + weight 500 + accent icon, no rail; the content column scrolls independently. Keep the phone flow as it is (list screen on frame tone, section content on island tone, 44px rows, "Done" in the header).
- **General:** groups "Приложение" (language select, delete confirmation switch) and "Запуск" (startup view select, restore last context switch, startup document select, disabled unless the startup view needs it).
- **Appearance:** color scheme segmented (Системная/Светлая/Тёмная), accent swatches with the 2px ring selection, contrast segmented (Мягкий/Обычный/Высокий → existing `contrastMode`), density segmented, roundness range with a mono value, document font select, animation select. No surface/scene/transparency rows.
- **Editor:** live preview block on `--surface-subtle` (radius 12) at the top; groups for layout (width segmented, font size range with a mono value, colored headings switch) and behavior switches.
- **Plugins:** header actions "Пересканировать" (ghost) and "Каталог" (secondary); filter chips with counts (All / Enabled / Issues); each plugin is a `SettingsObjectCard`: 36px accent icon tile, name, "Встроенный" chip, mono version and author, description, capability chips, enable switch, and for issues the warning tone plus "Обновить"/"Удалить".
- **Hotkeys:** filled search plus a danger chip "Конфликтов: N"; mono column header (Команда / Область / Сочетание); rows with hover tone and no dividers; capture state = `--surface-raised` pill with a 2px accent ring and "Нажмите клавиши…"; conflicts = danger chip; fixed rows muted.
- **Files:** Paths row with "Показать" / "Открыть .nevo"; snapshot retention number field and "Очистить сейчас"; archive retention segmented (§4.4); diagnostics as 4 stat tiles on `--surface-subtle` with mono values.
- **About:** hero (44px glyph, name, tagline), mono key–value grid (version, engine, platform, workspace), action buttons, and an open-source note on `--surface-subtle`.
- **Workspace, AI, MCP, Backup, Advanced:** same components and rules; backups and MCP clients are object cards; everything else is rows.

## 7. Accessibility

- Visible `:focus-visible` everywhere (2px `--focus-ring`, 2px offset); keyboard reaches every control; no hover-only actions (Archive row actions stay visible, not revealed on hover).
- Icon-only buttons have `aria-label`s; decorative icons have `aria-hidden="true"`.
- Settings rows connect label/description to the control (§6.2). Segmented controls are `role="group"` with `aria-pressed` on buttons (or a radio group), matching the shared primitives.
- Forced-colors: islands, overlays and cards keep `border: 1px solid transparent`.
- Touch: 44px targets on phones.
- Contrast: body text ≥ 4.5:1, controls/focus ≥ 3:1 in both themes (use the tokens; `--text-disabled` only for disabled states).

## 8. Tests

Add or update, following existing patterns (Vitest + `@vue/test-utils`, real Pinia, stubs where siblings do):

- `src/utils/archive/retention.test.ts`: normal countdown; clamping at 0; `retentionDays = 0 → null`; tone thresholds (8 → normal, 7 → soon, 2 → soon, 1 → last, 0 → last, null → none); DST/timezone-safe day arithmetic (use fixed ISO dates).
- `src/app/composables/useArchiveItems.test.ts`: search filter (case-insensitive); sort by `deletedAt` descending; parent label resolution including the root fallback; `restore`, `deleteForever` and `emptyArchive` call the tree store only after confirmation (mock `useConfirmDialog`).
- `src/app/components/archive/WorkspaceArchive.test.ts`: renders rows with localized "deleted" text (via `getRelativeTime`) and days left; hides days left when retention is `0`; empty and no-results states; ArrowDown/Enter restores the focused item; Delete opens confirmation; "Очистить архив…" is disabled when empty; the `close` emit on "Готово".
- Update any test that references `WorkspaceTrashBin` or the old strings.
- Settings: `SettingsRow.test.ts` (label `for`/`aria-describedby` wiring, stacked layout class); keep `WorkspaceSettingsModal.mobile.test.ts`, `SettingsHotkeysPanel.test.ts`, `SettingsMcpPanel.test.ts`, `SettingsPluginsPanel.test.ts`, `src/app/search/settings.test.ts` passing (adjust selectors only when markup moved, never behavior).
- Locale tests (§5).

## 9. Verification (run all; report actual results)

- Focused Vitest on every new or touched test file.
- `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts` and the locale diff script.
- `pnpm test:run`. **Baseline:** exactly 9 pre-existing failures — 7 in `src/app/WorkspaceShell.test.ts`, 1 in `src/app/components/WorkspaceEditorPane.enter-regression.test.ts`, 1 in `src/app/components/WorkspaceEditorPane.test.ts` (scrollbar overlay). `src/features/onboarding/components/WorkspaceStorageOptions.test.ts` is occasionally flaky (re-run it standalone). Add no new failures.
- `pnpm exec eslint src` → 0 errors (pre-existing warnings allowed; do not add new ones in touched files). The full `pnpm lint` also scans local tooling folders (`.claude/`, `.crush/`) and fails there for unrelated reasons.
- `pnpm build` (vue-tsc + Vite, bundle budgets must pass).
- `git diff --check`.
- Visual check: the app UI only renders in Tauri (`pnpm tauri dev`). If you cannot run it, say so explicitly. Do not claim visual verification you did not do.

## 10. Deliverables

1. Code per §4 and §6, locales per §5, tests per §8.
2. `changes.md` (git-ignored, but maintained): under `## 🆕 Added` → `### Borderless interface`, add entries for "Archive window" and "Settings component contract"; under `## 🔄 Updated / Improved`, add the Trash → Archive rename. Past tense, English, `* **Detail**: Description`.
3. `docs/superpowers/plans/2026-09-23-borderless-ui-progress.md`: add a "Settings and Archive" section with what was done and what is left.
4. `graphify update .` if the `graphify` CLI is available (skip and say so if not).
5. Final report in Russian: files created/changed/deleted with one line each, locale keys changed/added, checks run with results, known gaps, and the §3.2 terminology decision the owner still needs to make.

## 11. Out of scope / later

- Renaming "архив" in workspace export/import and in the workspace status (§3.2).
- Restoring items to a different folder, multi-select, or bulk restore.
- Search-overlay key hints and match highlighting (separate follow-up in the handoff file).
