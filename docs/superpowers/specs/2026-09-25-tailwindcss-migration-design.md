# Tailwind CSS Migration Design

**Date:** 2026-09-25

**Status:** Implemented (2026-09-26)
**Baseline:** The current uncommitted Borderless UI redesign, copied without modification into the `codex/tailwindcss-migration` worktree.

## Intent and success criteria

Replace hand-written CSS with Tailwind CSS utility classes wherever the style belongs to a Vue element and can be expressed without obscuring behavior. Cover the whole application in reviewable slices. Preserve the Borderless visual reference, the existing `Nv*` component APIs, keyboard behavior, light and dark themes, workspace accent and appearance settings, user custom CSS, note content, and desktop/mobile behavior.

Completion means all eligible app and feature presentation rules have moved to component templates, dead selectors and imports have been removed, and the remaining CSS has a documented reason to stay. The migration is visual and architectural; it does not change persisted schemas or application state ownership.

## Existing boundaries

`src/styles/tokens.css` owns theme and semantic custom properties. `src/styles/base.css` owns document-level behavior and appearance settings. `src/styles/primitives.css`, `src/styles/ui.css`, and `src/styles/surfaces.css` style shared UI. Feature styles are split across `src/styles/app/**`, `src/styles/features/**`, Vue scoped styles, and the editor, canvas, settings, onboarding, drawing, and graph stylesheets. `src/main.ts` imports global CSS; several routes and components import CSS on demand. `src/stores/theme.ts` sets the root theme class, and `src/utils/apply-workspace-style.ts` applies workspace appearance variables. The workspace store also injects user `.nevo/custom.css`.

The Borderless redesign spec and `docs/design/nevo-reference.html` define the visual target. Existing `Nv*` primitives own interaction contracts. ProseMirror and third-party generated DOM cannot always receive utility classes at the rendering site.

## Integration and tokens

Install Tailwind CSS v4 with `@tailwindcss/vite` and add the Vite plugin. Create one global Tailwind entry stylesheet, imported once from `src/main.ts`. Import Tailwind's theme and utilities layers separately, omitting Preflight: the existing base stylesheet already defines document and control resets, and a new reset could silently change editor content or native controls. Place Tailwind's utility output after token definitions while auditing cascade with existing unlayered rules; delete the old selector when its element migrates rather than relying on order to hide a conflict.

Prefix generated utilities with `tw:` during coexistence so existing class names cannot accidentally acquire Tailwind declarations. Use `@theme inline` to expose a small, semantic utility vocabulary backed by existing CSS variables: canvas/navigation/panel/overlay surfaces, primary/secondary/muted text, default/strong borders, accent and status colors, focus ring, UI fonts, scaled radii, and z-index levels. Do not duplicate theme color literals in Tailwind. Root theme classes, workspace appearance attributes, runtime accent variables, and user custom CSS remain the sources of values. Use literal, statically discoverable utility strings for state variants; do not construct class names dynamically. Existing CSS class hooks used by user custom CSS remain on elements where practical even after their declarations move.

## Migration slices and responsibilities

1. **Foundation:** `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `src/main.ts`, and the new Tailwind stylesheet integrate the compiler and token mapping. A focused build assertion verifies generated semantic utilities and that Preflight is absent.
2. **Shared UI:** `src/ui/primitives/*.vue` and their owning rules in `src/styles/primitives.css`, `src/styles/ui.css`, `src/styles/nv-modal.css`, and `src/styles/surfaces.css` move element-level layout, typography, colors, states, and responsive variants to templates. Keep each primitive's props, emits, slots, focus behavior, and stable class hooks. Existing component tests cover interactions.
3. **App shell and onboarding:** workspace titlebar, sidebar, home, overlays, onboarding, and mobile shell migrate by component boundary. Their imported CSS files shrink as selectors disappear. Keep pointer interaction and platform selectors in CSS where the DOM state cannot be expressed cleanly.
4. **Features and settings:** history, graph, kanban, database, drawing, settings, and remaining app views migrate separately. Route-level lazy CSS imports remain until their last rule is removed.
5. **Editor surfaces:** migrate Vue-owned editor chrome and controls. Keep ProseMirror document styling, node-view generated DOM, syntax highlighting, print/export rules, and selectors needed for generated content in CSS. Maintain editor-core's framework boundary; Tailwind classes do not enter serialized note JSON.
6. **Cleanup:** remove unused selectors and imports, document residual CSS categories, run full verification, and update `changes.md` only after checks pass.

Each slice must leave the app usable and independently verifiable. The unit of ownership stays the existing component or stylesheet; no new state store or composable is needed for styling. Runtime values stay in CSS variables and existing stores, while Vue templates choose visual classes. Dynamic geometry from canvas, editor layout, and user data continues to use inline values where appropriate.

## shadcn/ui decision

The existing `Nv*` primitives already implement the common controls and carry application-specific contracts. Do not replace them with generated components as part of a styling migration. If a concrete missing control appears, evaluate the Vue implementation from shadcn-vue for that control alone, including its dependencies, accessibility, and token mapping. Adding a component is a separate reviewable change within the relevant slice.

## CSS that remains

Keep semantic token definitions; document and platform rules; theme, density, contrast, motion, and scrollbar settings; user CSS compatibility aliases; pseudo-elements or pseudo trees without a suitable template owner; `@keyframes` that cannot be expressed usefully with utilities; and selectors for ProseMirror, third-party, exported, or otherwise generated DOM. Avoid broad `@apply` rewrites that merely move utility lists back into CSS. For every retained stylesheet, identify its consumers and preserve lazy loading where present.

## Verification and risks

Before a slice, record its CSS selectors, consuming components, and existing tests. After it, run focused Vitest and ESLint, `pnpm build` for the integration and public component changes, and `git diff --check`. Compare light and dark themes at desktop, constrained desktop, and phone widths; check keyboard focus, reduced motion, custom accent, and representative WebKitGTK/Tauri paths. Keep the existing style-contract tests passing. Full frontend gates and the repository's `nevo-verify-change` selector run at completion; refresh graphify after source or project documentation changes.

Primary risks are cascade changes from Tailwind layers, accidental reset of editor/native controls, missed classes because of dynamic construction, loss of custom CSS hooks, and CSS from lazy routes moving into the startup bundle. The separate stylesheet, no-Preflight integration, static class mapping, per-slice selector audit, and visual/build checks address these risks.
