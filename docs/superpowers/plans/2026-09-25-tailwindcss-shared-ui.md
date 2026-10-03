# Tailwind CSS Shared UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the remaining Vue-owned shared controls and overlays to Tailwind utilities.

**Architecture:** Keep existing `Nv*` props, emits, slots, and `nv-*` hooks. Move direct element declarations to prefixed `tw:` classes, retain pseudo/native/generated DOM rules in scoped CSS, and keep global classes until all plain-template consumers migrate.

**Tech Stack:** Vue 3, Tailwind CSS v4, Vitest, ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-tailwindcss-migration-design.md`

## Global Constraints

- Read `src/ui/AGENTS.md` and the migration spec; preserve focus, keyboard, touch, theme, reduced motion and custom CSS hooks.
- Never replace a functioning `Nv*` API merely to adopt shadcn-vue.
- Keep complete literal utility strings in templates or explicit variant maps; use `tw:` prefix.
- Do not delete global `.nv-btn`, `.nv-card`, `.nv-chip`, or surface rules while app templates still use them.

## Review Focus

- Nested popovers must remain within the viewport and keep their current Escape/focus behavior.
- Native date, number, range and color inputs must keep their platform appearance and focus cues.
- Disabled controls must remain inert even when hover and checked states overlap.
- Long labels and localized text must truncate/scroll as before at phone width.
- Toast and dialog stacking must remain above the workspace and below no active overlay.

---

### Task 1: Numeric, date and select controls

**Files:** `src/ui/primitives/NvNumberInput.vue`, `NvDatePicker.vue`, `NvSelect.vue`; owning selectors in `src/styles/ui.css`.
**Tests:** Existing tests and representative settings form tests (`src/app/components/settings/WorkspaceSettingsView.test.ts`); add a focused interaction test only for uncovered changed behavior.

- [x] Read each component and search consumers before editing: `rg -n 'Nv(NumberInput|DatePicker|Select)|nv-(number|date|select)' src`.
- [x] Run focused tests before editing; record failures.
- [x] Move wrapper/input/label/option layout, token colors, sizes and simple state styles to literal `tw:` classes; retain native picker pseudo-elements and positioning rules in CSS.
- [x] Run focused tests, changed-file ESLint and `pnpm build`; inspect emitted utilities and both themes, keyboard focus and phone width.
- [x] Run `git diff --check`, review the scoped diff, and commit this task.

### Task 2: Menus and pickers

**Files:** `src/ui/primitives/NvPopupMenu.vue`, `NvMenuItem.vue`, `NvMenuLabel.vue`, `NvMenuSeparator.vue`, `NvIconPicker.vue`, `NvGlyphPicker.vue`, `NvColorPicker.vue`, `NvNoteIcon.vue`; owned rules in `src/styles/ui.css`.
**Tests:** `NvColorPicker.test.ts`, `NvIconPicker.test.ts`, `NvGlyphPicker.test.ts`, `NvNoteIcon.test.ts` and relevant popup consumers.

- [x] Inspect each picker and its CSS selectors. Split `NvColorPicker.vue` by visible region/state responsibility before styling if it would otherwise remain above 500 lines.
- [x] Run the focused tests and record baseline.
- [x] Move element-owned grid, spacing, typography, state and color rules to literal `tw:` classes; preserve popup placement, focus and keyboard logic.
- [x] Verify focused tests, ESLint, build and light/dark desktop/phone menu states; commit after diff review.

### Task 3: Feedback and dialog controls

**Files:** `src/ui/primitives/NvToastHost.vue`, `NvConfirmDialog.vue`, `NvPasswordPromptDialog.vue`, `NvMiniEditor.vue`, `WindowControls.vue`; scoped CSS and owned global rules in `src/styles/ui.css`.
**Tests:** `NvConfirmDialog.test.ts`, `WindowControls.test.ts`, `NvModal.test.ts` and representative consumer tests.

- [x] Run baseline interaction tests, then migrate each Vue-owned visual region without changing aria roles, close/focus behavior or window actions.
- [x] Retain transition keyframes, platform window chrome and generated editor content selectors in CSS.
- [x] Run focused tests, changed-file ESLint, build and overlay/focus visual matrix; commit after `git diff --check`.

### Task 4: Global shared class audit

**Files:** `src/styles/primitives.css`, `src/styles/ui.css`, `src/styles/surfaces.css`, `src/main.ts` and their remaining consumers.
**Tests:** `src/styles/no-backdrop-filter.test.ts` and component tests touched by consumer migration.

- [x] For every remaining global selector, list consumers with `rg -n` and classify as template-owned, compatibility hook, or global behavior.
- [x] Migrate template-owned classes in the relevant consumer component before removing a selector; do not replace broad classes with `@apply` wrappers.
- [x] Remove empty imports only after all consumers have moved; run focused tests, ESLint, build, `git diff --check` and visual review.

#### Global class audit (2026-09-25)

| Selector group | Category | Consumers | Fate |
| --- | --- | --- | --- |
| `.nv-btn*`, `.nv-btn__spinner` | Compatibility hook | ~64 files use it directly in templates; ~30 contextual overrides in app CSS | Kept in `@layer components` (`primitives.css`) so `tw:` utilities can override per element; delete once shell/feature slices migrate consumers |
| `.nv-chip`, `.nv-kbd` | Compatibility hook | App templates and shortcut hints | Kept in `@layer components` |
| `.nv-btn--md` (was `ui.css`) | Compatibility hook | `NvButton.vue` | Moved into the `primitives.css` layer block; `ui.css` and its import deleted |
| `.nv-glass`, `.nv-card`, `.nv-caret` + `@keyframes nv-caret` | Dead | None in `src`, `packages`, plugin docs | Removed |
| `.nv-menu-enter/leave-active`, `@keyframes nv-menu-in` | Global behavior (Vue `<Transition>`) | `NvPopupMenu`, `NvMenuItem` | Kept unlayered |
| `surfaces.css` token aliases (`--frame-bg`, `--input-bg`, ...) | Global behavior (tokens) | Widespread | Kept |
| `.nv-frame`, `.nv-island`, `.nv-raised`, `.nv-overlay`, `.nv-sidebar` | Redesign-spec surface contract | No template applies them | Kept pending the final audit decision |
| `nv-modal.css` padding, transitions, reduced-motion, ≤560px sheet | Global behavior / transition | `NvModal` and dialog overrides | Kept |

Cascade review of layering `.nv-btn`: unlayered consumer rules that previously lost to `.nv-btn…:hover:not(:disabled)` (0,3,0) now win. Only `.sidebar-boards__add:hover` changes rendering (its intended `var(--hover)` background now applies); the archive delete hovers already used `!important`, and the titlebar/sidebar toggles only change `opacity`. `workspace-home-favorites-manager.css`'s `button:focus-visible` is loaded as scoped CSS and does not leak.
