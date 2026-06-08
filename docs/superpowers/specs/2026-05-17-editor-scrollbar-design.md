# Editor Scrollbar And Smooth Scrolling — Design Spec
Date: 2026-05-17

## Scope

Improve scrolling UX inside the workspace editor by:

- preserving smooth programmatic scrolling inside the editor surface
- adding a custom right-side overlay scrollbar for the editor document
- making the scrollbar visible only on hover, during scroll activity, and while dragging

Out of scope:

- replacing native wheel scrolling with JavaScript-driven inertial scrolling
- adding a minimap, outline, or document overview rail
- changing scrolling behavior outside the editor pane

## Current Context

- The editor scroll container is `.doc-body` in `src/app/components/WorkspaceEditorPane.vue`
- The editor content itself is rendered inside `.doc-content` and `.doc-editor`
- Global app styles currently hide native scrollbars via `src/styles/tokens.css`
- Workspace settings already expose `editor.smoothScrolling`
- Workspace settings also expose `appearance.reducedMotion`

This means the feature should be implemented as a local overlay scrollbar rather than by styling the native OS scrollbar.

## User Experience

### Scrolling behavior

- The editor continues to use the existing scroll container and native browser scrolling
- Smooth scrolling remains enabled for programmatic movements when `editor.smoothScrolling` is on
- The implementation does not intercept wheel events or synthesize custom inertial physics
- Existing editor flows that rely on `scrollIntoView()` keep working as they do now

### Overlay scrollbar behavior

- A narrow scrollbar track appears on the right edge of the editor scroll area
- In the resting state, the scrollbar is visually hidden and does not attract attention
- The scrollbar becomes visible when:
  - the user hovers the editor scroll area
  - the user scrolls the editor
  - the user drags the scrollbar thumb
- The scrollbar hides again shortly after scroll activity ends
- If the document does not overflow vertically, the overlay scrollbar is not rendered

### Scrollbar interactions

- The thumb position reflects the current `scrollTop` of the editor container
- The thumb height reflects the visible viewport relative to the total document height
- Dragging the thumb updates the editor container scroll position
- Clicking the track repositions the viewport so the thumb centers around the clicked point as closely as bounds allow
- Dragging the thumb must not interfere with text selection inside the editor surface

### Motion behavior

- In normal motion mode, the overlay uses subtle opacity and transform transitions
- In reduced motion mode, the overlay still appears and disappears, but without decorative motion
- Scrolling fidelity takes priority over animation polish

## Recommended Approach

Implement the scrollbar locally inside `src/app/components/WorkspaceEditorPane.vue`.

Why this approach:

- the behavior is specific to the editor pane
- the scroll container already lives in this component
- the change stays isolated and avoids premature abstraction
- it minimizes risk to ProseMirror behavior and the rest of the layout system

Alternative approaches considered and rejected:

1. Styling the native scrollbar with CSS only
   - Rejected because the app globally hides native scrollbars and cross-platform results would be inconsistent
2. Extracting a reusable scrollbar primitive first
   - Rejected for now because only the editor needs this behavior today
3. Replacing wheel scrolling with custom physics
   - Rejected because it is high risk around editor selection, drag-and-drop, and ProseMirror interactions

## Architecture

### Files changed

Primary implementation target:

- `src/app/components/WorkspaceEditorPane.vue`

Possible supporting tests:

- `src/app/components/WorkspaceEditorPane.test.ts` if present
- or a new focused test file near the editor pane component if the current suite is organized differently

No settings schema changes are required for this feature.

### Template changes

Inside the editor pane:

- add a `ref` to the `.doc-body` scroll container
- add an overlay scrollbar layer positioned along the right side of the editor body
- render:
  - a track element
  - a thumb element

The overlay should live inside the editor pane layout so it scrolls independently from document content and remains visually anchored to the editor edge.

### Component state

Keep state local to `WorkspaceEditorPane.vue`.

Suggested state:

- `editorScrollEl`
- `isScrollbarVisible`
- `isScrollbarScrollable`
- `isScrollbarDragging`
- `thumbHeight`
- `thumbOffset`
- `hideScrollbarTimeoutId`
- temporary drag bookkeeping such as pointer start position and start scroll ratio

