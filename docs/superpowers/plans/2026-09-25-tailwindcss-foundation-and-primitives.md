# Tailwind CSS Foundation and Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tailwind CSS to Nevo without changing its existing theme behavior, then migrate shared controls whose CSS has a single Vue owner.

**Architecture:** Tailwind v4 runs through the Vite plugin. A single stylesheet exposes utilities backed by the existing runtime CSS tokens and excludes Preflight. Vue templates own eligible element styles; global CSS retains rules for multiple consumers and non-template DOM until later migration plans.

**Tech Stack:** Vue 3, TypeScript, Vite 6, Tailwind CSS v4, Vitest, ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-tailwindcss-migration-design.md`

## Global Constraints

- Work only in `/tmp/nevo-tailwindcss-20260925`; its initial dirty files are a copy of user-owned work and must be preserved.
- Keep the Borderless light/dark design, runtime accent, appearance settings, custom CSS aliases and stable `nv-*` hooks.
- Do not enable Tailwind Preflight or add Tailwind classes to serialized ProseMirror note content.
- Prefer existing `Nv*` controls; add no shadcn-vue component without a concrete missing primitive.
- Preserve keyboard focus, touch target behavior, reduced motion and route-level CSS loading.
- Keep Tailwind class strings literal in templates or complete static maps.
- Follow `src/ui/AGENTS.md`; update `changes.md` only after implementation passes verification.

## Review Focus

- Dark theme: a semantic utility must read the current `--surface-*` value after theme changes; inspect both themes in the visual gate of Task 1.
- Custom accent: an accent utility must follow workspace runtime variables; inspect a non-default accent in the visual gate of Task 1.
- Native controls/editor: Tailwind integration must not inject Preflight; inspect the built CSS and representative editor controls in Task 1.
- Dialog keyboard path: focus trap, Escape, scrim and focus restoration must still work; run `NvModal.test.ts` in Task 2.
- Phone/coarse pointer: migrated controls must retain 44px touch targets and modal edge placement; inspect the phone and coarse-pointer visual gate in Tasks 2 and 3.

---

### Task 1: Tailwind integration and semantic utility layer

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `src/main.ts`
- Create: `src/styles/tailwind.css`
- Test: `src/styles/no-backdrop-filter.test.ts` (existing contract)

**Interfaces:**
- Consumes: existing `--surface-*`, `--text-*`, `--border-*`, `--accent`, `--focus-ring`, `--radius-*`, `--font-*` and `--z-*` variables in `src/styles/tokens.css`.
- Produces: prefixed CSS utilities such as `tw:bg-surface-panel`, `tw:text-content-primary`, `tw:border-line-default`, `tw:rounded-nv-md`, and `tw:z-nv-modal` for later tasks; no new TypeScript API.

- [x] **Step 1: Confirm baseline.** Run `pnpm exec vitest run src/styles/no-backdrop-filter.test.ts src/stores/theme.test.ts` in the worktree. Record any inherited failures before editing.
- [x] **Step 2: Install dependencies.** Run `pnpm add -D tailwindcss @tailwindcss/vite` in the worktree and review the lockfile diff for only these packages and their transitive dependencies.
- [x] **Step 3: Register the plugin.** Add `import tailwindcss from '@tailwindcss/vite'` to `vite.config.ts` and place `tailwindcss()` in the existing `plugins` array.
- [x] **Step 4: Add one utility entry.** Create `src/styles/tailwind.css` with Tailwind theme and utilities layers only; include explicit semantic aliases using `@theme inline`. Start with the tokens actually consumed by the next two tasks:

```css
@layer theme, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme) prefix(tw);
@import 'tailwindcss/utilities.css' layer(utilities) prefix(tw) source(none);
@source '../';

