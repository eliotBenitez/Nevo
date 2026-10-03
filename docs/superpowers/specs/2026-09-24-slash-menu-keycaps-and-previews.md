# Slash Menu: Keycap Tiles and Block Previews — Implementation Spec

**Status:** Ready for implementation
**Date:** 2026-09-24
**Intended executor:** Codex (reads `AGENTS.md`; use `.codex/skills/nevo-verify-change` and `.codex/skills/nevo-visual-qa`)
**Visual reference:** `docs/design/nevo-reference.html`, section `#slash-tiles` — variant **A · Клавиши** (CSS `.st-a …`) and variant **B · Превью блока** (CSS `.st-b …`, `.pv …`). Open it in a browser, switch light/dark and the accent, click a menu and use the arrow keys. Variants C and D are **not** part of this task.

## 0. Read first

1. `AGENTS.md` (root) and `src/editor-core/AGENTS.md`, `src/locales/AGENTS.md`, `src/ui/AGENTS.md`. Binding. The final report to the user is in Russian; code, identifiers, commit-free `changes.md` entries are in English.
2. The working tree has a lot of **user-owned uncommitted work**, including the files below. Never `git checkout`, `git stash`, `git reset` or revert anything. Edit on top of the current contents. Do not commit.
3. Styling rules: semantic tokens only (`--surface-*`, `--text-*`, `--menu-bg`, `--accent`, `--accent-soft`, `--text-on-accent`, `--warning`, `--focus-ring`, `--shadow-*`), no hard-coded colors, no legacy token names, no `backdrop-filter` (`src/styles/no-backdrop-filter.test.ts`). Removed borders stay `1px solid transparent` (forced-colors).
4. Locale JSON files are edited **as text** — never load and re-dump them through a JSON serializer.

## 1. Goal

The slash menu currently has two views, chosen in Settings → Editor → «Вид slash-меню»: `list` and `grid` (tiles). The current tiles are rejected by the owner. This task:

- **A — Keycaps.** Replaces the look of the `grid` view with reference variant A: square keycap tiles, 4 columns.
- **B — Block previews.** Adds a third view, `preview`, from reference variant B: each item shows a miniature of the block it inserts, 3 columns.

Resulting setting: **Список / Плитки / Превью** (`list` / `grid` / `preview`). Stored `grid` keeps working and now renders as keycaps. No migration.

## 2. Current implementation (verify — it is recent and uncommitted)

| File | Role today |
| --- | --- |
| `src/types/workspace.ts` | `SlashMenuLayout = 'list' \| 'grid'`; `EditorSettings.slashMenuLayout` |
| `src/utils/workspace-settings/defaults.ts`, `normalizers.ts` | default `'list'`; anything but `'grid'` → `'list'` |
| `src-tauri/src/commands/workspace/types.rs` (`EditorSettings.slash_menu_layout`, `default_slash_menu_layout`) and `settings.rs` (`normalize_settings_value`, test `normalizes_slash_menu_layout`) | Rust persistence; filter `"list" \| "grid"` |
| `src/utils/slashMenuLayout.ts` | `SLASH_GRID_COLUMNS = 3`, `slashGridColumns(layout)` → `3` for grid, `0` for list |
| `src/editor-core/slash-navigation.ts` | pure `resolveSlashGridMove(categories, index, key, columns)` — grid arrow-key math, per-category grids |
| `src/editor-core/slash.ts` | `createSlashCommandPlugin(getItems, { getGridColumns })`; arrow keys use grid math when columns > 0 |
| `src/app/composables/editor/useEditorCore.ts` | passes `getSlashGridColumns: () => slashGridColumns(workspaceStore.settings?.editor?.slashMenuLayout)` (live, no editor rebuild) |
| `src/app/composables/editor/useSlashMenuGroups.ts` | groups items by category in the plugin's flat order; entries carry `index`, `title`, `meta`, Lucide `icon` |
| `src/app/components/editor/EditorSlashMenu.vue` | shell (header, emoji picker) choosing `SlashMenuTiles` or `SlashMenuList` by `layout` prop |
| `src/app/components/editor/SlashMenuTiles.vue` / `SlashMenuList.vue` | the two views |
| `src/app/components/editor/EditorOverlayContainer.vue`, `EditorSurface.vue`, `src/app/components/WorkspaceEditorPane.vue` | pass `slashMenuLayout` down |
| `src/styles/editor/editor-menus.css` | `.slash-menu*` styles incl. `.slash-menu--tiles`, `.slash-menu__tiles`, `.slash-menu__tile*` |
| `src/app/components/settings/SettingsEditorPanel.vue`, `src/app/search/settings.ts` | segmented control and search entry |
| `src/app/composables/editor/useEditorOverlays.ts` (`syncSlashActiveItemVisibility`) | scrolls `.slash-menu__item.is-active` into view — **keep that class pair on every tile** |
| Tests | `src/editor-core/__tests__/slash-navigation.test.ts`, `slash.test.ts` (grid navigation block), `src/app/components/editor/EditorSlashMenu.test.ts`, `src/utils/workspace-settings.test.ts` |

