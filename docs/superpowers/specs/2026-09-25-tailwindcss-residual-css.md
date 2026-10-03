# Residual CSS Inventory (Post-Tailwind-Migration)

**Date:** 2026-09-26
**Scope:** every `src/**/*.css` file (53 files, ~7.5k lines) and every Vue `<style>` block
with more than 5 non-blank lines (27 files, ~545 lines), as they stand after the dead-selector
cleanup in `2026-09-25-tailwindcss-editor.md` Task 3.

Method: read each file's own header comment (the migration consistently left one explaining
what moved to `tw:` and why the remainder stayed), then spot-checked selectors against their
Vue/TS producers. "Consumer" names the owning component/module; category is the retained
reason.

## Category legend

| Code | Meaning |
| --- | --- |
| TOK | Semantic token (custom properties, theme/contrast/density variables) |
| PLAT | Document/platform rule (propagates a global `data-*`/`:root` setting app-wide) |
| HOOK | Shared compatibility hook, layered in `@layer components` |
| GEN | Generated DOM: ProseMirror node view or plugin-authored content |
| 3RD | Third-party-generated classes (hljs/lowlight, prosemirror-tables, markmap, katex) |
| NATIVE | Native control styling (`::-webkit-*`, native inputs, scrollbars) |
| PSEUDO | Pseudo-element tree (`::before`/`::after` content, `::view-transition-*`) |
| PRINT | Print/export rendering path |
| ANIM | Keyframes / enter-leave transition classes |
| JSGEO | Runtime state/geometry driven by a composable, not expressible statically |
| RESP | Responsive breakpoint block not worth inlining per-utility |
| XCOMP | Cross-component override (`:deep()`, modal panel-class slot override) |
| OTHER | Other, reason given inline |

## Foundation and cascade (`src/styles/*.css`, always loaded)

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `tokens.css` | 305 | app-wide `:root`/theme scopes | TOK |
| `tailwind.css` | 44 | Tailwind layer order + `@theme inline` bridge of tokens into `tw:` scales | TOK / OTHER (build config) |
| `base.css` | 150 | `html/body/#app` reset, density/motion/scrollbar/zoom/roundness/contrast `data-*` propagation, base-layer focus ring | PLAT (+ TOK for contrast overrides) |
| `primitives.css` | 123 | `.nv-btn*`, `.nv-chip`, `.nv-kbd` (many plain-template consumers) + `NvPopupMenu` enter/leave | HOOK (+ ANIM for the menu transition, unlayered by design) |
| `surfaces.css` | 60 | `.theme-light/dark`, `.nv-frame`, `.nv-island`, `.nv-raised`, `.nv-overlay`, `.nv-sidebar` | TOK |
| `nv-modal.css` | 31 | `NvModal.vue` safe-area padding | PLAT |
| `app.css` | 10 | `@import` aggregator for `app/*.css` | OTHER (import manifest, no rules) |

### Shared hooks currently layered in `@layer components`

| Hook | Declared in | Consumers |
| --- | --- | --- |
| `.nv-btn`, `.nv-btn--ghost/primary/danger/xs/md/icon/active/loading`, `.nv-btn__spinner` | `primitives.css` | Every plain-template button across app/settings/onboarding/plugins that hasn't (yet) moved to `tw:` |
| `.nv-chip` | `primitives.css` | Tag/status chip consumers |
| `.nv-kbd` | `primitives.css` | Hotkey display (settings, menus) |
| `.search-field`, `.search-input` | `settings-panels.css` | Settings, onboarding, archive, graph, kanban and mobile-library search bars |
| `.ui-input`, `.hotkey-input` | `settings-panels.css` | Settings rows, plugin forms, hotkey capture field |

All five are inside `@layer components` specifically so a consumer's own `tw:` utility (in
`@layer utilities`) still wins per `tailwind-cascade.test.ts`.

### Base-layer focus rings

