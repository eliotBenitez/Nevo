# Borderless UI Redesign Design

**Status:** Approved design
**Date:** 2026-09-22, revised 2026-09-23 (Solid direction replaced by Borderless after visual review)
**Scope:** Nevo frontend UI/UX across every existing route, feature surface, dialog, overlay, and responsive layout
**Visual reference:** `docs/design/nevo-reference.html` (open in a browser; theme and accent are switchable)

## 1. Purpose

Replace Nevo's glass-led visual language with one coherent borderless interface that works in light and dark themes without changing product capabilities, route behavior, editor data ownership, or workspace content.

The redesign must feel like a focused editorial tool rather than a collection of translucent cards. It uses opaque surfaces, tone, spacing, and restrained elevation to communicate hierarchy — not blur and not 1px dividers. Every existing screen and window remains functional and recognizable while sharing one component and interaction language.

## 2. Desired Outcomes

- No production UI surface uses `backdrop-filter`, translucent glass panels, neon glow, or ambient blur.
- Borderless is the only surface style. There is no user-facing surface-style choice.
- Structural 1px dividers are removed from chrome, lists, inspector, settings, dialogs, and feature toolbars; separation comes from tone and spacing.
- Light and dark themes use the same semantic hierarchy rather than separate one-off palettes.
- Shared primitives own interactive states; feature CSS owns layout and feature-specific presentation only.
- All 15 registered routes and their modal, popup, mobile, loading, empty, and error states are covered.
- Existing workspaces and settings continue to load without destructive migration or automatic rewrites.
- Keyboard operation, focus visibility, non-text contrast, touch targets, reduced motion, and responsive behavior improve or remain intact.
- The change introduces no new runtime dependency.

## 3. Non-Goals

- No change to note content, ProseMirror schema, canvas persistence, workspace manifest shape, or import/export formats.
- No change to route URLs, hotkey assignments, plugin protocols, Tauri permissions, or backend command APIs.
- No restyling inside third-party sandboxed plugin content; only the Nevo-owned host frame and states are in scope.
- No return of removed collaboration, cloud workspace, shared storage, team, or OAuth features.
- No replacement of Vue, existing Pinia stores, Lucide Vue icons, or the current responsive capability model.
- No native window translucency (macOS vibrancy, Windows Mica).

## 4. Current-State Evidence

Observed from the current working tree:

- `src/router/index.ts` registers 15 routes spanning onboarding, workspace, notes, canvas, history, graph, kanban, plugin views, and drawing.
- `src/app`, `src/features`, and `src/ui` contain 183 Vue components.
- 80 frontend files contain 416 uses or declarations related to `--glass-*`, `backdrop-filter`, or associated blur behavior.
- `src/styles/tokens.css` currently maps several semantic surfaces back to `--glass-*` tokens.
- `src/styles/base.css` contains global transparency, background-scene, surface-style, and sidebar-style behavior.
- `src/types/workspace.ts` persists `SurfaceStyle` as `glass | solid | tinted`; TypeScript defaults (`src/utils/workspace-settings/defaults.ts`) and Rust defaults (`src-tauri/src/commands/workspace/types.rs`) both select `glass`.
- `src/utils/apply-workspace-style.ts` writes `appearance.surfaceStyle` to the root `data-surface` attribute.
- `src-tauri/src/commands/workspace/settings.rs` normalizes `surfaceStyle` to `glass | solid | tinted` and `accentPreset` to `violet | ember | sage | ocean | rose`, falling back to `glass` and `violet`. The TypeScript default accent is `azure`, which the Rust allow-list does not contain (pre-existing inconsistency; see §9.5).
- `src/composables/useDeviceLayout.ts` defines phone as `<720px`, tablet as `720–1099px`, desktop as `>=1100px`, drawer navigation below `960px`, and fullscreen dialogs below `720px`.
- The repository already contains a large user-owned dirty working tree. Redesign changes must preserve and build on it rather than reset or rewrite unrelated work.

