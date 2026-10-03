# Tailwind CSS Editor Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Vue-owned editor chrome to Tailwind while keeping document content styling and serialization intact.

**Architecture:** Vue wrappers and overlays own utility classes; `src/editor-core` remains framework isolated. ProseMirror/generated node content, syntax, print and export selectors stay in CSS. Runtime editor state stays in ProseMirror, never Pinia or class strings stored in notes.

**Tech Stack:** Vue 3, ProseMirror, Tailwind CSS v4, Vitest, ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-tailwindcss-migration-design.md`

## Global Constraints

- Read `src/editor-core/AGENTS.md` before touching editor-related files.
- Do not modify schema, serialized note JSON, node attributes, selection, save paths or editor-core architecture for styling.
- Keep all Tailwind classes in Vue-owned DOM. Retain CSS for ProseMirror and generated plugin DOM.
- Preserve lazy editor stylesheet loading and WebKitGTK behavior.

## Review Focus

- Selection, caret, drag handles and slash menu still track the document while scrolling.
- Editor popup stacking and focus return remain correct above canvas and below modal overlays.
- Code/math/table/media content retains light/dark styling and export rendering.
- Zoom and appearance settings still affect editor layout.
- Large documents do not gain extra DOM/classes per node from migration.

---

### Task 1: Editor wrapper and toolbar

**Files:** `src/app/components/WorkspaceEditorPane.vue`, editor Vue wrapper/toolbar components, `src/styles/editor/editor-pane.css`, `editor-toolbars.css`, `editor-block-controls.css`, `doc-appearance.css`.
**Tests:** `WorkspaceEditorPane.test.ts`, `WorkspaceEditorPane.styles.test.ts`, `WorkspaceEditorPane.enter-regression.test.ts`.

- [x] Map selectors to Vue-owned elements, generated editor DOM, or runtime geometry; run baseline tests.
- [x] Move wrapper, toolbar, button and appearance panel styling to `tw:` classes. Leave `.nv-prosemirror` descendants and selection rules in CSS.
- [x] Run focused tests, ESLint, build, light/dark editor/caret/focus review; commit after diff check.

### Task 2: Menus, overlays, search and embeds

**Files:** editor overlay/menu Vue components, `src/styles/editor/editor-menus.css`, `editor-popups.css`, `editor-find.css`, `editor-link.css`, `slash-menu-tiles.css`, `note-embed-picker.css`.
**Tests:** corresponding editor overlay/search/slash tests and `src/editor-core/__tests__/regression.test.ts` when interaction changes.

- [x] Inventory selector ownership and baseline keyboard/search/menu tests.
- [x] Migrate Vue-owned panels and option rows to utilities, preserving selection and keyboard state. Retain plugin-generated DOM rules.
- [x] Run focused tests, lint, build, menu placement/scroll/focus review in both themes; commit after diff check.

### Task 3: Generated content CSS audit

**Files:** `src/styles/editor-prose.css`, `src/styles/editor-prose/**`, `src/styles/editor.css` and editor route import.
**Tests:** `src/editor-core/__tests__/serialization.test.ts`, `regression.test.ts` only if schema/serialization or rendering contracts are touched; style contract test always.

- [x] Classify each remaining selector: ProseMirror content, node view, third-party syntax, print/export, or dead rule.
- [x] Keep selectors required by generated/serialized content and remove only proven dead selectors. Do not add utility classes to JSON documents.
- [x] Run relevant editor tests, build, WebKitGTK/export and visual review; document retained categories and commit.