## 3. Constraints

- Keep `list` exactly as it is.
- Setting key and stored values stay: `editor.slashMenuLayout`; add `'preview'`; `'grid'` is **not** renamed.
- The plugin API stays `getGridColumns: () => number`. Only the column count per layout changes.
- The item order, categories, filtering, Enter/Escape and emoji-picker behavior do not change.
- No new runtime dependencies. No changes to note content or serialization — previews are pure UI.
- Each file stays well under 500 lines; new CSS goes into a new file (§5.4), `editor-menus.css` must not grow.

## 4. Settings and navigation

1. `SlashMenuLayout = 'list' | 'grid' | 'preview'`. TS normalizer accepts `'grid'` and `'preview'`, else `'list'`. Rust: filter `"list" | "grid" | "preview"`, extend `normalizes_slash_menu_layout` with a `preview` case.
2. `src/utils/slashMenuLayout.ts`: replace the single constant with a per-layout table, e.g. `SLASH_LAYOUT_COLUMNS = { list: 0, grid: 4, preview: 3 } as const` and `slashGridColumns(layout)` reading it (unknown → `0`). The component CSS grid gets its column count from the same table (via a `--slash-grid-columns` inline style), so rendering and arrow keys can never disagree.
3. Settings panel: the segmented control gets three options (`list`, `grid`, `preview`), still disabled when slash commands are off. Settings search shows the current value for all three.
4. Locales — all five catalogs:

| Key | ru | en | fr | es | de |
| --- | --- | --- | --- | --- | --- |
| `settings.options.slashMenuLayout.preview` (new) | Превью | Previews | Aperçus | Vistas previas | Vorschauen |
| `settings.editor.slashMenuLayout.description` (changed value) | Список с описаниями, плитки-клавиши или миниатюры блоков | A detailed list, keycap tiles, or block previews | Liste détaillée, tuiles ou aperçus des blocs | Lista detallada, mosaicos o vistas previas de bloques | Detaillierte Liste, Kacheln oder Blockvorschauen |

`settings.options.slashMenuLayout.list` / `.grid` keep their values («Список» / «Плитки»).

## 5. Rendering

### 5.1 Units

| File | Responsibility |
| --- | --- |
| `src/app/components/editor/SlashMenuTiles.vue` (rewrite) | Keycap grid (variant A). One grid per category. |
| `src/app/components/editor/SlashMenuPreviews.vue` (new) | Preview grid (variant B). One grid per category; each entry renders `SlashBlockPreview` + title. |
| `src/app/components/editor/SlashBlockPreview.vue` (new) | Presentational miniature for one preview kind; falls back to the entry's Lucide icon. `aria-hidden="true"` — the title is the accessible name. |
| `src/utils/slashBlockPreview.ts` (new, framework-agnostic) | `type SlashPreviewKind`, `slashPreviewKind(itemId: string): SlashPreviewKind \| null` — the id → kind table (§5.3). |
| `src/app/components/editor/EditorSlashMenu.vue` | Chooses List / Tiles / Previews by `layout`; adds `slash-menu--tiles` or `slash-menu--previews` on the root. |
| `src/styles/editor/slash-menu-tiles.css` (new) | All keycap and preview styles; import it where `editor-menus.css` is imported (`src/styles/editor.css`). Move the existing `.slash-menu--tiles` / `.slash-menu__tile*` rules out of `editor-menus.css` into it and rewrite them. |