Browser-only Vite preview cannot fully represent the application because startup depends on Tauri IPC; visual verification must therefore include the Tauri app or deterministic UI harnesses in addition to browser fixtures.

## 5. Design Direction

The approved direction is a calm borderless productivity interface built on a **frame and island** model:

- **Frame:** titlebar, sidebar, inspector, settings navigation, and mobile bottom navigation share one navigation tone. They are not separated from each other by lines.
- **Island:** the primary content region (editor, home, history diff, graph, canvas, board) sits on a rounded canvas-tone island inset 8px from the frame. In light theme the island is lighter than the frame; in dark theme it is deeper.
- warm paper-like light canvas; graphite, never pure-black, dark canvas;
- one active accent at runtime, with **Mineral** (muted teal) as the default for new workspaces;
- Geist for application chrome; Geist Mono for numeric comparisons, shortcuts, paths, and technical values; Instrument Serif only for document content when selected by the user;
- asymmetry on onboarding and home, predictable geometry in dense work areas;
- tone and spacing before shadows; shadows only for objects that are dragged or float above content;
- cards only when an object is independently movable, selectable, or elevated by behavior.

## 6. Token Architecture

The styling system uses three layers.

### 6.1 Primitive tokens

`src/styles/tokens.css` owns raw neutral, accent, status, spacing, radius, shadow, typography, and duration values. Primitive color values do not encode component meaning.

The neutral palette stays consistently warm in light mode and neutral graphite in dark mode. Pure black, oversaturated accents, purple/blue glow treatments, and gradient text are excluded.

Accent presets store hue and chroma only. Lightness is fixed per theme (reference values: `oklch(0.50 c h)` light, `oklch(0.76 c h)` dark) so every preset keeps button, link, and focus contrast.

### 6.2 Semantic tokens

Theme classes assign primitives to purpose-based tokens:

- `--surface-canvas` (island)
- `--surface-navigation` (frame)
- `--surface-panel`
- `--surface-subtle` (filled controls, hover, grouped regions)
- `--surface-raised`
- `--surface-overlay`
- `--surface-selected`
- `--surface-danger`, `--surface-success`, `--surface-warning`
- `--text-primary`, `--text-secondary`, `--text-muted`, `--text-on-accent`
- `--border-subtle`, `--border-default`, `--border-strong` (for the retained contours in §10.3 only)
- `--focus-ring`
- `--shadow-raised`, `--shadow-overlay`
- `--scrim`

Reference values for both themes are in `docs/design/nevo-reference.html`. Light and dark themes override semantic tokens, not component selectors.

### 6.3 Component tokens

Shared component styles map semantic tokens to component contracts, for example:

- `--button-bg`, `--button-fg` (outline variant becomes a tonal fill)
- `--input-bg`, `--input-ring`
- `--menu-bg`, `--menu-shadow`
- `--modal-bg`, `--modal-shadow`
- `--frame-bg`, `--island-bg`, `--island-radius`, `--island-inset`

Feature styles consume semantic or component tokens and do not introduce private color systems.

### 6.4 Temporary compatibility aliases

During implementation, legacy `--glass-*`, `--line-*`, `--text-1..4`, `--canvas-*`, and related variables point to opaque semantic tokens so unmigrated consumers remain usable. Before completion, every consumer under `src/` migrates to the semantic tokens; `src/styles/no-backdrop-filter.test.ts` fails if a legacy name appears anywhere outside `src/styles/tokens.css`. The aliases themselves stay defined in `tokens.css` as a deprecated compatibility layer, because a user's `.nevo/custom.css` may reference them and must not silently break. `--text-4` maps to `--text-muted` (not `--text-disabled`) so legacy hint text keeps readable contrast. The migration table is in the reference's "Glass → Borderless" section.

## 7. Style Module Responsibilities