@theme inline {
  --color-surface-panel: var(--surface-panel);
  --color-content-primary: var(--text-primary);
  --color-content-secondary: var(--text-secondary);
  --color-line-default: var(--border-default);
  --color-accent: var(--accent);
  --radius-nv-md: var(--radius-md);
  --z-nv-modal: var(--z-modal);
}
```

- [x] **Step 5: Import and verify.** Import `./styles/tailwind.css` once from `src/main.ts` after `tokens.css`. Run `pnpm build`; inspect the emitted CSS for a generated semantic utility after using one in the next task and confirm it contains no Tailwind Preflight reset. Do not add a dummy production element only to force generation.
- [x] **Step 6: Visual baseline.** Capture the current shell and a control in light/dark, with a non-default accent, at 1440x900 and 390x844. Compare before/after integration; inspect a representative editor native input. Record any existing mismatch.
- [x] **Step 7: Check and commit.** Run `git diff --check`; commit only Task 1 files with `build: add Tailwind utility pipeline`.

### Task 2: Modal's Vue-owned layout and surfaces

**Files:**
- Modify: `src/ui/primitives/NvModal.vue`, `src/styles/nv-modal.css`
- Test: `src/ui/primitives/NvModal.test.ts`

**Interfaces:**
- Consumes: Task 1 semantic utilities and current `NvModal` props, slots, emits and `panelClass` prop.
- Produces: unchanged `NvModal` public API and stable `nv-modal*` class hooks. CSS keeps transition selectors and non-template media or pseudo rules that are still necessary.

- [x] **Step 1: Characterize behavior.** Run `pnpm exec vitest run src/ui/primitives/NvModal.test.ts` and inspect every `.nv-modal*` selector consumer with `rg -n 'nv-modal' src` before removing rules.
- [x] **Step 2: Move root/panel/header/body/footer element declarations.** Add literal Tailwind utilities to the existing elements, retaining the BEM class strings. For example, root uses `tw:fixed tw:inset-0 tw:grid tw:place-items-center`; panel uses `tw:relative tw:flex tw:min-h-0 tw:max-h-full tw:w-full tw:flex-col` and semantic surface utilities. Preserve safe-area padding and the narrow-screen edge placement with arbitrary values/variants where a direct utility is readable.
- [x] **Step 3: Keep transition semantics.** Retain `.nv-modal-enter-*` and `.nv-modal-leave-*` CSS, including the reduced-motion override; remove only the element declarations now owned by the template. Keep `panelClass` last in the class list so consumers can provide classes.
- [x] **Step 4: Verify.** Run `pnpm exec vitest run src/ui/primitives/NvModal.test.ts`, ESLint on `NvModal.vue`, and `pnpm build`. Inspect open/close, focus and scrim in both themes at desktop and phone widths; check reduced motion.
- [x] **Step 5: Check and commit.** Run `git diff --check`; commit Task 2 files with `refactor: style modal with Tailwind utilities`.

### Task 3: Standalone form controls

**Files:**
- Modify: `src/ui/primitives/NvTextInput.vue`, `src/ui/primitives/NvToggle.vue`, `src/ui/primitives/NvRangeInput.vue`, `src/ui/primitives/NvCheckbox.vue`
- Test: `src/ui/primitives/NvTextInput.test.ts`, `src/ui/primitives/NvToggle.test.ts`, `src/ui/primitives/NvRangeInput.test.ts`

**Interfaces:**
- Consumes: Task 1 semantic utilities and existing component props/emits.
- Produces: unchanged control APIs and stable root CSS class hooks. Retain CSS for browser-specific native-control styling that cannot be expressed clearly in templates.

- [x] **Step 1: Characterize controls.** Read each component's scoped CSS and consumers. Run the three focused tests before editing; record baseline failures.
- [x] **Step 2: Migrate one control at a time.** Move Vue-owned layout, size, surface, type, hover, disabled and focus styles to static class lists or explicit prop-to-class maps. Preserve each root `nv-*` hook; remove only migrated scoped declarations. For a size map, use complete strings such as:

```ts
const sizeClasses = {
  sm: 'tw:h-7 tw:px-2 tw:text-xs',
  md: 'tw:h-8 tw:px-3 tw:text-sm',
} as const
```

- [x] **Step 3: Verify after each control.** Run its focused test and ESLint on the touched Vue file; inspect light/dark, focus-visible, disabled, and coarse-pointer behavior. Keep the existing rule if the utility changes a native control's appearance.
- [x] **Step 4: Integration check.** Run all three focused tests, `src/styles/no-backdrop-filter.test.ts`, and `pnpm build`. Inspect one settings form and one onboarding form at desktop and phone widths.
- [x] **Step 5: Check and commit.** Run `git diff --check`; commit Task 3 files with `refactor: style shared form controls with Tailwind`.

### Task 4: Handoff to the remaining UI slices

**Files:**
- Create: follow-on plans under `docs/superpowers/plans/` for remaining shared UI, app shell/onboarding, features/settings, editor chrome, and cleanup.
- Review: the migration spec, all remaining selectors in `src/styles/**`, scoped Vue styles and route imports.

**Interfaces:**
- Consumes: the Tailwind entry and token names established in Task 1.
- Produces: exact per-area file/selector inventories and verification gates. No product behavior or API changes.

- [x] **Step 1: Inventory remaining selectors and owners.** Use `rg -n '^(\.|#|@media|@keyframes)' src/styles` and `rg -n '<style' src --glob '*.vue'`; assign each stylesheet to a component, generated DOM, or global behavior category.
- [x] **Step 2: Write one self-contained plan per remaining subsystem.** Name the exact files, owner components, CSS to retain, tests, visual states and independent commit points. Do not label migration complete while an eligible selector remains.
- [x] **Step 3: Review plans against the spec.** Confirm shell, onboarding, settings, feature views, editor chrome and cleanup are each covered, then execute those plans in order.
