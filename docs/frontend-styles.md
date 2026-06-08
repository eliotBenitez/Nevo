# Frontend Style Layers

`src/main.ts` is the only entry point for app styles. Import global layers in this order:

1. `src/styles/tokens.css`
2. `src/styles/base.css`
3. `src/styles/primitives.css`
4. `src/styles/app.css`
5. `src/styles/editor.css`
6. `src/styles/settings.css`
7. `src/styles/onboarding.css`
8. `src/styles/graph.css`
9. `src/styles/ui.css`

## Naming

- Prefer feature prefixes such as `workspace-*`, `editor-*`, `settings-*`, `graph-*`, `onboarding-*`, and `nv-*`.
- Do not introduce new global selectors like `.header`, `.body`, `.title`, or `.item` without a feature namespace or a root-context selector.
- When a component needs to style nested children, prefer parent-prefixed selectors like `.workspace-root--compact .sidebar` instead of SFC-only deep selectors.

## Ownership

- `tokens.css`: theme tokens, fonts, and shared design variables.
- `base.css`: reset, app-wide document rules, and global runtime/display modes.
- `primitives.css`: reusable visual primitives such as cards, buttons, chips, and glass surfaces.
- `app.css`, `editor.css`, `settings.css`, `onboarding.css`, `graph.css`, `ui.css`: feature-owned layers only.

## Promotion Rules

- Keep a style in its feature file until it is reused in at least two real feature areas.
- Move repeated app-wide patterns into `base.css` or `primitives.css` only after that repetition is confirmed.

## SFC Rule

- Do not add new inline `<style>` blocks to `.vue` files for this frontend unless the migration strategy changes.