| File or area | Single responsibility |
| --- | --- |
| `src/styles/tokens.css` | Primitive and semantic theme tokens only |
| `src/styles/surfaces.css` | Frame, island, raised, and overlay surface contracts |
| `src/styles/base.css` | Global document layout, theme attributes, density, motion, scrollbars, focus policy |
| `src/styles/primitives.css` | Button and generic control styling |
| `src/styles/nv-modal.css` | Modal scrim, panel geometry, responsive placement, and modal transitions |
| `src/styles/ui.css` | Shared non-modal UI utilities and remaining reusable presentational patterns |
| `src/styles/app/**` | Workspace shell and app-component layout |
| `src/styles/editor/**`, `src/styles/editor-prose/**` | Editor chrome and document-specific presentation |
| `src/styles/features/**`, feature-local styles | Feature layout and domain-specific visualization only |

`src/main.ts` imports the new surface layer between `base.css` and shared primitives. No global feature CSS is added back to startup; current route-level CSS splitting remains intact. Background scenes and surface-style selectors are removed from `base.css`.

## 8. State Ownership and Data Flow

No new shared state is introduced.

- `useThemeStore` remains the authority for resolved light/dark theme and app-level accessibility attributes.
- `useWorkspaceStore` remains the authority for persisted workspace appearance settings.
- `applyWorkspaceStyle` remains the boundary that translates persisted appearance into DOM data attributes. It stops emitting `data-surface` (or emits a constant), because surface style no longer varies.
- Vue components select variants through props, classes, and existing typed callbacks.
- CSS consumes theme and appearance attributes and owns presentation.

Components must not duplicate theme state locally. Feature code must not read raw colors or decide whether a shadow is appropriate; it selects a semantic surface or component variant.

## 9. Persisted Settings Compatibility

### 9.1 Existing shape

Workspace settings persist `appearance.surfaceStyle` as `glass`, `solid`, or `tinted`, and `appearance.accentPreset` as a string. App config may also persist `reduceTransparency`.

### 9.2 Surface style

- Rendering ignores `surfaceStyle`; every value renders Borderless.
- The field stays in the TypeScript and Rust types and is read, normalized, and written back unchanged. No schema bump and no new enum value.
- New workspace defaults and the missing/invalid fallback change from `glass` to `solid` in both TypeScript and Rust, so a rollback to an older build shows an opaque UI instead of glass.
- Existing `glass` and `tinted` values are never rewritten merely by opening a workspace.
- The "Surfaces" settings row, its settings-search entry, and its locale keys are removed. `reduceTransparency` remains readable and round-trippable, but its UI control is removed.
- The same treatment applies to the other visual-variant settings that contradict a single style: `appearance.backgroundScene` (`aurora | paper | studio | plain`) and `appearance.sidebarStyle` (`floating | solid | minimal`). They stay in the persisted shape, are round-tripped unchanged, are ignored by rendering, and lose their settings rows, search entries, and locale keys. `applyWorkspaceStyle` emits constant `data-surface`, `data-scene`, and `data-sidebar` values until slice 2 removes the selectors that read them. `contrastMode` and the sidebar layout setting (docked/floating panel) remain user choices.

### 9.3 Accent preset

- A new preset `mineral` is added to the TypeScript `AccentPreset` union, the settings UI, and the Rust normalization allow-list.
- `mineral` becomes the default for new workspaces and the missing/invalid fallback, coordinated between TypeScript and Rust.
- Existing stored presets are kept as-is. Adding `mineral` to the Rust allow-list is required: without it, a saved `mineral` value would be normalized to the old fallback.
- Older builds do not know `mineral` and fall back to their own default on read; that is acceptable and non-destructive.

### 9.4 Migration ownership and writes

There is no eager migration and no schema bump. Compatibility is owned by the existing normalization and presentation boundaries. A settings file is written only through the existing explicit update path. Unknown workspace settings and plugin settings remain preserved exactly as today.

### 9.5 Pre-existing inconsistency

