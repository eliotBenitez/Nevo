# Solid UI Redesign Design

**Status:** Approved design
**Date:** 2026-09-22
**Scope:** Nevo frontend UI/UX across every existing route, feature surface, dialog, overlay, and responsive layout

## 1. Purpose

Replace Nevo's glass-led visual language with a coherent solid, tonal interface that works in light and dark themes without changing product capabilities, route behavior, editor data ownership, or workspace content.

The redesign must feel like a focused editorial tool rather than a collection of translucent cards. It should use opaque surfaces, spacing, dividers, typography, and restrained elevation to communicate hierarchy. Every existing screen and window remains functional and recognizable while sharing one component and interaction language.

## 2. Desired Outcomes

- No production UI surface uses `backdrop-filter`, translucent glass panels, neon glow, or ambient blur.
- Light and dark themes use the same semantic hierarchy rather than separate one-off palettes.
- Shared primitives own interactive states; feature CSS owns layout and feature-specific presentation only.
- All 15 registered routes and their modal, popup, mobile, loading, empty, and error states are covered.
- Existing workspaces and settings continue to load without destructive migration or automatic rewrites.
- Keyboard operation, focus visibility, touch targets, reduced motion, and responsive behavior improve or remain intact.
- The change introduces no new runtime dependency.

## 3. Non-Goals

- No change to note content, ProseMirror schema, canvas persistence, workspace manifest shape, or import/export formats.
- No change to route URLs, hotkey assignments, plugin protocols, Tauri permissions, or backend command APIs.
- No restyling inside third-party sandboxed plugin content; only the Nevo-owned host frame and states are in scope.
- No return of removed collaboration, cloud workspace, shared storage, team, or OAuth features.
- No replacement of Vue, existing Pinia stores, Lucide Vue icons, or the current responsive capability model.

## 4. Current-State Evidence

Observed from the current working tree:

- `src/router/index.ts` registers 15 routes spanning onboarding, workspace, notes, canvas, history, graph, kanban, plugin views, and drawing.
- `src/app`, `src/features`, and `src/ui` contain 183 Vue components.
- 80 frontend files contain 416 uses or declarations related to `--glass-*`, `backdrop-filter`, or associated blur behavior.
- `src/styles/tokens.css` currently maps several semantic surfaces back to `--glass-*` tokens.
- `src/styles/base.css` contains global transparency, background-scene, surface-style, and sidebar-style behavior.
- `src/types/workspace.ts` persists `SurfaceStyle` as `glass | solid | tinted`; new workspace defaults currently select `glass`.
- `src/utils/apply-workspace-style.ts` applies persisted appearance values as root data attributes.
- `src/composables/useDeviceLayout.ts` defines phone as `<720px`, tablet as `720–1099px`, desktop as `>=1100px`, drawer navigation below `960px`, and fullscreen dialogs below `720px`.
- The repository already contains a large user-owned dirty working tree. Redesign changes must preserve and build on it rather than reset or rewrite unrelated work.

Confidence is high for the structural inventory because it is verified against the current source and graphify query results. Browser-only Vite preview cannot fully represent the application because startup depends on Tauri IPC; visual verification must therefore include the Tauri app or deterministic UI harnesses in addition to browser fixtures.

## 5. Design Direction

The approved direction is a calm editorial productivity interface:

- warm paper-like light canvas;
- graphite, never pure-black, dark canvas;
- one active accent at runtime, with a muted mineral teal as the default direction;
- Geist for application chrome;
- Geist Mono for numeric comparisons, shortcuts, and technical values;
- Instrument Serif only for document content when selected by the user;
- asymmetry on onboarding and home, but predictable geometry in dense work areas;
- borders and negative space before shadows;
- cards only when an object is independently movable, selectable, or elevated by behavior.

## 6. Token Architecture

The styling system uses three layers.

### 6.1 Primitive tokens

`src/styles/tokens.css` owns raw neutral, accent, status, spacing, radius, shadow, typography, and duration values. Primitive color values do not encode component meaning.

The neutral palette stays consistently warm in light mode and neutral graphite in dark mode. Pure black, oversaturated accents, purple/blue glow treatments, and gradient text are excluded.

