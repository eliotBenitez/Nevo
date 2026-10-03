# Tailwind CSS Final Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the whole-interface migration with a reviewed residual CSS inventory and full verification.

**Architecture:** Remove dead selectors/imports only after tracing consumers. Keep token, document/platform, generated DOM and native-control CSS categories. Update project documentation and changelog after verified source changes.

**Tech Stack:** Vue 3, Tailwind CSS v4, Vitest, ESLint, pnpm, Tauri/WebKitGTK.

**Spec:** `docs/superpowers/specs/2026-09-25-tailwindcss-migration-design.md`

## Global Constraints

- Preserve persisted workspace/note formats, user custom CSS aliases and stable hooks.
- Do not add `@apply` wrappers as a substitute for template migration.
- Keep no undocumented global stylesheet or route CSS import after migration.
- Do not mark visual states passed without actual rendered evidence.

## Review Focus

- Custom `.nevo/custom.css` still sees documented token aliases and stable hooks.
- Dark/light/accent/density/roundness settings propagate across every route.
- Route-level CSS does not move wholesale into startup bundle.
- Export/print ProseMirror content remains styled without `foreignObject` regressions.
- WebKitGTK, Android and iOS builds do not reference desktop-only styling services or plugins.

---

### Task 1: Residual CSS inventory

**Files:** all remaining `src/styles/**/*.css`, Vue `<style>` blocks and import sites.
**Tests:** existing style contract plus affected component tests.

- [x] Search every remaining selector and document its consumer and retained reason: semantic token, document/platform rule, generated DOM, native control, pseudo tree, print/export, or animation.
- [x] Move any remaining Vue-owned ordinary presentation rule to a `tw:` class, then delete its rule. Remove empty stylesheet imports.
- [x] Run focused tests, ESLint, build and `git diff --check`; commit the cleanup.

### Task 2: Cross-cutting verification

**Files:** verification evidence under this plan's ignored ledger workspace; source only if a real regression is found.
**Tests:** `.codex/skills/nevo-verify-change/scripts/verify_change.sh --run --full`, `pnpm lint`, `pnpm test:run`, `pnpm build`; Rust checks if native files changed.

- [x] Run the diff selector and full frontend gate. Classify inherited failures against the copied baseline and run focused checks for changed files.
- [x] Review light/dark, custom accent, desktop/tablet/phone, focus, reduced motion, editor, overlay and WebKitGTK paths; capture screenshots where tooling permits.
- [x] Inspect build CSS chunks and bundle budgets; compare route lazy loading and verify no unintended Preflight reset.

### Task 3: Documentation and finish

**Files:** `ARCHITECTURE.md` only if startup/layering description changes, `docs/testing.md` only if load-bearing checks change, `changes.md`, migration spec and plans.

- [x] Update affected architecture/testing docs and add one concise English past-tense `changes.md` entry at the top of the appropriate section after successful verification.
- [x] Run `graphify update .`, `git diff --check`, review final scoped diff, and commit documentation.
- [x] Perform final branch review; report implemented areas, passed/failed/skipped checks and remaining CSS reasons to the user.
