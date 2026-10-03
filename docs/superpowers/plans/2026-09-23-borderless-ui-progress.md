# Borderless UI Redesign — Implementation Progress and Handoff

**Spec:** `docs/superpowers/specs/2026-09-22-solid-ui-redesign-design.md` (Borderless, frame + island)
**Visual reference:** `docs/design/nevo-reference.html` — the effective look is each base rule plus the `html[data-surface="borderless"] ...` override block in its `<style>`.
**Purpose of this file:** let any agent continue the work without the original session. Update the status table when a slice is finished.

## Ground rules for whoever continues

- The working tree contains a large amount of **user-owned uncommitted work**. Never `git checkout`, `git stash`, `git reset`, or revert files. Edit on top of the current contents.
- Presentation only: do not change props/emits/slots, routing, stores, persisted data, or keyboard behavior unless a slice below says so.
- Use semantic tokens only (`--surface-canvas/navigation/panel/subtle/raised/overlay/selected`, `--text-primary/secondary/muted/disabled/on-accent`, `--border-subtle/default/strong`, `--surface-danger/success/warning`, `--danger/--success/--warning`, `--shadow-raised/overlay`, `--scrim`, `--focus-ring`) and component tokens from `src/styles/surfaces.css` (`--frame-bg`, `--island-bg`, `--island-radius`, `--island-inset`, `--menu-bg`, `--menu-shadow`, `--modal-bg`, `--modal-shadow`, `--input-bg`, `--input-ring`). No hard-coded colors.
- Borderless rules: no 1px dividers between regions/rows/sections; separation by spacing, mono uppercase section labels (10.5px, letter-spacing .06em, `--text-muted`) and hover tone. Keep contours only for checkbox/radio, focus ring, drop targets, canvas frames, diff stripes, in-document data grids. Removed borders on islands/overlays/cards become `border: 1px solid transparent` (forced-colors). Selected item = island tone + `--shadow-raised` + weight 500 + accent icon, no rail marker. Cards only for independent objects (draggable, own actions).
- No `backdrop-filter` anywhere (`src/styles/no-backdrop-filter.test.ts` enforces it), no glows, no gradients on chrome, no `inset 0 1px 0` highlights, no `transition: all`.

## Verification baseline

`pnpm test:run` has **9 pre-existing failures** unrelated to the redesign: 7 in `src/app/WorkspaceShell.test.ts`, 1 in `src/app/components/WorkspaceEditorPane.enter-regression.test.ts`, 1 in `src/app/components/WorkspaceEditorPane.test.ts` (scrollbar overlay). `src/features/onboarding/components/WorkspaceStorageOptions.test.ts` is occasionally flaky in the full run (passes standalone). A slice must not add failures. Per slice also run: focused vitest on touched files, `pnpm exec eslint <changed ts/vue>`, `pnpm build`, `git diff --check`.

The main workspace UI only renders inside Tauri (`pnpm tauri dev`); a plain browser (`pnpm dev`, port 1420) shows onboarding only. Headless screenshot: `google-chrome-stable --headless=new --disable-gpu --window-size=1440,900 --virtual-time-budget=8000 --screenshot=out.png http://localhost:1420/`.

## Status

| Slice | Scope | Status |
| --- | --- | --- |
| 1 | Settings defaults (`solid`, `mineral`) in TS + Rust; surfaceStyle/backgroundScene/sidebarStyle/reduceTransparency kept but ignored and removed from UI, search and locales | Done, verified |
| 2 | Semantic tokens + legacy aliases (`src/styles/tokens.css`), theme-aware accent presets (`oklch(var(--accent-l) C H)`), all `backdrop-filter` removed, `base.css` scenes removed, `src/styles/surfaces.css` | Done, verified |
| 3 | Shared primitives: buttons, inputs, checkbox/toggle/range, menus, NvModal, toast, pickers; `src/ui/glass/AmbientBackdrop.vue` deleted | Done, verified |
| 4 | Shell frame + island, titlebar tabs/search, sidebar/tree, right panel, Home, search overlay, drawer, bottom nav | Done, verified (tests/build); **visual QA in Tauri pending** |
| 5 | Onboarding + settings panels | Done, verified (tests/build, onboarding screenshots light+dark, 1440 and 390); settings **visual QA in Tauri pending** |
| 6 | Editor chrome, overlays, databases, query blocks | Done, verified (tests/build); **visual QA in Tauri pending** |
| 7 | Graph, Canvas, Draw, Kanban, History (+ make their views islands) | Done, verified (tests/build); **visual QA in Tauri pending** |
| 8 | Import/export previews, templates, trash, update, AI, password, remaining utility dialogs | Done, verified (tests/build); PDF/DOCX previews: frame-tone settings column + subtle desk + raised page |
| 9 | Mobile views (`src/app/components/mobile/**`, rest of `src/styles/app/mobile-workspace.css`) and responsive polish | Done, verified (tests/build); **visual QA on a phone/Tauri pending** |
| 10 | Legacy token consumers migrated (1288 replacements in 115 files), aliases kept only as a custom.css compatibility layer and guarded by a style-contract test; contrast modes rewritten on semantic tokens; docs + `changes.md` | Done except the **manual a11y/visual audit in Tauri** |

