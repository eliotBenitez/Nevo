# Shared UI Guidelines

These rules apply to `src/ui/**` in addition to the repository root instructions.

## Primitives and APIs

- Treat primitives as stable shared APIs. Search existing consumers and tests before changing props, emits, slots, keyboard behavior, or DOM structure.
- Prefer controlled state through typed props/emits or `defineModel`; do not mutate props.
- Keep primitives product-agnostic. Feature-specific business logic belongs in `src/app` or `src/features`.
- Reuse design tokens from `src/styles/tokens.css`; avoid hard-coded colors, shadows, spacing, and z-index values when a semantic token exists.
- Decide a primitive's component split up front, not as a later refactor (see the root "Design Before Implementation"). Give each `.vue` file one concern: extract substantial sub-regions (headers, rows, panes, option lists) into child components and move non-trivial stateful behavior (positioning, focus trapping, keyboard navigation) into a `src/ui` composable rather than growing one file.
- Treat roughly **500 lines** in a `.vue` or composable file as a trigger to stop and extract, not a cap to fill. A primitive approaching it at creation time means the boundaries were drawn too wide — redraw them.

## Accessibility and Interaction

- Preserve semantic roles, accessible names, keyboard navigation, escape/blur behavior, focus restoration, and visible focus.
- Ensure popups remain inside the viewport and have a deterministic stacking/teleport strategy.
- Support pointer, touch, and keyboard input. Avoid hover-only access to required actions.
- Respect reduced motion and theme contrast. Check both light and dark themes.

## Verification

- Add or update component tests for public behavior, not internal implementation details.
- Test keyboard interaction and emitted values for controls, menus, dialogs, and pickers.
- Review representative consumers after shared API or CSS changes.
- Perform visual verification at relevant desktop and mobile widths for layout changes.