`base.css` `@layer base`: `:where(button, a, input, select, textarea, [tabindex]):focus-visible`
(zero-specificity safety net for controls that don't define their own ring) and
`[data-focus-ring="high-contrast"] *:focus-visible`. Layered under `base` so a component's own
`tw:focus-visible:*` utility, or its own unlayered `:focus-visible` rule, overrides it.

## App shell and workspace chrome (`src/styles/app/*.css`)

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `workspace-shell.css` | 171 | `WorkspaceShell.vue` | XCOMP (state overrides shared with sidebar/tabs; unlayered so they beat `tw:`) |
| `workspace-sidebar.css` | 151 | `WorkspaceSidebar.vue` + `sidebar/*` region components | XCOMP |
| `workspace-tree-node.css` | 72 | `WorkspaceTreeNode.vue` | XCOMP (hover/active/dragging/drop-target state) |
| `mobile-workspace.css` | 79 | phone shell + mobile library tabs | RESP / PSEUDO (`::after` tab underline) |
| `titlebar-search.css` | 36 | `TitleBarSearch.vue` | XCOMP (`:hover` override) |
| `titlebar-tabs.css` | 93 | `TitleBarTabs.vue` | XCOMP (active/hover/dirty/dragging/pinned tab state) |
| `sidebar-status-bar.css` | 24 | `SidebarStatusBar.vue` | OTHER (dynamic `sidebar-status__state--${saveStatus}` class — can't pair a per-branch dynamic class with a `tw:` utility per the conflict-test rule) + ANIM (saving-dot pulse) |

## Home screen (`src/styles/app/*.css`, `src/styles/app/home/*.css`)

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `workspace-home.css` | 23 | `WorkspaceHome.vue` | TOK (`--home-width` constant consumed by Hero/QuickActions children) |
| `home/hero.css` | 15 | `HomeHero.vue` | OTHER (reduced-motion override for a `tw:transition-colors` utility) |
| `home/quick-actions.css` | 15 | `HomeQuickActions.vue` | OTHER (reduced-motion override) |
| `home/recent.css` | 16 | `HomeRecent.vue` | OTHER (reduced-motion override) |
| `home/favorites.css` | 35 | `HomeFavorites.vue` | ANIM (skeleton shimmer keyframes — scoped-CSS `@keyframes` renaming forces this out of a `tw:animate-[...]` arbitrary value) |
| `workspace-home-favorites-manager.css` | 151 | `WorkspaceHomeFavoritesManager.vue` | XCOMP (`NvModal` panel-class edge-to-edge override) |

## Preview modals

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `app/docx-preview-modal.css` | 426 | `DocxPreviewModal.vue` | XCOMP (`NvModal` panel-class override) + GEN (rendered `.docx`-derived markup styling) |
| `app/pdf-preview-modal.css` | 22 | `PdfPreviewModal.vue` | XCOMP (`NvModal` panel-class override) |

## Settings and onboarding

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `settings.css` | 320 | `WorkspaceSettingsView.vue` + panels | XCOMP / HOOK-consumer overrides (`.hotkey-input` state matrix, `.ui-input` height override) |
| `settings-panels.css` | 210 | Settings panel shells | HOOK (search-field/ui-input, see above) + PLAT (`panel-body` `will-change` WebKit scroll-perf fix) + ANIM (search-highlight) |
| `mobile-settings.css` | 9 | Mobile settings detail view | RESP |
| `onboarding.css` | 37 | Onboarding screens | ANIM (Vue `fade`/`drop` transition classes) + XCOMP (`.privacy-badge` child override) |
| `onboarding-mobile-create.css` | 11 | Mobile workspace-creation swatch | PSEUDO (`::after` selection ring) |

## Editor shell and chrome (`src/styles/editor.css` + `src/styles/editor/*.css`)

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `editor.css` | 11 | `WorkspaceEditorPane.vue` (lazy import) | OTHER (import manifest) |
| `editor/editor-pane.css` | 91 | Editor frame; ProseMirror search-target highlight | GEN / XCOMP |
| `editor/editor-popups.css` | 25 | Query-field popovers | XCOMP (shared control height var) |
| `editor/editor-find.css` | 32 | `EditorFindBar.vue` | ANIM (Vue `<Transition>`-generated class names) |
| `editor/editor-menus.css` | 72 | Slash/table menus (teleported to `<body>`) | NATIVE (scrollbar styling across WebKitGTK/WebView2) |
| `editor/slash-menu-tiles.css` | 85 | `SlashBlockPreview.vue` miniature block art | GEN (illustrative SVG-like markup, cross-element active state) |
| `editor/note-embed-picker.css` | 7 | Editor overlays teleported to `<body>` | OTHER (global overlay z-index override, must cascade-win) |

## Editor generated content ("prose", ProseMirror-owned) — `src/styles/editor-prose.css` + `editor-prose/*.css`

Audited in full for Task 3 of `2026-09-25-tailwindcss-editor.md`; three dead rule groups were
removed there (see that commit): a superseded pre-markmap `.nv-mindmap-*` block, an unwired
`.nv-embed-btn*`/`.nv-embed-input` base, and two orphaned database cell rules. Everything
below is confirmed live (literal class, `className`/`classList`/`toDOM`, or a dynamic
template-literal prefix such as `` `nv-db-cell--${field.type}` ``) against `src` and `packages`.

| File | Lines (post-cleanup) | Consumer | Category |
| --- | --- | --- | --- |
| `editor-prose.css` | 15 | import manifest | OTHER |
| `prose-ai.css` | 41 | `ai-streaming.ts` plugin decorations | GEN + ANIM |
| `prose-block-embed.css` | 134 | `blockEmbed.ts` node view | GEN |
| `prose-blocks.css` | 283 | columns/toggle/embed node views | GEN |
| `prose-callouts-checklists.css` | 100 | `simple.ts` (callout) + checklist node views | GEN |
| `prose-code.css` | 238 | `code-block.ts` node view + hljs output classes | GEN + 3RD |
| `prose-database.css` | 1704 | `DatabaseBlock`/`DatabaseTableView`/`DatabaseCell` Vue node view | GEN |
| `prose-diagrams.css` | 487 | mermaid/vega/markmap/draw node views + markmap-foreign/katex-mathml | GEN + 3RD |
| `prose-links-embeds.css` | 337 | internal-link mark, note-embed/media/file node views | GEN |
| `prose-media.css` | 191 | image/file node views | GEN |
| `prose-performance.css` | 25 | `viewportRenderController.ts` (`data-viewport-render-state`) | JSGEO |
| `prose-query.css` | 195 | query/dataview block node view | GEN |
| `prose-tables.css` | 133 | table node view + `prosemirror-tables` (`column-resize-handle`, `selectedCell`, `tableWrapper`) | GEN + 3RD |
| `prose-text.css` | 302 | heading/tag/toggle/callout inline decorations | GEN |

**Subtotal:** 4,206 lines (down from 4,326 before the Task 3 cleanup removed 120 dead lines).

## Canvas, draw, graph

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `canvas.css` | 178 | `EdgelessCanvas` (edgeless/whiteboard) | JSGEO (per-tool cursor/visibility state toggled by the canvas composable at runtime) |
| `features/draw/draw.css` | 71 | `DrawView.vue` (roughjs + perfect-freehand) | JSGEO (drawing-surface stack + tool-dependent cursor) |
| `graph.css` | 15 | Graph view | ANIM (spinner keyframes, Vue fade transition) |

## Kanban and history

| File | Lines | Consumer | Category |
| --- | --- | --- | --- |
| `features/kanban-modal.css` | 30 | `KanbanCardModal.vue` + children | XCOMP (two-breakpoint padding rule not worth duplicating as two arbitrary `tw:` variants) |
| `features/history/history-diff-pane.css` | 7 | `HistoryDiffPane.vue` | ANIM (spinner) |
| `features/history/history-diff-row.css` | 6 | `HistoryDiffRow.vue` | XCOMP (`:deep(.history-block-content)` strike-through across child boundary) |
| `features/history/history-timeline.css` | 37 | `HistoryTimeline.vue` | PSEUDO (`::before` connecting line per item) |

## Vue component `<style>` blocks (>5 non-blank lines)

All scoped except where noted; every one already carries a header comment naming what moved to
`tw:` and why what remains couldn't.

| Component | Lines | Category |
| --- | --- | --- |
| `app/components/UpdateDialog.vue` | 52 | XCOMP (`:deep()` into rendered release-notes markup) |
| `app/WorkspaceShell.vue` | 47 | JSGEO (sandbox plugin view sizing/status) |
| `app/components/editor/EditorSurface.vue` | 43 | TOK (runtime `--workspace-editor-*` variables: width, font) |
| `ui/primitives/NvPasswordPromptDialog.vue` | 42 | XCOMP (shares `.nv-confirm-*` content styling with `NvConfirmDialog`) |
| `ui/primitives/NvConfirmDialog.vue` (unscoped) | 12 | PSEUDO (`::before` danger accent bar clipped to rounded panel) |
| `ui/primitives/NvConfirmDialog.vue` (scoped) | 42 | XCOMP (`:deep(.nv-btn)` footer state/transition + a 480px breakpoint) |
| `features/databases/kanban/KanbanToolbar.vue` | 33 | RESP (one coherent mobile-breakpoint block touching ~8 children incl. a `:deep()` into `NvSelect`) |
| `ui/primitives/NvToastHost.vue` | 27 | ANIM (toast enter/leave) |
| `features/databases/kanban/KanbanView.vue` | 27 | OTHER (`:global(body.kb-kanban-dragging)` — class set on `<body>` by a composable, outside this component's template) |
| `features/canvas/components/CanvasRichTextEditor.vue` | 24 | JSGEO (runtime `--canvas-rich-editor-scale` from camera zoom) |
| `app/components/WorkspaceEditorPane.vue` | 24 | RESP (mobile tab-bar padding breakpoint) |
| `app/components/WorkspaceRightPanel.vue` | 21 | PSEUDO (`:deep(svg)` chevron rotation state) |
| `ui/primitives/color-picker/ColorCustomEditor.vue` | 18 | NATIVE (`::-webkit-slider-thumb`) |
| `app/components/WorkspaceSearchOverlay.vue` | 17 | ANIM (spinner) |
| `ui/primitives/NvToggle.vue` | 15 | ANIM (track/thumb transition) |
| `ui/primitives/NvTextInput.vue` | 13 | NATIVE-adjacent state (hover/focus-visible background, unlayered to beat the shared `.ui-input` hook) |
| `app/components/settings/SettingsBackupPanel.vue` | 13 | ANIM (indeterminate progress keyframes) |
| `app/components/plugins/SandboxPluginFrame.vue` | 12 | OTHER (bare `<iframe>` sizing/color-scheme, no template alternative) |
| `ui/primitives/NvColorPicker.vue` | 11 | OTHER (checkerboard gradient background behind a runtime inline-style swatch color) |
| `features/databases/kanban/KanbanColumn.vue` | 11 | TOK (per-column runtime accent via inline `--style`, feeds a `color-mix()` fallback) |
| `app/components/WorkspaceHomeFavoritesManager.vue` (unscoped) | 10 | XCOMP (see home-manager row above) |
| `features/databases/kanban/KanbanTableView.vue` | 8 | ANIM (caret blink) |
| `features/canvas/components/CanvasPropertiesPanel.vue` | 8 | XCOMP (`:deep()` into `NvColorPicker`/`NvSelect` trigger width) |
| `ui/primitives/NvDatePicker.vue` | 7 | ANIM (popover entrance) |
| `app/components/templates/TemplatePickerModal.vue` (unscoped) | 7 | XCOMP (`NvModal` panel-class override) |
| `app/components/settings/workspace/WorkspaceCreationGroup.vue` | 7 | XCOMP (`:deep(.nv-icon-picker)`) |
| `features/databases/kanban/KanbanBoardModal.vue` | 6 | OTHER (delete-variant header icon color) |

**Subtotal:** ~557 lines across 27 `<style>` blocks in 26 components.

## Totals

| Area | Lines |
| --- | --- |
| Foundation/cascade (tokens, tailwind, base, primitives, surfaces, nv-modal, app.css) | 723 |
| App shell + home + preview modals | 1,329 |
| Settings + onboarding | 587 |
| Editor shell/chrome | 323 |
| Editor generated content ("prose") | 4,206 |
| Canvas/draw/graph | 264 |
| Kanban modal + history | 80 |
| Vue `<style>` blocks | ~557 |
| **Total** | **~8,069** |

The large majority (prose: 4,206 of ~8,069) is ProseMirror-generated/serialized node-view
content plus third-party output (hljs, prosemirror-tables, markmap, katex) that cannot become
template `tw:` classes without touching schema/serialization. The rest is a mix of shared
compatibility hooks, cross-component `:deep()` overrides, animation/transition classes Vue's
scoped-CSS compiler can't hand to a `tw:animate-[...]` arbitrary value, native pseudo-elements,
and small platform/token files everything else depends on.

No additional ordinary Vue-owned base rule eligible for trivial migration was found during this
pass — every remaining Vue `<style>` block already carries a header explaining why its specific
rule couldn't move (state override needing unlayered CSS, `:deep()`/`:global()` reach, native
pseudo-element, runtime CSS variable, or non-Tailwind-expressible keyframe).