Every tile (both views) is a `<button type="button" class="slash-menu__item slash-menu__tile …">` with `:class="{ 'is-active': entry.index === activeIndex }"`, `@mousedown` → `itemMousedown`, `@click` → `select`, and `:title="entry.meta"`. Keep `useSlashMenuGroups` as the single source of groups/indices; do not duplicate grouping.

### 5.2 Keycaps (`grid`, reference `.st-a`)

- Menu width `420px` (`max-width: min(420px, calc(100vw - 24px))`), grid gap 6px, category label as today.
- Tile: `aspect-ratio: 1`, column flex, centered, gap 8px, radius 12px (`calc(12px * var(--radius-scale, 1))`), background `--surface-raised`, a 1px hairline `color-mix(in oklab, var(--text-primary) 7%, transparent)` and a soft two-layer key shadow (`0 1px 0 …8%`, `0 1px 3px …6%` of `--text-primary`). Borderless mode keeps the border transparent (see reference `html[data-surface="borderless"] .st-a .st-t`).
- Icon: Lucide at 22px, stroke 1.6, `--text-secondary`. No icon square.
- Title: 11.5px/500, centered, clamp to 2 lines.
- Hover: background tinted `color-mix(in oklab, var(--accent) 5%, var(--surface-raised))`.
- Active (keyboard or hover-selected): lifted `translateY(-2px)`, transparent border, `box-shadow: 0 0 0 2px var(--accent), 0 6px 14px -6px color-mix(in oklab, var(--accent) 45%, transparent)`, icon in `--accent`. The lift must not be clipped: give the grid 2px top padding.
- `prefers-reduced-motion: reduce` → no transform and no transition.
- Labels that do not fit (e.g. «Маркированный список») wrap to two lines and then ellipsize — do not change item titles.

### 5.3 Previews (`preview`, reference `.st-b` / `.pv`)

