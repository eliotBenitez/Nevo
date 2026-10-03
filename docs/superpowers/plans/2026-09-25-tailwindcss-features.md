# Tailwind CSS Feature Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Vue-owned styles in history, graph, kanban, database, canvas and drawing views to Tailwind.

**Architecture:** Each feature remains a separate route/feature boundary and keeps its existing state and lazy CSS imports. Template-owned presentation moves to `tw:` classes; generated SVG/canvas, graph edges, drag geometry, and exported DOM styling remain in CSS or runtime geometry where necessary.

**Tech Stack:** Vue 3, Tailwind CSS v4, Vitest, ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-tailwindcss-migration-design.md`

## Global Constraints

- Do not change persisted canvas, kanban, database or note data or editor state ownership.
- Preserve pointer-event drag behavior and WebKitGTK paths; do not introduce HTML5 drag/drop.
- Keep dynamic colors/geometry in current CSS variables, canvas/SVG styles or inline runtime values.
- Use semantic tokens, literal `tw:` classes and route-level imports until empty.

## Review Focus

- History diff colors still distinguish added, removed and changed content under arbitrary accent.
- Graph nodes and popovers still fit and respond to keyboard/pointer input.
- Kanban card drag and modal scroll remain stable on desktop and phone.
- Canvas/drawing toolbar selection and pointer capture retain focus/drag cues.
- Database tables remain horizontally scrollable without clipping controls.

---

### Task 1: History and graph chrome

**Files:** `src/features/history/**`, `src/styles/features/history/**`, `src/features/graph/GraphView.vue`, `LocalGraphPanel.vue`, `src/styles/graph.css`.
**Tests:** history view/diff tests and graph tests found by `rg --files src/features/history src/features/graph | rg '\.test\.ts$'`.

- [x] Map every stylesheet to component or generated SVG, run baseline tests and capture view states.
- [x] Move headers, list rows, controls and overlays to `tw:` classes. Keep SVG node/edge and generated diff-content selectors in CSS.
- [x] Run focused tests, lint, build, theme/responsive/keyboard review; remove dead rules and commit after diff check.

### Task 2: Kanban and database controls

**Files:** `src/features/databases/**`, `src/styles/features/kanban-modal.css`, database-related Vue scoped styles.
**Tests:** `src/features/databases/kanban/KanbanView.mobile.test.ts` and existing kanban/database tests.

- [x] Identify owned modal/list/table selectors and baseline interaction tests.
- [x] Migrate Vue-owned cards, toolbar, headers, rows and forms, preserving data rendering and pointer drag state; retain generated table/cell rules where needed.
- [x] Run focused tests, lint, build and phone/desktop modal/drag review; commit after diff check.

### Task 3: Canvas and drawing chrome

**Files:** `src/features/canvas/**`, `src/styles/canvas.css`, `src/features/draw/**` including `draw.css`.
**Tests:** canvas/draw tests found by `rg --files src/features/canvas src/features/draw | rg '\.test\.ts$'`.

- [x] Record which selectors target Vue controls versus canvas/SVG drawing internals; run baseline tests.
- [x] Move Vue toolbar, panels, overlays and buttons to utilities. Retain runtime coordinate, pointer and rendering styles.
- [x] Run focused tests, lint, build and pointer/keyboard/theme review; remove dead CSS and commit.

### Task 4: Feature CSS audit

**Files:** remaining scoped feature Vue styles and CSS imports in `src/features/**`.
**Tests:** tests for every touched feature and `src/styles/no-backdrop-filter.test.ts`.

- [x] Use `rg -n '<style|\.css' src/features` to inspect the remaining feature-level styles; migrate direct template-owned rules by component.
- [x] Preserve generated/export rules, verify tests, lint, build and responsive states; document retained CSS and commit.

## Retained feature CSS

Audited every `<style>` block and CSS import left in `src/features/history`, `src/features/graph`, `src/features/databases` (kanban) and, from Task 3, `src/features/canvas` and `src/features/draw`. What remains has a documented reason to stay unlayered/in CSS rather than becoming a `tw:` utility:

- **History** (`src/styles/features/history/*.css`): `@keyframes` spin animations (`history-diff-pane-spin`, `history-timeline-spin`), a `:deep()` reach into `HistoryDiffRow`'s child block content, and `::before` pseudo-elements drawing the timeline's connecting line/footnote rule.
- **Graph** (`src/styles/graph.css`, 15 lines): `@keyframes graph-spin` and the `<Transition>` `-enter-active`/`-leave-active`/`-from`/`-to` classes Vue's transition system requires by name (`graph-fade-*`, `tip-*`).
- **Kanban/database** (`src/styles/features/kanban-modal.css`, `KanbanBoardModal.vue`, `KanbanToolbar.vue`, `KanbanView.vue`): two `max-width` tiers on `.km-content__inner`/`.km-props__inner` padding (two Tailwind `max-[...]:` variants at different breakpoints have no guaranteed relative order, unlike the built-in ascending scale); a delete-variant icon color rule and a spinner `@keyframes` in `KanbanBoardModal`; one coherent mobile media block in `KanbanToolbar` restyling ~8 elements at once (universal child selector, a `:deep()` into `NvSelect`'s trigger); and in `KanbanView`, a `:global(body.kb-kanban-dragging)` rule set by the pointer-drag composable directly on `<body>` (never rendered by the component's own template, so it cannot become a template class), plus loading-skeleton/tooltip `@keyframes`.
- **Canvas** (`src/styles/canvas.css`, 179 lines): the edgeless-canvas world/camera transform and the `.editor-pane--canvas .ProseMirror` frame block, both positioned by CSS custom properties the canvas view and `canvasFrameStyle.ts` write from JS; tool-dependent cursor rules keyed off `.edgeless-canvas--tool-*`/`--presenting` ancestor state classes; and the `prefers-reduced-motion` override. Per-component: `CanvasPropertiesPanel`'s `:deep()` into `NvColorPicker`/`NvSelect` trigger internals; `CanvasRichTextEditor`'s `:deep()` into its `innerHTML`-generated contenteditable blocks plus the `--canvas-rich-editor-scale`-driven padding/border-radius/font-size; `CanvasSelectionChrome`'s `.is-locked` border-style override (needs to out-specificity the `tw:border-solid` utility it sits next to).
- **Draw** (`src/features/draw/draw.css`, 66 lines): the `<svg>` drawing-surface stack (`.draw-canvas*`) and the same tool-dependent cursor rules keyed off `.draw-view__canvas-wrap.is-*` ancestor classes, set by the pointer/selection composables — the Vue-owned shape of the same `.edgeless-canvas` pattern above. Also found and removed dead CSS with no template usage anywhere in the tree (`.draw-toolbar__swatch`/`__size`/`__size-dot`).

## Cascade bug found during the audit

`KanbanColumn.vue` (migrated to `tw:` utilities in an earlier session, commit `11f4f31`) had kept a legitimate small `<style scoped>` block for `.kb-column__pill`'s runtime custom-property fallback, but the *old*, now fully-superseded `<style scoped>` block (271 lines covering the whole column: header, pill, inputs, progress bar, drop zones, quick-add form) was never deleted. Because scoped `<style>` is unlayered CSS, it silently outranked every `tw:` utility on the same elements regardless of specificity — the "migration" had been visually inert since it landed. Deleted the dead block; `KanbanView.mobile.test.ts` was asserting against that dead block's literal CSS text (`'calc(100vw - 32px'`, `'scroll-snap-align: start'`) and needed updating to the `tw:` arbitrary-value spelling of the same intent (`'calc(100vw_-_32px'`, `'scroll-snap-align:start'`).

Out of scope for this plan (per its Goal: history, graph, kanban, database, canvas and drawing views only): `src/features/onboarding/**` and its three stylesheets (`onboarding.css`, `onboarding-create.css`, `onboarding-mobile-create.css`, ~445 lines combined) belong to the design doc's separate "App shell and onboarding" migration slice and were left untouched.