The TypeScript default accent (`azure`) is not in the Rust allow-list (whose fallback is `violet`). Making `mineral` the coordinated default in both layers resolves the default case. Whether `azure` should also be added to the Rust allow-list is decided during slice 1, with a test either way.

### 9.6 Failure behavior

- Missing or invalid values fall back to the coordinated Rust and TypeScript defaults (`solid`, `mineral`).
- A failed settings save leaves the in-memory error behavior unchanged and must not trigger a compensating destructive rewrite.
- No note, manifest, SQLite, asset, or editor persistence path participates in this redesign.

## 10. Visual System

### 10.1 Surface hierarchy

1. Frame: window background, titlebar, sidebar, inspector, settings navigation, mobile bottom navigation.
2. Island: page or content region, inset 8px from the frame with the large radius.
3. Subtle: filled inputs, tonal buttons, hover, grouped regions.
4. Selected: active navigation item or tab — island tone plus `--shadow-raised`, stronger text weight, accent icon. No rail marker.
5. Raised: draggable cards and floating tool panels.
6. Overlay: modal, menu, command palette, and popover surfaces. In dark theme overlays are lighter than what they cover, because shadows are barely visible there.

### 10.2 Separation without lines

- List rows, inspector sections, settings rows, dialog header/body/footer, and toolbar groups are separated by 12–20px spacing, section labels, and hover tone.
- Tabs are tonal pills; the active tab is island tone with a raised shadow.
- Dialogs have no header or footer divider; the footer is not a separate tinted band.

### 10.3 Retained contours

Contours remain only where they carry meaning or affordance:

- checkbox and radio outlines (WCAG 1.4.11 non-text contrast ≥ 3:1);
- the focus ring;
- drag drop targets (dashed accent);
- canvas frames (dashed) and user-drawn shapes;
- history diff stripes (inset, with sign and text label);
- data grids inside documents (database and table blocks keep row hairlines for scanning);
- device and plugin content boundaries where Nevo cannot control the content inside.

Removed borders are written as `border-color: transparent` rather than `border: 0` on overlays, cards, and the island, so Windows forced-colors mode renders visible structure automatically.

### 10.4 Radius and spacing

- Radius scale: 8px (controls), 12px (menus, cards, floating panels), 16px (dialogs, island), after the existing roundness multiplier.
- Pill geometry is limited to statuses, compact filters, and true segmented controls.
- Spacing follows the existing 4px-derived rhythm and current compact/comfortable density setting. Compact density is the recommended escape hatch for dense trees and long settings pages.
- Desktop controls use 28–36px heights; touch layouts use at least 44px hit targets.

### 10.5 Typography

- Application headings use Geist with weight and color for hierarchy, not oversized display type.
- Application chrome never uses serif.
- Long headings use balanced or pretty wrapping where supported.
- Numeric comparison columns use tabular figures.
- User content supports short, normal, and very long strings without breaking layout.

### 10.6 Accent and status colors

Only one workspace accent is active at a time. Accent presets remain a user capability, but glow tokens and outer glow treatments are removed.

Success, warning, and danger remain semantic status colors rather than additional decorative accents. Status is always communicated by text, icon, sign, or pattern in addition to color.

## 11. Component Contracts

### 11.1 Interactive states

Shared controls implement this priority: disabled, loading, active, focus-visible, hover, default.

Every interactive component supports relevant default, hover, active, focus-visible, disabled, loading, and error states. Active feedback uses a 1px displacement or `scale(0.98)` where it does not disturb layout.

### 11.2 Forms

- Inputs are filled (`--surface-subtle` or a frame-derived tone), not outlined. Focus shows a 2px accent ring; error shows a danger fill plus a danger ring.
- Visible labels sit above fields unless an established compact toolbar pattern requires an accessible name instead.
- Helper and error text sits below the field. Errors set `aria-invalid` and connect through `aria-describedby`.
- Correct input type, `name`, `autocomplete`, `inputmode`, and spellcheck behavior are preserved or added. Paste is never blocked.

### 11.3 Buttons