- Menu width `420px`, 3 columns, gap 6px.
- Entry: column flex, gap 7px, padding 6px, radius 12px; hover `--surface-subtle`; active `--accent-soft` background and the preview's inset ring becomes `1.5px var(--accent)`.
- Preview box: height 58px, radius 8px, background `--surface-raised`, inset 1px hairline (`--text-primary` 8%), padding 9px 10px, `overflow: hidden`, ink color `color-mix(in oklab, var(--text-primary) 22%, transparent)`.
- Title under the box: 12px/500, single line, ellipsis.
- Kinds (build them from spans/pseudo-elements and small inline SVG — no images, no canvas; reuse the reference's `.pv` markup/CSS as the starting point):

| Item ids | Kind | Miniature |
| --- | --- | --- |
| `paragraph` | `text` | two full lines + one short |
| `h1`, `h2`, `h3`, `h4`, `h5`, `h6` | `heading-1…6` | dark bar (`--text-primary`, ~82% opacity) whose height/width shrink with the level (9/78%, 7/64%, 5/52%, 4/46%, 3.5/40%, 3/36%) + text lines |
| `quote` | `quote` | two lines with a 2.5px accent bar on the left |
| `callout` | `callout` | tinted box (`--warning` 16%) with a dot and a line |
| `toggle` | `toggle` | small ▸ triangle + line, then two indented lines |
| `ul`, `ol`, `checklist` | `bullets`, `numbers`, `checks` | three rows: dot / mono 1-2-3 / box (first box filled with accent) + line |
| `code` | `code` | dark block (`--text-primary` 86% over raised) with mono `</>` in the raised color |
| `math`, `math-inline` | `math`, `math-inline` | serif/mono formula glyph `∑ x²` centered; inline variant = a text line with a small highlighted formula chip in the middle |
| `table` | `table` | 3×2 grid, header row slightly darker |
| `database` | `database` | table like above with a header row of three small pill chips |
| `query` | `query` | a filter/funnel mark in accent + two result lines |
| `image` | `image` | mountain + sun outline SVG in accent (fill = accent 30%) |
| `divider` | `divider` | line, a centered 1px rule, line |
| `embed` | `embed` | a small card with a URL bar and two lines |
| `note-embed` | `note-embed` | a note card with an accent edge, page glyph, and text lines |
| `audio` | `audio` | play button and waveform |
| `video` | `video` | video frame with a play button |
| `file` | `file` | document sheet with a folded corner and text lines |
| `chart` | `chart` | four vertical bars of different heights |
| `mermaid` | `mermaid` | connected flowchart nodes |
| `markmap` | `markmap` | branching mind map nodes |
| `insert-template` | `template` | page layout with a header and two content blocks |
| `emoji` | `emoji` | a large emoji glyph (e.g. 🙂) centered |
| `draw` | `draw` | a hand-drawn squiggle SVG stroke in accent |
| anything else (AI items, plugin items) | `null` | fallback: the entry's Lucide icon (22px, `--text-secondary`) centered in the preview box |

The corresponding core commands use distinct Lucide icons in the keycap view.

Both themes must read clearly: check the code block, table header and callout in dark, where `--surface-raised` is dark.

### 5.4 Shared

- The emoji tile still opens the emoji picker (existing `selectItem` logic in `EditorSlashMenu.vue`).
- Phone (`max-width: 719px`, bottom sheet): keep the column counts; tiles keep `min-height: 44px` touch targets (keycaps are larger anyway).
- Forced colors: `.slash-menu__tile.is-active { outline: 2px solid Highlight; }`.
- The overlay positioning already clamps by the real rect — do not hard-code offsets for the wider menu.

## 6. Tests

- `src/utils/slashMenuLayout.test.ts` (new): columns per layout, unknown → 0.
- `src/utils/slashBlockPreview.test.ts` (new): every core id listed in §5.3 maps to its kind; unknown/AI/plugin ids → `null`.
- `src/utils/workspace-settings.test.ts`: `preview` preserved; invalid → `list`.
- Rust `normalizes_slash_menu_layout`: add `preview`.
- `src/editor-core/__tests__/slash.test.ts` grid block: add a case with 4 columns (keycaps) — Down from index 0 lands on 4 when the category has ≥ 5 items. `slash-navigation.test.ts` needs no change unless you touch the function.
- `src/app/components/editor/EditorSlashMenu.test.ts`: keep list assertions; `grid` renders keycaps (`.slash-menu--tiles`, one `.slash-menu__tiles` grid per category, active tile by flat index, no `.slash-menu__id`); `preview` renders `.slash-menu--previews`, a preview element per entry, the fallback icon for an unknown id, and emoji still emits `openEmojiPicker`.
- A settings-panel test that the segmented control has three options and writes `preview` (follow the existing settings panel tests' mounting pattern).

## 7. Verification

- Before editing, run `pnpm test:run` once and note baseline failures. Known pre-existing: `src/app/components/WorkspaceEditorPane.test.ts > scrollbar overlay > shows the overlay on scroll and updates the thumb metrics`. Add no new failures.
- Focused Vitest on all touched test files, plus `src/editor-core/__tests__/regression.test.ts`.
- `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts`.
- `pnpm exec eslint` on changed TS/Vue files — 0 errors, no new warnings.
- `pnpm build` (vue-tsc + bundle budgets).
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `cargo test --manifest-path src-tauri/Cargo.toml --lib workspace::settings`.
- `git diff --check`.
- Visual: follow `.codex/skills/nevo-visual-qa`. At minimum compare keycaps and previews against `#slash-tiles` A and B in light and dark, with a non-default accent, in `pnpm tauri dev` (or state explicitly that you could not run the app — do not claim visual verification you did not do). Check: active keycap lift not clipped at the top of the scroll area, long titles clamp, arrow keys match the visual columns in both views, switching the setting while the menu is closed applies on next open without reloading the note.

## 8. Deliverables

1. Code per §4–§5, tests per §6.
2. `changes.md`: one entry under `## 🔄 Updated / Improved` ("Slash menu keycaps and block previews"), past tense, English, `* **Detail**: Description` — only after verification passes.
3. `graphify update .` if the CLI is available.
4. Final report in Russian: files created/changed/removed (one line each), locale keys, checks run with results, baseline failures, anything from §5.3 you simplified.

## 9. Out of scope

- Variants C and D from the reference.
- Plugin-provided previews (a future `NevoSlashItem.preview` hook).
- The pre-existing Rust defect where `focusMode`, `typewriterScrolling`, `activeBlockEmphasis`, `pasteBehavior`, `slashMenuHints`, `editorStatsVisibility`, `typewriterPosition` are dropped by `normalize_settings_value` on save. Do not fix it here; mention it only if a test you touch trips over it.
