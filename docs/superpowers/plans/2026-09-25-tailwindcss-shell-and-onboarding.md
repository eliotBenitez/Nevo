# Tailwind CSS Shell and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate workspace shell and onboarding presentation to Tailwind without changing navigation or mobile behavior.

**Architecture:** Keep state in existing app components and composables. Templates own layouts and states; CSS retains platform chrome, safe areas, media rules that cannot be expressed cleanly, and user custom CSS hooks. Keep route-level loading intact.

**Tech Stack:** Vue 3, Tailwind CSS v4, Vitest, ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-tailwindcss-migration-design.md`

## Global Constraints

- Preserve the Borderless reference, stable `nv-*` hooks, keyboard focus, pointer drag and mobile touch behavior.
- Do not move state into Pinia or alter workspace/note serialization; change presentation only.
- Use `tw:` prefixed classes and semantic tokens; keep dynamic geometry in existing CSS variables or inline styles.
- Preserve lazy imports for route-only CSS until its last rule is removed.

## Review Focus

- Docked/floating sidebar and narrow screen navigation keep their current width and scroll behavior.
- Native titlebar and window controls remain usable in WebKitGTK.
- Workspace home empty, populated and long-title states still truncate correctly.
- Onboarding keyboard flow and template selection remain operable at phone width.
- Modals/menus in the shell keep focus and z-index order.

---

### Task 1: Workspace frame and titlebar

**Files:** `src/app/WorkspaceShell.vue`, `src/app/components/TitleBarSearch.vue`, `src/app/components/TitleBarTabs.vue`, `src/styles/app/workspace-shell.css`, `titlebar-tabs.css`, `titlebar-search.css`, `src/styles/app.css`.
**Tests:** `src/app/WorkspaceShell.test.ts`, `src/ui/primitives/WindowControls.test.ts` and `src/app/components/TitleBarSearch.test.ts`, `src/app/components/TitleBarTabs.test.ts`.

- [x] Search every frame/titlebar selector and consumer; run existing tests before editing.
- [x] Move Vue-owned frame layout, spacing, surface, typography, and state classes to `tw:` utilities, retaining platform and pointer handling CSS.
- [x] Run focused tests, ESLint, build, and light/dark desktop/constrained/phone visual matrix; review diff and commit.

### Task 2: Sidebar and workspace tree

**Files:** `src/app/components/WorkspaceSidebar.vue`, workspace tree and status/tag child components, `src/styles/app/workspace-sidebar.css`, `workspace-tree-node.css`, `sidebar-status-bar.css`, `sidebar-tag-section.css`, `mobile-workspace.css`.
**Tests:** Sidebar/tree tests found in `src/app/components`, plus mobile layout tests and `src/app/WorkspaceShell.test.ts`.

- [x] Map selectors to each child component. Split the large sidebar by visible region before modifying it if needed to stay below the repository's 500-line design signal.
- [x] Run baseline interaction tests; preserve pointer-based dragging and keyboard navigation.
- [x] Migrate element-owned layout and states, retaining drag feedback and platform-specific selectors in CSS.
- [x] Run focused tests, changed-file lint, build, light/dark responsive and drag/focus review; commit.

### Task 3: Home, previews and overlays

**Files:** `src/app/components/WorkspaceHome.vue`, home child components, preview/rename/archive modal components; `src/styles/app/home/**`, `workspace-home.css`, `workspace-home-favorites-manager.css`, `pdf-preview-modal.css`, `docx-preview-modal.css`, `workspace-rename-modal.css`, `archive.css`.
**Tests:** `WorkspaceHome.test.ts`, favorites manager and preview/modal tests, archive view tests.

- [x] Identify ownership and remaining overrides of `NvModal` hooks; run baseline tests.
- [x] Move presentation to `tw:` utilities per component, preserving content layout and modal scroll overrides.
- [x] Run focused tests, lint, build and desktop/phone overlay review; commit after `git diff --check`.

### Task 4: Onboarding

**Files:** `src/features/onboarding/**`, `src/styles/onboarding.css`, `onboarding-create.css`, `onboarding-mobile-create.css`, `onboarding-mobile-create-actions.css`.
**Tests:** `src/features/onboarding/OnboardingView.test.ts`, `WelcomeView.test.ts` and create-workspace tests.

- [x] Map each onboarding stylesheet region to the existing step components; retain safe-area and platform rules.
- [x] Run baseline tests and migrate template-owned styling by step, keeping state in the existing onboarding composables.
- [x] Run focused tests, ESLint, build and light/dark desktop/phone focus review; remove dead route CSS imports and commit.