Variants are Primary, Secondary, Tonal (replaces Outline), Ghost, and Danger. Icon-only buttons require an accessible name. Navigation uses links or router links; actions use buttons.

### 11.4 Menus and popovers

Menus use opaque overlay surfaces without a hairline, viewport-aware positioning, roving keyboard navigation, Escape dismissal, and deterministic focus restoration. Group separators are spacing, not lines. They must not depend on hover for required actions.

### 11.5 Dialogs

- Desktop dialogs are centered opaque panels with the large radius and `--shadow-overlay`.
- Phone dialogs are full-width sheets or fullscreen flows, depending on information density.
- Scrims darken without blur.
- Dialogs trap focus, close with Escape when safe, restore focus, contain overscroll, and respect safe-area insets.
- Header, scrollable body, and footer follow one shared layout contract without dividers.

### 11.6 Loading, empty, and error states

- Loading uses skeletons matching the final geometry; spinners remain only for compact in-control progress.
- Empty states name the missing content and the next available action.
- Error messages describe both the problem and a next step.
- Async status announcements use an appropriate live region.

## 12. Motion

- Standard durations: 100–220ms.
- Animate transform and opacity; color, background, and shadow transitions list explicit properties.
- Do not use `transition: all`.
- Avoid ambient perpetual motion in document and workspace views.
- Loading shimmer exists only while loading and stops under reduced motion.
- View transitions and feature transitions remain interruptible.
- `prefers-reduced-motion` and the existing app motion setting disable non-essential motion.

## 13. Screen and Window Coverage

| Area | Target treatment |
| --- | --- |
| Onboarding | Asymmetric split: actions on the island, recent workspaces on the frame tone; common progress, action, and error patterns across welcome, create, open, and mobile flows |
| Workspace shell | Frame for titlebar/sidebar/inspector, island for content; active document indicated by island tone and raised shadow |
| Home | Compact editorial hero, asymmetric recent/favorites regions, and a horizontal quick-action rail rather than equal card grids |
| Editor | Quiet island; overlay formatting toolbar, slash menu, find bar, link/embed/math/query popovers; inspector sections separated by spacing |
| Editor databases and queries | Shared controls for toolbar, filter, sort, settings, cards, charts, lists, import, and query result states; data grids keep row hairlines |
| Settings | Full-screen view like version history, not a modal: frame-tone navigation with a back button plus island content; rows separated by spacing and section labels; no Surfaces or Reduce Transparency rows |
| Archive (trash) | Full-screen view like version history, not a modal: frame-tone list grouped by deletion date plus an island with the selected item's read-only preview, Restore, and Delete forever; only the destructive confirmations stay modal |
| Search | Opaque command palette with a filled search field, grouped results, keyboard selection, truncation, and explicit loading/empty/error states |
| Graph | Full island canvas with floating raised top bar, filter panel, and zoom controls |
| Canvas | Dot grid on the island; floating toolbar, properties, minimap, export, link picker, and presentation controls without hairlines |
| Draw | Toolbar and properties use the same control dimensions, selected states, and contrast as Canvas |
| Kanban | Tonal column zones without borders; cards raised because they are draggable; dragged card lifts to overlay shadow with an accent ring; board/card dialogs, calendar, table, filters, sorting, and automations use shared primitives |
| History | Timeline on the frame tone, diff on the island; diff rows use inset stripes, signs, and text labels |
| Utility windows | Import, export preview, templates, rename, update, AI, password, confirm, and color/date pickers share the dialog and control contracts |
| Plugin views | Nevo-owned host frame, title, permission, loading, and error states update; sandbox content remains untouched |
| Mobile | Dedicated library, boards, more, note details, and editor chrome; frame-tone bottom navigation; fullscreen dialogs or sheets; safe areas and 44px targets |

## 14. Responsive Behavior

The existing `useDeviceLayout` model remains authoritative:

- Phone `<720px`: one-column layouts, dedicated mobile views, bottom navigation, fullscreen dialogs, 12px horizontal padding. The island inset collapses to 0; the content region fills the viewport.
- Tablet `720–1099px`: compact header, 16px padding, 248px sidebar when shown, drawer navigation below 960px.
- Desktop `>=1100px`: complete shell, 244–272px navigation width, optional right inspector, 8px island inset.

Asymmetric onboarding and home layouts collapse to a strict single column below 768px. No required action may exist only on hover. Narrow layouts must avoid horizontal scrolling and preserve long translated labels.

## 15. Accessibility Requirements

- Add or preserve a skip route to the primary content where the shell structure makes it useful.
- Maintain hierarchical headings and semantic landmarks.
- All icon-only controls have `aria-label` or an equivalent accessible name. Decorative icons are hidden from assistive technology.
- Every focusable element has a visible `:focus-visible` treatment with at least 3:1 contrast.
- Form controls whose only boundary was a border keep a boundary or fill that meets 3:1 non-text contrast against the adjacent surface.
- Windows forced-colors mode shows island, overlay, and card boundaries (see §10.3).
- Overlays cannot cover the focused element.
- Touch, pointer, and keyboard alternatives exist for drag-adjacent and menu actions.
- Destructive actions keep confirmation or undo behavior.
- Light and dark native controls set explicit background and foreground colors. Dark theme applies an appropriate `color-scheme`.
- User zoom remains enabled.

## 16. Implementation Slices

1. Characterization tests; `solid` default and `mineral` accent coordinated in TypeScript and Rust; surface style removed from rendering and settings UI.
2. Primitive, semantic, and component tokens plus the new surface stylesheet (frame, island, raised, overlay).
3. Shared controls, modal, menus, popup positioning, toast, and focus behavior.
4. Workspace shell, titlebar, sidebar, home, search, and responsive navigation.
5. Onboarding and all workspace/settings panels.
6. Editor chrome, overlays, document controls, databases, and query blocks.
7. Graph, Canvas, Draw, Kanban, and History.
8. Import/export previews, templates, trash, update, AI, password, and remaining utility dialogs.
9. Mobile-specific views and cross-feature responsive polish.
10. Remove temporary CSS aliases, run the full accessibility/visual audit, update documentation and changelog, and refresh graphify.

Each slice must leave unmigrated screens usable through the temporary opaque aliases. A slice does not advance while it has a keyboard, contrast, settings-compatibility, overflow, forced-colors, or WebKitGTK regression.

## 17. Testing Strategy

Behavioral changes follow test-first development.

### 17.1 Automated coverage

- TypeScript and Rust default/normalization tests: new `solid` and `mineral` defaults, missing values, invalid values, legacy `glass` and `tinted` preserved on round trip, `mineral` accepted by Rust, unknown fields preserved.
- A test proving that opening a workspace with `surfaceStyle: "glass"` does not trigger a settings write.
- Style-contract test proving production UI files no longer contain `backdrop-filter`; temporary alias allowances must be explicit and removed before completion.
- Component tests for shared buttons, inputs, modal, confirm dialog, popup menu, keyboard navigation, focus trap, Escape behavior, and focus restoration.
- Focused tests for WorkspaceShell, onboarding, editor overlays, settings navigation (Surfaces row absent), Graph, Canvas, Draw, Kanban, History, and mobile navigation.
- Locale consistency tests for all registered locales when appearance copy is removed or changed.
- Existing editor serialization and persistence suites remain unchanged unless implementation touches their code paths; if touched, required load-bearing suites run.

### 17.2 Required commands

- Focused Vitest commands while implementing each slice.
- ESLint on changed TypeScript and Vue files.
- `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts` for locale changes.
- `pnpm lint`, `pnpm test:run`, `pnpm build`.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and targeted/full Rust tests, because Rust defaults and normalization change.
- `.codex/skills/nevo-verify-change/scripts/verify_change.sh --run --full` because the redesign is cross-cutting and release-sensitive.
- `git diff --check` and final scoped diff review.
- `graphify update .` after source and project documentation changes.

