# Tailwind CSS Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move settings screen and panel presentation to Tailwind while preserving appearance settings and responsive behavior.

**Architecture:** Settings views and child components keep their existing state and props. `tw:` classes own element styling; CSS keeps theme variable definitions, native control styling, scrollbar rules and settings-specific animations where needed.

**Tech Stack:** Vue 3, Tailwind CSS v4, Vitest, ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-tailwindcss-migration-design.md`

## Global Constraints

- Preserve persisted appearance values, previews, custom CSS, accessibility and mobile settings navigation.
- Keep CSS token definitions as the only runtime color source; use literal `tw:` classes.
- Do not alter settings stores or Tauri commands during presentation migration.

## Review Focus

- Accent, density, contrast, roundness and motion controls still preview and persist correctly.
- Settings navigation and panel scrollbars remain usable on 390px phone and constrained desktop.
- Long translated labels and error states do not overflow controls.
- Keyboard focus and screen reader labels remain associated with fields.
- Custom CSS editor does not lose its content or styling hooks.

---

### Task 1: Settings shell and navigation

**Files:** `src/app/components/settings/WorkspaceSettingsView.vue`, navigation child components in that directory, `src/styles/settings.css`, `src/styles/mobile-settings.css`.
**Tests:** `WorkspaceSettingsView.test.ts`, `WorkspaceSettingsView.mobile.test.ts`.

- [x] Inspect selector ownership and split overlarge regions before editing; run focused baseline tests.
- [x] Migrate shell, tab/nav, header, panel container and responsive layout to `tw:` classes; retain scrollbar and platform rules.
- [x] Run focused tests, ESLint, build, light/dark desktop/tablet/phone and keyboard review; commit after diff check.

### Task 2: Setting rows, fields and appearance panels

**Files:** setting group/row components under `src/app/components/settings/**`, `src/styles/settings-panels.css`, remaining selectors in `settings.css` and `mobile-settings.css`.
**Tests:** settings view tests, `src/utils/apply-workspace-style.test.ts`, `src/stores/theme.test.ts`, relevant group tests.

- [x] Inventory each row/panel selector and reusable `Nv*` control; run baseline tests.
- [x] Move direct layout, spacing, labels, help text, error and preview styling to templates; keep dynamic token declaration and native picker CSS.
- [x] Verify settings interactions, themes, accent and custom CSS; run focused tests, lint, build and diff check; commit.

### Task 3: Settings CSS retirement

**Files:** `src/styles/settings.css`, `settings-panels.css`, `mobile-settings.css` and imports in `WorkspaceSettingsView.vue`.
**Tests:** settings tests and `src/styles/no-backdrop-filter.test.ts`.

- [x] Search remaining selector consumers. Remove only dead rules and imports, leaving documented global/native selectors. (Folded into Task 2's commit: dead selectors — `.toggle`/`.toggle-ui`, `.mode-picker`/`.mode-card*`, `.accent-dot`, `.group-label`/`.group-header`, `.panel-feedback`, `.number-stepper*`, `.gradient-grid`/`.gradient-dot*`, `.ui-input--icon`, `.ui-input--glyph`/`--number`, `.inline-status*`, `.settings-row--muted`, `.link-action`, `.panel-divider`, `.plugin-card__body`, `.plugin-card--issue`, `.icon-action` — were removed as each was found to have zero template consumers, alongside the row/panel migration. No stylesheet or import was fully emptied: settings.css/settings-panels.css/mobile-settings.css all still hold documented native/scrollbar/state-matrix/color-mix residue, so `WorkspaceSettingsView.vue`'s imports are unchanged.)
- [x] Run focused tests, lint, build and responsive/focus review; commit after scoped diff review.