### 6.2 Semantic tokens

Theme classes assign primitives to purpose-based tokens:

- `--surface-canvas`
- `--surface-navigation`
- `--surface-panel`
- `--surface-subtle`
- `--surface-raised`
- `--surface-overlay`
- `--surface-selected`
- `--surface-danger`
- `--surface-success`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--text-on-accent`
- `--border-subtle`
- `--border-default`
- `--border-strong`
- `--focus-ring`
- `--shadow-raised`
- `--shadow-overlay`

Light and dark themes override semantic tokens, not component selectors.

### 6.3 Component tokens

Shared component styles map semantic tokens to component contracts, for example:

- `--button-bg`, `--button-border`, `--button-fg`
- `--input-bg`, `--input-border`, `--input-ring`
- `--menu-bg`, `--menu-border`, `--menu-shadow`
- `--modal-bg`, `--modal-border`, `--modal-shadow`
- `--sidebar-bg`, `--sidebar-divider`

Feature styles consume semantic or component tokens and do not introduce private color systems.

### 6.4 Temporary compatibility aliases

During implementation, legacy `--glass-*` variables may point to opaque semantic surfaces so unmigrated consumers remain usable. These aliases are a transition seam, not the final architecture. Before completion, production CSS consumers migrate to semantic tokens and the `--glass-*` CSS aliases are removed. The persisted string value `surfaceStyle: "glass"` remains supported as a data-compatibility input.

## 7. Style Module Responsibilities

| File or area | Single responsibility |
| --- | --- |
| `src/styles/tokens.css` | Primitive and semantic theme tokens only |
| `src/styles/surfaces.css` | Reusable solid surface, divider, raised, and overlay contracts |
| `src/styles/base.css` | Global document layout, theme attributes, density, motion, scrollbars, focus policy, and background scenes |
| `src/styles/primitives.css` | Button and generic control styling |
| `src/styles/nv-modal.css` | Modal scrim, panel geometry, responsive placement, and modal transitions |
| `src/styles/ui.css` | Shared non-modal UI utilities and remaining reusable presentational patterns |
| `src/styles/app/**` | Workspace shell and app-component layout |
| `src/styles/editor/**`, `src/styles/editor-prose/**` | Editor chrome and document-specific presentation |
| `src/styles/features/**`, feature-local styles | Feature layout and domain-specific visualization only |

`src/main.ts` imports the new surface layer between `base.css` and shared primitives. No global feature CSS is added back to startup; current route-level CSS splitting remains intact.

## 8. State Ownership and Data Flow

No new shared state is introduced.

- `useThemeStore` remains the authority for resolved light/dark theme and app-level accessibility attributes.
- `useWorkspaceStore` remains the authority for persisted workspace appearance settings.
- `applyWorkspaceStyle` remains the boundary that translates persisted appearance into DOM data attributes.
- Vue components select variants through props, classes, and existing typed callbacks.
- CSS consumes theme and appearance attributes and owns presentation.

Components must not duplicate theme state locally. Feature code must not read raw colors or decide whether a shadow is appropriate; it selects a semantic surface or component variant.

## 9. Persisted Settings Compatibility

### 9.1 Existing shape

Workspace settings persist `appearance.surfaceStyle` as `glass`, `solid`, or `tinted`. App config may also persist `reduceTransparency`.

### 9.2 Target behavior

- New workspace defaults use `surfaceStyle: "solid"` in both TypeScript and Rust defaults.
- Existing `surfaceStyle: "glass"` remains a valid readable value.
- At render time, `glass` resolves to `solid` without writing the workspace file.
- `tinted` resolves to an opaque tonal surface; it never enables blur.
- The settings UI offers Solid and Tinted. A loaded legacy Glass value is displayed as Solid without being persisted until the user explicitly changes a setting.
- Settings search reports the resolved display value rather than presenting Glass as an available style.
- `reduceTransparency` remains readable and round-trippable for compatibility, but its UI control is removed because all Nevo-owned surfaces are opaque.
- Unknown workspace settings and plugin settings remain preserved exactly as today.

### 9.3 Migration ownership and writes

There is no eager migration and no schema bump. Compatibility is owned by the existing normalization and presentation boundaries. A settings file is written only through the existing explicit update path.

Older builds already recognize `solid`, so rollback remains safe. Reverting the frontend does not make a workspace unreadable. Existing `glass` values are never replaced merely by opening the workspace.

### 9.4 Failure behavior

- Missing or invalid surface styles fall back to the coordinated Rust and TypeScript default of Solid.
- A failed settings save leaves the in-memory error behavior unchanged and must not trigger a compensating destructive rewrite.
- No note, manifest, SQLite, asset, or editor persistence path participates in this redesign.

## 10. Visual System

### 10.1 Surface hierarchy

1. Canvas: page or workspace background.
2. Navigation: sidebar, titlebar, mobile bottom navigation.
3. Panel: inspector, settings content, tool regions.
4. Subtle: selected rows, grouped controls, secondary areas.
5. Raised: draggable cards and transient anchored panels.
6. Overlay: modal, menu, command palette, and popover surfaces.

Navigation and panel hierarchy is visible through tonal separation and 1px dividers. Raised and overlay surfaces may use tinted shadows; static panels do not.

### 10.2 Radius and spacing

- Radius scale: 6px, 10px, and 14px after the existing roundness multiplier.
- Pill geometry is limited to statuses, compact filters, and true segmented controls.
- Spacing follows the existing 4px-derived rhythm and current compact/comfortable density setting.
- Desktop application controls normally use 32–40px heights; touch layouts use at least 44px hit targets.

### 10.3 Typography

- Application headings use Geist with weight and color for hierarchy, not oversized display type.
- Application chrome never uses serif.
- Long headings use balanced or pretty wrapping where supported.
- Numeric comparison columns use tabular figures.
- User content supports short, normal, and very long strings without breaking layout.

### 10.4 Accent and status colors

Only one workspace accent is active at a time. Accent presets remain a user capability, but glow tokens and outer glow treatments are removed.

Success, warning, and danger remain semantic status colors rather than additional decorative accents. Status is always communicated by text, icon, border, or pattern in addition to color.

## 11. Component Contracts

### 11.1 Interactive states

Shared controls implement this priority:

1. disabled
2. loading
3. active
4. focus-visible
5. hover
6. default

Every interactive component supports relevant default, hover, active, focus-visible, disabled, loading, and error states. Active feedback uses a 1px displacement or `scale(0.98)` where it does not disturb layout.

### 11.2 Forms

- Visible labels sit above fields unless an established compact toolbar pattern requires an accessible name instead.
- Helper and error text sits below the field.
- Errors set `aria-invalid` and connect through `aria-describedby`.
- Correct input type, `name`, `autocomplete`, `inputmode`, and spellcheck behavior are preserved or added.
- Paste is never blocked.

### 11.3 Buttons

Variants are Primary, Secondary, Outline, Ghost, and Danger. Icon-only buttons require an accessible name. Navigation uses links or router links; actions use buttons.

### 11.4 Menus and popovers

Menus use opaque overlay surfaces, viewport-aware positioning, roving keyboard navigation, Escape dismissal, and deterministic focus restoration. They must not depend on hover for required actions.

### 11.5 Dialogs

- Desktop dialogs are centered opaque panels.
- Phone dialogs are full-width sheets or fullscreen flows, depending on information density.
- Scrims darken without blur.
- Dialogs trap focus, close with Escape when safe, restore focus, contain overscroll, and respect safe-area insets.
- Header, scrollable body, and footer follow one shared layout contract.

### 11.6 Loading, empty, and error states

- Loading uses skeletons matching the final geometry; spinners remain only for compact in-control progress.
- Empty states name the missing content and the next available action.
- Error messages describe both the problem and a next step.
- Async status announcements use an appropriate live region.

## 12. Motion

- Standard durations: 100–220ms.
- Animate transform and opacity; color, border, and shadow transitions may use explicit properties.
- Do not use `transition: all`.
- Avoid ambient perpetual motion in document and workspace views.
- Loading shimmer exists only while loading and stops under reduced motion.
- View transitions and feature transitions remain interruptible.
- `prefers-reduced-motion` and the existing app motion setting disable non-essential motion.

## 13. Screen and Window Coverage

| Area | Target treatment |
| --- | --- |
| Onboarding | Asymmetric split composition instead of a centered glass card; common progress, action, and error patterns across welcome, create, open, and mobile flows |
| Workspace shell | Clear titlebar, navigation, editor, and inspector layers; solid tonal sidebar; active document indicated by contrast and marker rather than elevation |
| Home | Compact editorial hero, asymmetric favorites/recent regions, and a horizontal quick-action rail rather than equal card grids |
| Editor | Quiet canvas; solid formatting toolbar, slash menu, find bar, link/embed/math/query popovers; document content visually distinct from application chrome |
| Editor databases and queries | Shared controls for toolbar, filter, sort, settings, tables, cards, charts, lists, import, and query result states |
| Settings | Navigation plus section content; headings, rows, and dividers replace nested card stacks except for genuinely independent objects |
| Search | Opaque command palette with grouped results, keyboard selection, truncation, and explicit loading/empty/error states |
| Graph | Full canvas with solid top bar, compact filter panel, and shared tooltip/control surfaces |
| Canvas | Open drawing area; solid toolbars, properties, minimap, export, link picker, and presentation controls |
| Draw | Toolbar and properties use the same control dimensions, selected states, and contrast as Canvas |
| Kanban | Tonal column zones; cards retain independent surfaces because they are draggable objects; board/card dialogs, calendar, table, filters, sorting, and automations use shared primitives |
| History | Existing split structure retained; compact timeline; diff uses semantic success/danger styling plus textual indicators |
| Utility windows | Import, export preview, templates, trash, rename, update, AI, password, confirm, and color/date pickers share dialog and control contracts |
| Plugin views | Nevo-owned host frame, title, loading, permission, and error states update; sandbox content remains untouched |
| Mobile | Dedicated library, boards, more, note details, and editor chrome; bottom navigation; fullscreen dialogs; safe areas and 44px targets |

## 14. Responsive Behavior

The existing `useDeviceLayout` model remains authoritative:

- Phone `<720px`: one-column layouts, dedicated mobile views, bottom navigation, fullscreen dialogs, 12px horizontal padding.
- Tablet `720–1099px`: compact header, 16px padding, 248px sidebar when shown, drawer navigation below 960px.
- Desktop `>=1100px`: complete shell, 272px navigation width, optional right inspector, 18px shell padding.

Asymmetric onboarding and home layouts collapse to a strict single column below 768px. No required action may exist only on hover. Narrow layouts must avoid horizontal scrolling and preserve long translated labels.

## 15. Accessibility Requirements

- Add or preserve a skip route to the primary content where the shell structure makes it useful.
- Maintain hierarchical headings and semantic landmarks.
- All icon-only controls have `aria-label` or an equivalent accessible name.
- Decorative icons are hidden from assistive technology.
- Every focusable element has a visible `:focus-visible` treatment with at least 3:1 contrast.
- Overlays cannot cover the focused element.
- Touch, pointer, and keyboard alternatives exist for drag-adjacent and menu actions.
- Destructive actions keep confirmation or undo behavior.
- Light and dark native controls set explicit background and foreground colors.
- Dark theme applies an appropriate `color-scheme`.
- User zoom remains enabled.

## 16. Implementation Slices

1. Characterization tests and solid-surface compatibility resolver.
2. Primitive, semantic, and component tokens plus the new surface stylesheet.
3. Shared controls, modal, menus, popup positioning, toast, and focus behavior.
4. Workspace shell, titlebar, sidebar, home, search, and responsive navigation.
5. Onboarding and all workspace/settings panels.
6. Editor chrome, overlays, document controls, databases, and query blocks.
7. Graph, Canvas, Draw, Kanban, and History.
8. Import/export previews, templates, trash, update, AI, password, and remaining utility dialogs.
9. Mobile-specific views and cross-feature responsive polish.
10. Remove temporary CSS aliases, run the full accessibility/visual audit, update documentation and changelog, and refresh graphify.

Each slice must leave unmigrated screens usable through the temporary opaque aliases. A slice does not advance while it has a keyboard, contrast, settings-compatibility, overflow, or WebKitGTK regression.

## 17. Testing Strategy

Behavioral changes follow test-first development.

### 17.1 Automated coverage

- Unit tests for resolving legacy Glass to Solid without mutating stored settings.
- TypeScript and Rust default/normalization tests for new Solid defaults, missing values, invalid values, legacy Glass, unknown fields, and explicit user changes.
- Style-contract test proving production UI files no longer contain `backdrop-filter`; temporary alias allowances must be explicit and removed before completion.
- Component tests for shared buttons, inputs, modal, confirm dialog, popup menu, keyboard navigation, focus trap, Escape behavior, and focus restoration.
- Focused tests for WorkspaceShell, onboarding, editor overlays, settings navigation, Graph, Canvas, Draw, Kanban, History, and mobile navigation.
- Locale consistency tests for all registered locales when appearance or accessibility copy changes.
- Existing editor serialization and persistence suites remain unchanged unless implementation touches their code paths; if touched, required load-bearing suites run.

### 17.2 Required commands

- Focused Vitest commands while implementing each slice.
- ESLint on changed TypeScript and Vue files.
- `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts` for locale changes.
- `pnpm lint`.
- `pnpm test:run`.
- `pnpm build`.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and targeted/full Rust tests if Rust settings defaults change.
- `.codex/skills/nevo-verify-change/scripts/verify_change.sh --run --full` because the redesign is cross-cutting and release-sensitive.
- `git diff --check` and final scoped diff review.
- `graphify update .` after source and project documentation changes.

### 17.3 Visual QA matrix

Exercise both themes at:

- 1440x900 desktop;
- 960x800 constrained desktop/tablet;
- 390x844 phone.

Check default, hover, active, selected, focus-visible, disabled, loading, empty, error, overflow, menu, popover, dialog, editor selection, and long localized content where applicable.

Use Chromium for repeatable viewport capture and Tauri/WebKitGTK for the shell, editor, settings, overlay, scroll, and focus paths. A browser capture alone is insufficient for platform-dependent claims.

## 18. Acceptance Criteria

- All registered route families and listed utility windows use the solid design system.
- Production CSS contains no `backdrop-filter` or glass token consumer.
- No visible setting offers Glass or Reduce Transparency.
- Light and dark theme screenshots show the same hierarchy and complete interaction states.
- Existing Glass settings load as Solid without an unsolicited save.
- New and missing surface settings default to Solid consistently in Rust and TypeScript.
- Unknown settings fields and plugin settings survive a settings round trip.
- Keyboard-only operation covers navigation, menus, dialogs, search, and primary feature actions.
- No tested phone surface has accidental horizontal overflow or inaccessible controls.
- Reduced-motion behavior is visibly stable.
- Focused checks, full frontend gates, applicable Rust checks, visual QA, and diff checks are reported with actual results.
- `changes.md` is updated only after successful implementation verification.

## 19. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Large existing dirty tree causes accidental overwrite | Inspect scoped diffs before each slice; edit only requested files; never reset user work |
| Token replacement causes low-contrast combinations | Define semantic pairs per theme and verify normal text, UI boundaries, and focus contrast |
| Legacy Glass value becomes unreadable or rewrites settings | Keep enum compatibility; resolve at display boundary; test no-write load behavior |
| Removing blur exposes hidden layering assumptions | Introduce explicit surface hierarchy and dividers before removing aliases |
| Feature-local CSS drifts from shared design | Migrate shared states first and forbid new private palette tokens in feature styles |
| Responsive regressions across desktop/mobile branches | Use existing capability composable and test 1440, 960, and 390 widths |
| Chromium validation misses WebKitGTK behavior | Run representative shell/editor/settings flows in the Tauri app |
| Scope expands into a rewrite | Preserve routes, state owners, component APIs, and feature behavior; restructure only when semantics or reuse require it |

## 20. Final Decisions

- Migration approach: tokens, then primitives, then screens.
- Visual direction: solid tonal editorial UI.
- Default surface: Solid.
- Legacy Glass: supported as input and rendered as Solid without eager persistence.
- Tinted: opaque tonal surface.
- Typography: Geist application chrome; optional Instrument Serif document content only.
- Motion: restrained, functional, reduced-motion safe.
- Dependencies: no additions.
- Open design decisions: none.