## Slice 5 — notes

- Welcome view is now the asymmetric split; with no recent workspaces it collapses to one centered column (`.welcome-root--solo`). The Recent list opens a workspace directly via `src/features/onboarding/composables/useOpenRecentWorkspace.ts` (new behavior, covered in `WelcomeView.test.ts`).
- `OnboardingView.vue` no longer forces `theme-dark`; onboarding follows the app theme like every other screen.
- Component tokens in `surfaces.css` and the `--hover/--hover-strong/--press` state layers are declared on `:root, .theme-light, .theme-dark`, because a var()-based custom property resolves on the element that declares it (a nested theme scope would otherwise inherit the root theme's colors).
- Settings: `.settings-card` no longer draws card chrome; rows/groups are separated by spacing; card treatment kept for plugins (`.plugin-card`), path buttons, and sidebar-mode choices. Hotkeys table is a flat list with hover rows. Dead `.scene-preview` styles removed.

## Slice 6 — notes

- Editor overlays (`src/styles/editor/*.css`: slash/table menus, link picker/popover, find bar, popups, floating toolbar, color picker, block-type menu, note-embed picker, cover panel) use `--menu-bg` with transparent borders; in-menu dividers removed; inputs are filled with a 2px `--input-ring` focus.
- Document objects (`src/styles/editor-prose/*.css`: block/note embeds, media, file, math/mermaid/vega/markmap, query, database blocks) use `--surface-panel` fills with transparent borders and no header dividers; hover `--surface-subtle`. Data grids keep hairlines: prose tables, database table cells/add-row, database list rows, CSV preview. Database cards are raised objects. Code blocks use `color-mix(in oklab, var(--island-bg) 94%, var(--text-primary))` in both themes.
- Not touched: `MobileEditorTabBar.vue`, `MobileEditorHeadingMenu.vue` (slice 9); the decorative accent gradient of `hr[data-nevo-divider]` (document content, not chrome).
- Line-safe edit helper used for these slices: a small Python function that replaces a line only if it contains an expected substring (avoids clobbering user edits).

## Slice 7 — notes

- `.graph-view`, `.kb-view`, `.draw-view`, `.history-view`, `.sandbox-plugin-view` are islands via one rule in `src/styles/app/workspace-shell.css` (radius 0 on phone).
- Graph: washes removed, dot grid kept; floating panels/tooltips use `--menu-bg`; `GraphCanvas.vue` draws a halo only for the focused/active node (no ambient glow).
- Kanban: columns are frame-tone zones without borders/header dividers; cards are raised; drag/drop placeholders keep dashed contours; table view keeps its grid lines; hard-coded danger hues in CSS replaced with `var(--danger)` (JS status colors in `KanbanAutomations.vue`, `KanbanGroupView.vue`, `KanbanTableView.vue` still hard-coded — candidates for slice 10).
- Draw: floating toolbars/panels are opaque `--menu-bg` with `--shadow-overlay`/`--shadow-raised` instead of translucent fills and black rgba shadows.
- Canvas: background is the island tone; canvas cards are `--surface-raised` with transparent borders.
- History: dividers removed, added/removed rows use `--surface-success`/`--surface-danger`; the timeline connector line and version dots keep their contours.

## Slice 10 — notes

- Codemod map (applied to `src/**/*.{css,vue,ts}` except `tokens.css`/`base.css`): `text-1/2/3/4 → text-primary/secondary/muted/muted`, `line-1/2/3/strong → border-subtle/default/strong/strong`, `glass-1/2/3/titlebar → surface-panel/raised/overlay/navigation`, `canvas-0/1 → surface-navigation/canvas`, `surface-0/1/2 → surface-panel/raised/overlay`, `shadow-1/2/pop → shadow-raised/raised/overlay`, `bg-1/2/3 → surface-navigation/canvas/hover-strong`, `border-2/border-muted → border-default`, `accent/danger/success-glow → *-soft`, `workspace-divider → border-subtle`.
- `applyWorkspaceStyle` and `WorkspaceShell` no longer write `--accent-glow` inline.
- `[data-contrast]` blocks in `base.css` now adjust `--border-*`, `--text-secondary`, `--text-muted`.
- Remaining manual work: visual/a11y pass in Tauri (light/dark, 1440/960/390, keyboard focus, forced colors), hard-coded status colors in Kanban JS (`KanbanAutomations.vue`, `KanbanGroupView.vue`, `KanbanTableView.vue`).

## Settings and Archive (Completed 2026-09-23)

- **Archive Window (Part A)**:
  - Pure day arithmetic and tone calculation in `src/utils/archive/retention.ts` (`retention.test.ts`).
  - Search filtering, descending sort by deletion date, parent path resolution, confirm flows in `src/app/composables/useArchiveItems.ts` (`useArchiveItems.test.ts`).
  - Reference `#trash` layout in `src/styles/app/archive.css` (deleted obsolete `trash-modal.css`).
  - Split into focused sub-500-line units: `WorkspaceArchive.vue` (modal shell, roving tabindex, search, empty states) + `ArchiveItemRow.vue` (presentational item row).
  - Deleted legacy `WorkspaceTrashBin.vue`.
  - Updated sidebar and mobile entry points to Lucide `Archive` icon and `workspace.system.trash`.
- **Settings Component Contract (Part B)**:
  - Standard presentational primitives created in `src/app/components/settings/ui/`: `SettingsSectionHeader.vue`, `SettingsGroup.vue`, `SettingsRow.vue`, `SettingsObjectCard.vue` (`SettingsRow.test.ts`).
  - Migrated all 12 settings panels: General, Appearance, Editor, Workspace (and 4 child groups), AI, Plugins (extracted `PluginCard.vue` and `PluginCatalogCard.vue`), MCP, Hotkeys, Files, Backup, Advanced, About.
  - All files strictly sub-500 lines (longest panel: `SettingsPluginsPanel.vue` at 367 lines).
  - Search highlight compatibility (`.settings-row`, `.row-title`) preserved; accessible label `for` / `aria-describedby` wired.
  - Files panel archive retention rendered as segmented control (7, 30, 90, 0).
- **Locales**: Updated `en, ru, fr, es, de` with Archive terminology and retention countdown keys.
- **Verification**: 70/70 focused tests passing, full test suite matches pre-existing baseline (9 pre-existing failures, 0 new), `vue-tsc` 0 errors, `pnpm build` bundle budgets passed, `git diff --check` clean.
- **What is left**: Visual inspection in live Tauri application (`pnpm tauri dev`) and product owner decision on §3.2 terminology collision (workspace export zip vs note archive).

## Settings and Archive Screens as Routes (Completed 2026-09-24)

- **Routing & System Navigation**:
  - Registered `/workspace/settings/:section?` and `/workspace/archive` in `src/router/index.ts`.
  - Created pure route helpers in `src/app/routing/systemRoutes.ts` and composable `src/app/composables/useSystemViews.ts`.
  - `WorkspaceShell.vue` integrated: modal states removed, line count reduced from 1441 to 1417 lines.
  - Skip `updateLastContext` when on system routes; flush dirty note saves on navigation to settings.
- **Settings Screen Units (`src/app/components/settings/`)**:
  - Decomposed into `SettingsNavColumn.vue`, `SettingsSearchResults.vue`, `MobileSettingsHome.vue`, and `WorkspaceSettingsView.vue`.
  - Replaced `WorkspaceSettingsModal.vue`; verified desktop two-column layout and mobile list/detail drill-down flow.
- **Archive Screen Units (`src/app/components/archive/`)**:
  - Decomposed into `ArchiveListItem.vue`, `ArchiveListColumn.vue`, `ArchiveItemDetail.vue`, and `WorkspaceArchiveView.vue`.
  - Pure date grouping in `src/utils/archive/grouping.ts`; async preview loader in `src/app/composables/useArchivePreview.ts`.
  - Replaced `WorkspaceArchive.vue`; updated `src/styles/app/archive.css` for borderless island layout.
- **Verification**: All unit and integration tests passing, 0 ESLint warnings, `vue-tsc` 0 errors, Vite bundle budgets passed.

## Open follow-ups noted during slices

- Right panel "Document / Links / Graph" tabs: done (2026-09-23, after user review). Search overlay still has no footer key hints and no match highlighting — decide separately.
- `WorkspaceRightPanel.vue` is ~477 lines; extract the tab bar or a section component before adding more to it.
- `NvRangeInput` track/thumb still rely on `accent-color` (full custom slider styling judged risky on WebKitGTK).
- `NvToastHost` status icons are no longer colored (inverse surface); add inverse-safe status tokens if color is wanted.
- Pre-existing bug, not part of the redesign: Rust settings normalization (`src-tauri/src/commands/workspace/settings.rs`) only accepts preset names for `accentPreset`, so a custom accent color picked in the UI resets to `mineral` after reload.
- `changes.md` (git-ignored) has only the reference/spec entry; add implementation entries in slice 10 after verification.