### 17.3 Visual QA matrix

Exercise both themes at 1440x900 desktop, 960x800 constrained desktop/tablet, and 390x844 phone.

Check default, hover, active, selected, focus-visible, disabled, loading, empty, error, overflow, menu, popover, dialog, editor selection, and long localized content where applicable. Compare against `docs/design/nevo-reference.html`. Check forced-colors emulation in Chromium.

Use Chromium for repeatable viewport capture and Tauri/WebKitGTK for the shell, editor, settings, overlay, scroll, and focus paths. A browser capture alone is insufficient for platform-dependent claims.

## 18. Acceptance Criteria

- All registered route families and listed utility windows use the borderless design system.
- Production CSS contains no `backdrop-filter` or legacy glass-era token consumer (aliases remain only as the custom-CSS compatibility layer), and chrome, lists, settings, and dialogs contain no structural 1px dividers beyond the retained contours in §10.3.
- No visible setting offers a surface style or Reduce Transparency.
- Light and dark theme screenshots show the same hierarchy and complete interaction states.
- Existing `glass`/`tinted` settings load and render Borderless without an unsolicited save, and survive a settings round trip unchanged.
- New and missing values default to `solid` and `mineral` consistently in Rust and TypeScript.
- Unknown settings fields and plugin settings survive a settings round trip.
- Keyboard-only operation covers navigation, menus, dialogs, search, and primary feature actions.
- Forced-colors mode shows the shell, overlays, and cards with visible boundaries.
- No tested phone surface has accidental horizontal overflow or inaccessible controls.
- Reduced-motion behavior is visibly stable.
- Focused checks, full frontend gates, Rust checks, visual QA, and diff checks are reported with actual results.
- `changes.md` is updated only after successful implementation verification.

## 19. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Large existing dirty tree causes accidental overwrite | Inspect scoped diffs before each slice; edit only requested files; never reset user work |
| Without lines, dense areas (long settings, big trees, database grids) lose scannability | Spacing scale plus section labels; hover tone; compact density; data grids keep hairlines |
| Low non-text contrast for filled controls | Verify 3:1 for control fills, checkboxes, radios, and focus ring in both themes |
| Dark theme loses elevation because shadows are invisible | Overlays and raised objects step up in tone, not only in shadow |
| Forced-colors users lose structure | Keep `border-color: transparent` on island, overlays, and cards; test with emulation |
| Legacy settings become unreadable or rewritten | Keep enum compatibility; ignore at render; test no-write load behavior |
| `mineral` normalized away by Rust | Add it to the Rust allow-list with a round-trip test in slice 1 |
| Removing blur and dividers exposes hidden layering assumptions | Introduce frame/island surfaces before removing aliases |
| Feature-local CSS drifts from shared design | Migrate shared states first and forbid new private palette tokens in feature styles |
| Responsive regressions across desktop/mobile branches | Use existing capability composable and test 1440, 960, and 390 widths |
| Chromium validation misses WebKitGTK behavior | Run representative shell/editor/settings flows in the Tauri app |
| Scope expands into a rewrite | Preserve routes, state owners, component APIs, and feature behavior; restructure only when semantics or reuse require it |

## 20. Final Decisions

- Migration approach: tokens, then primitives, then screens.
- Visual direction: borderless frame-and-island UI; the only surface style (decided 2026-09-23 after comparing Solid and Borderless in the visual reference).
- Surface style setting: removed from UI; persisted value preserved and ignored; defaults become `solid` for rollback safety.
- Default accent: new `mineral` preset, coordinated in TypeScript and Rust.
- Typography: Geist application chrome; optional Instrument Serif document content only.
- Motion: restrained, functional, reduced-motion safe.
- Dependencies: no additions.
- Visual reference: `docs/design/nevo-reference.html`.
- Open design decisions: whether `azure` joins the Rust accent allow-list (§9.5), decided in slice 1.