No store state is needed.

### Metric calculation

Scrollbar metrics are derived from:

- `scrollTop`
- `scrollHeight`
- `clientHeight`

Rules:

- `isScrollbarScrollable = scrollHeight > clientHeight`
- `thumbHeight` is proportional to `clientHeight / scrollHeight`
- enforce a minimum thumb size of `40px` so long notes remain draggable
- `thumbOffset` is proportional to `scrollTop / (scrollHeight - clientHeight)`

Expose one local function such as `updateScrollbarMetrics()` and call it from all relevant lifecycle and interaction hooks.

### Visibility lifecycle

The overlay becomes visible when:

- pointer enters the scroll area
- the user scrolls
- thumb drag starts

The overlay begins hiding when:

- pointer leaves the scroll area
- scroll activity settles
- thumb drag ends

Use an inactivity timeout of about `700ms` after scroll events so the scrollbar does not flicker or disappear too aggressively.

### Event handling

Editor container events:

- `scroll` updates metrics and reveals the overlay
- `mouseenter` reveals the overlay
- `mouseleave` allows the overlay to hide if not dragging

Scrollbar events:

- thumb `mousedown` starts dragging
- document-level `mousemove` updates drag position while active
- document-level `mouseup` finishes dragging and clears drag state
- track `mousedown` jumps the viewport toward the clicked position

Limit `preventDefault()` to scrollbar drag interactions so normal editor behavior remains intact.

### Resizing and dynamic content

The editor document can change height after initial render because of:

- note switches
- images loading
- math blocks
- code blocks
- plugin-driven content changes

The implementation must refresh scrollbar metrics after:

- mounting the editor pane
- switching notes
- editor content updates that affect layout
- window or container resizes
- the next DOM tick when layout-dependent changes are applied

The simplest acceptable implementation is to combine:

- `scroll` listener
- `resize` listener
- targeted `nextTick()` refreshes around note/editor setup transitions

If needed, a local `ResizeObserver` on the scroll container or content wrapper is acceptable, but only if the simpler approach is insufficient.

## Styling

The overlay should match the existing Nevo editor aesthetic:

- slim profile
- soft contrast against the editor background
- accent-aware hover/active states
- no heavy shadows or oversized chrome

Suggested styling direction:

- track uses a faint line or glass-like fill
- thumb uses `var(--text-4)` or a mixed neutral by default
- thumb becomes more prominent on hover and while dragging
- active drag may use `var(--accent)` or `var(--accent-soft)` as a subtle emphasis

The scrollbar should not reduce readable line width in `.doc-content`.
It should sit in overlay space near the editor edge rather than consume layout width.

## Testing

Focus on behavior, not pixel-perfect rendering.

Required coverage:

1. Scrollbar is hidden or absent when the document does not overflow
2. Scrolling the editor updates thumb size and/or position metrics
3. Dragging the thumb updates the editor container `scrollTop`

Recommended coverage:

4. Scroll activity reveals the overlay and idle timeout hides it again
5. Reduced motion mode disables decorative transitions but keeps functionality intact
6. Existing block navigation or editor `scrollIntoView()` flows still operate with the new overlay in place

## Risks And Mitigations

### Risk: dynamic content invalidates thumb metrics

Mitigation:

- refresh metrics after render-sensitive editor updates
- listen for resize
- keep one authoritative metric recomputation path

### Risk: scrollbar drag conflicts with editor text selection

Mitigation:

- bind drag start only to the thumb
- avoid global `preventDefault()` outside active drag
- end drag cleanly on mouseup even if pointer leaves the component

### Risk: excessive JavaScript smoothing harms editor fidelity

Mitigation:

- do not intercept wheel events
- keep scrolling native
- limit logic to overlay synchronization and programmatic smooth behavior already supported by CSS

## Acceptance Criteria

- The editor shows a right-side custom overlay scrollbar only when vertical overflow exists
- The scrollbar becomes visible on hover, while scrolling, and during drag
- The thumb correctly tracks viewport position through long documents
- Dragging the thumb scrolls the editor reliably
- The implementation does not break editor selection, block navigation, or existing `scrollIntoView()` behavior
- Reduced motion mode remains respected
