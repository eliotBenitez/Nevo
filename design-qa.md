# Mobile Members Design QA

## Scope

- Viewport: 390 × 844.
- Reference: `/home/malinka/.codex/visualizations/2026/08/03/019fc73a-c224-7b53-a492-f367dd7a5627/nevo-mobile-members.png`.
- Reference invite sheet: `/home/malinka/.codex/visualizations/2026/08/03/019fc73a-c224-7b53-a492-f367dd7a5627/nevo-mobile-members-invite.png`.
- Implementation capture: `/home/malinka/.codex/visualizations/2026/08/03/019fc73a-c224-7b53-a492-f367dd7a5627/nevo-mobile-members-implementation.png`.
- Implementation invite sheet: `/home/malinka/.codex/visualizations/2026/08/03/019fc73a-c224-7b53-a492-f367dd7a5627/nevo-mobile-members-invite-implementation.png`.

## Results

- P0: none.
- P1: none.
- P2: none. The mobile hierarchy, team rows, key states, invite CTA, secure-access panel, bottom-sheet treatment, touch targets, and dark-theme contrast match the selected design direction.
- P3: the production sheet retains the administrator role in addition to editor and viewer so mobile does not lose an existing cloud-storage capability.
- Device chrome is intentionally absent from the web capture; Android owns the status and navigation bars, while the view consumes the configured safe-area insets.

## Interaction Checks

- Header back action emits route navigation.
- The invite action opens a modal bottom sheet and focuses the email field.
- Back dismisses the invite or member-action sheet before leaving the screen.
- Role selection, member removal, and key approval remain connected to the existing shared-storage store operations.
- Invite validation, native sharing/copy fallback, loading, error, and read-only states remain functional.

final result: passed

---

# Note History Design QA

## Scope

- Source of truth: `/tmp/codex-clipboard-mJGzXS.png` (normalized to 1968 × 1248 for comparison).
- Implementation: production History components rendered through the local Vite application harness.
- Desktop evidence: `/tmp/history-qa-light-v4.png` (light) and `/tmp/history-qa-dark-v3.png` (dark), both 1968 × 1248.
- Mobile evidence: `/tmp/history-qa-mobile-light-v3.png` and `/tmp/history-qa-mobile-dark-v3.png`, both 390 × 844.
- Side-by-side evidence: `/tmp/history-qa-comparison-v4.png`.

## Comparison History

- The first pass exposed clipped mobile action labels, low-contrast unchanged text in dark mode, numeric recent dates, a bottom-pinned retention note, and undersized document typography.
- The post-fix pass used short mobile labels, theme-safe text colors, localized Today/Yesterday labels, natural timeline flow, a reference-proportioned sidebar, and larger block-aware typography.
- The checked implementation intentionally omitted the Git commits tab; only saved note versions are supported in this scope.

## Results

- P0: none.
- P1: none.
- P2: none. Desktop hierarchy, proportions, selected-version treatment, diff colors, typography, action placement, and light/dark contrast align with the reference direction.
- P3: the reference's sample content contains more block variants than the deterministic QA fixture; headings, paragraphs, quotes, code, callouts, and lists share the same block-aware renderer and styles.
- Keyboard focus states and responsive 44px action targets are present. Native WebKitGTK capture was unavailable, so the final visual evidence used headless Chromium; the production build and component tests passed.

final result: passed

---

# Tablet Graph Header Design QA — 2026-10-06

## Scope and evidence

- User source: `C:/Temp/codex-clipboard-9edfd92d-8285-47de-9ece-ce76c7b0caff.png` (2002 × 105). Accepted direction: a quieter, compact panel with aligned controls and a visible Back label.
- Design system: `docs/design/nevo-reference.html`, reviewed in the in-app browser, and existing Nevo tokens/primitives.
- Implementation: `src/features/graph/components/GraphHeader.vue`, mounted by the real Android Tauri application in disposable QA workspaces.
- Same-scale source/before/after comparison: `.qa/android/shots/graph-header-comparison.png`. Images retain their original pixels; the user crop is 6px wider and 9px taller than the native header crop, so this is a visual comparison rather than an exact pixel-diff claim.
- Tablet landscape: 1280 × 800 CSS px, DPR 2, comfortable density, four nodes/zero edges, light and dark. Baseline: `graph-tablet-before.png`; final: `graph-tablet-after.png` and `graph-tablet-landscape-dark.png`.
- Tablet portrait: 800 × 1280 CSS px, DPR 2, light/dark: `graph-tablet-portrait-light.png` and `graph-tablet-portrait-dark.png`.
- Phone portrait: 412 × 915 CSS px, DPR 2.625, light/dark: `graph-phone-light.png`, `graph-phone-dark.png`; expanded filters: `graph-phone-filters.png`.
- All screenshots above are under `.qa/android/shots/` and were visually inspected. Search/focus evidence: `graph-tablet-search.png` and `graph-header-keyboard-focus.png`.

## Comparison history

1. Baseline P2, spacing/surfaces: Back was 44px tall, search 30px, and separate filled counter capsules 22px. The different visual sizes made the row feel crowded and inconsistent.
2. Corrected tablet controls to 44px, retained the 48px row, kept the visible localized Back label with a quiet ghost surface, and allowed search to grow to 448px. Counts became one quiet right-aligned group. Native measurements confirmed these dimensions and equal vertical centers.
3. Rechecked landscape/portrait and light/dark. No header overflow or overlap. The requested surface/size changes intentionally differ from the supplied baseline; they are not fidelity defects.

## Mandatory comparison results

- Fonts/typography: existing Geist and Geist Mono retained; tablet search uses readable 14px text, counts retain 11px mono text, and Russian plural labels remain correct. No cramped or wrapped header text in the tested states.
- Spacing/layout: controls share a vertical center, 10px gaps and 12px row padding; counts remain at the right edge. The header consumes the same canvas height as before.
- Colors/tokens: existing island/input/text/accent tokens retained in both themes; focus and active-filter colors remain visible.
- Image quality/assets: no raster assets appear in the scoped header; no replacement imagery or CSS art was introduced. Comparison images are untouched native captures combined into a diagnostic figure.
- Icons: existing Lucide arrow, search, and filter icons retained; the tablet arrow is 16px and optically aligned with its label. Phone icon controls remain 44px.
- Shape/surfaces: tablet Back and counters no longer resemble extra filled buttons; search retains the existing input radius and focus treatment. Desktop capsule styles and phone floating controls remain in their original breakpoint rules.
- Viewport resilience: Android tablet landscape/portrait and phone portrait passed without overlap; phone filter expansion/collapse still works. Native Windows/WebKitGTK and a physical tablet were not tested in this pass.
- Copy/content: existing localized strings were reused; no new translation keys. Reactive counts and Russian singular/few/many forms passed component coverage.
- States/accessibility: touch Back navigated to the workspace; search accepted OS-level input and visibly dimmed nonmatching graph nodes; Shift+Tab reached Back with a visible 2px outline; phone filter pressed state and expansion/collapse worked. Back/search have accessible names, decorative icons are hidden from assistive technology, and tablet hit regions are 44px tall.

## Verification and limitations

- Passed: all seven graph test files (22 tests), ESLint on the four scoped TS/Vue files, frontend type check/build/bundle budgets, x86_64 debug APK build/install/launch, scoped and full `git diff --check`, and `graphify update .`.
- Separate baseline failure: `src/styles/tailwind-cascade.test.ts` expects a high-contrast focus selector absent even in HEAD's `src/styles/base.css`. The other four style-contract tests passed; shared styles were not changed for this task.
- Test-tool limitation: CDP `Input.insertText` did not enter text despite focusing the input. OS touch plus `adb shell input text` confirmed actual Android search input and graph response. Hardware focus navigation does not prove a physical external keyboard or vendor-specific IME behavior.
- No remaining P0/P1/P2 finding in the scoped Android header. Full frontend/Rust suites and desktop native QA were not run; no Rust implementation changed in this task.

final result: passed

---

# Canvas Shape Button Borders Design QA — 2026-10-06

## Requested scope and evidence

- User explicitly selected: remove only the square frames around rectangle, ellipse, and diamond buttons. The component boundary, labels, events, canvas layout, and document positioning were not redesigned.
- Source: `C:/Temp/codex-clipboard-c4c4c7a8-7143-4036-978b-6f09e4da52ed.png` (2035 × 1401). A source toolbar crop and same-scale Android before/after captures were inspected together in `.qa/android/shots/canvas-shapes-comparison.png`.
- Implementation: `src/features/canvas/components/CanvasShapeMenu.vue`. It reused the existing neighboring tool-button styles from `CanvasToolbar.vue`; no state or persistence implementation changed.
- Actual Android WebView: tablet landscape 1280 × 800 / portrait 800 × 1280 CSS px, DPR 2, light/dark; phone portrait 412 × 915 CSS px, DPR 2.625, light. Tablet captures: `canvas-shapes-after.png`, `canvas-shapes-active.png`, `canvas-shapes-dark.png`, `canvas-shapes-tablet-light.png`, `canvas-shapes-tablet-portrait-light.png`, and `canvas-shapes-tablet-portrait-dark.png`. Phone: `canvas-shapes-phone-light.png`. All are in `.qa/android/shots/` and were visually inspected.
- `canvas-shapes-phone-dark.png` captured a different route and was excluded from evidence. Phone dark, Windows/WebView2, Linux/WebKitGTK, and physical-device checks remain unverified.

## Comparison history and mandatory surfaces

- Baseline P2: all three buttons had native `2px outset` borders, gray fills, black icons, and a 26.5px height, unlike surrounding tools.
- Final measurements: border width `0px`, transparent inactive background, 34 × 34px on tablet and 44 × 44px on phone. The selected tool uses the same accent icon, subtle fill, and inset selected treatment as neighboring tools; exactly one shape had `aria-pressed=true` after each touch selection.
- Fonts/typography: no text, typography, translation key, or percentage label changed.
- Spacing/layout: three shape buttons now align with their neighboring tools; toolbar placement, grouping, scrolling, and the clipped document frame are outside this requested change.
- Colors/tokens: reused existing neutral, accent, hover, selected, disabled, and keyboard-focus treatment. Light/dark tablet captures confirmed readable icons and visible selection.
- Image quality/assets: no raster assets in the scoped controls; existing Lucide vector icons retained without substitutes. The comparison figure preserves original pixels.
- Icons/shape/surfaces: rectangle, ellipse, and diamond remain recognizable at 17px; browser frames were removed while selected and focus indicators remain visible.
- Responsiveness/accessibility: preserved semantic buttons, accessible labels, title tooltips, and pressed-state events. Keyboard focus remained visible; the V shortcut restored select mode. Tablet orientations and phone light control sizing passed.

## Checks and separate finding

- Passed: all 13 canvas test files (48 tests), changed-file ESLint, frontend type/build/bundle checks, x86_64 and ARM64 debug APK builds, x86_64 install/Android runtime launch, scoped diff review/check, and `graphify update .`. The jsdom canvas warning did not fail any test; actual rendering was checked in Android.
- No implementation-mirroring CSS class test was added. Native computed-style assertions checked border widths, backgrounds, sizing, and selection directly.
- Separate existing P1 interaction defect: toolbar pointer-down events can reach `useCanvasInteractionRouting` / `useCanvasCreationGestures`, causing an object under the toolbar when changing from an active shape tool. Existing `CanvasToolbar`/`CanvasControls` did not stop that event before this CSS change. The defect was reported separately because the user limited this task to borders. The two shapes created by the QA button switches were undone; `canvas-shapes-final-clean.png` confirmed their removal. No remaining P2 border mismatch.
- Broad frontend/Rust suites were not run for this one-component style change; physical ARM64 runtime was not verified.

final result: passed

# Notebook recent colors — 2026-10-06

Scope: removed duplicate recent-color swatches beside the notebook toolbar picker, as requested in `C:/Temp/codex-clipboard-d221972e-b20d-45f3-bae6-56cf10fa5a46.png`. The toolbar reuses `NotebookColorControl` with `showQuick=false`; palette persistence, built-in colors, presets, and recent colors inside the picker were retained.

## Evidence and comparison

- Real Android WebView on `nevo-tablet`: landscape 1280 × 800 and portrait 800 × 1280 CSS px, DPR 2, light/dark. The same disposable notebook and black/yellow recent colors were used before and after.
- Paired dark landscape captures: `.qa/android/shots/notebook-recents-before.png` and `notebook-recents-after-dark-landscape.png`. Before: two external recent swatches beside the trigger; after: one trigger and zero external recent groups, while the open picker still displayed both recent colors.
- Additional captures: `notebook-recents-light-landscape.png`, `notebook-recents-light-portrait.png`, and `notebook-recents-dark-portrait.png` in the same directory. Every capture was visually inspected.
- Fonts/typography: existing labels and sizes retained. Spacing/layout: the width and paper controls moved into the space freed by the duplicate row. Colors/tokens: existing trigger, picker, and selected-color treatment retained in both themes. Assets/image quality: no raster assets changed. Icons/shape/surfaces: the existing swatch trigger and palette surfaces remained intact.

## Interactions and checks

- Touch-selecting yellow from the Recent section updated the toolbar trigger to `rgb(240, 196, 25)` and closed the picker; black was restored through the same UI. No ink was added.
- Escape dismissed the picker. Tab / Shift+Tab returned to the named color trigger with `:focus-visible=true` and a visible 2px focus outline.
- Passed: 24 focused tests covering toolbar, color control, and palette; changed-file ESLint; frontend type/build/bundle checks; x86_64 and ARM64 debug APK builds; x86_64 installation and Android runtime launch; final scoped diff review and `git diff --check`.
- No failures in the scoped checks. Phone, Windows/WebView2, Linux/WebKitGTK, physical ARM64 runtime, and broad frontend/Rust suites were not checked for this narrow toolbar change. Existing dirty responsive-toolbar and icon-migration changes were preserved.
- Restored the tablet's original dark theme, landscape orientation, black pen color, and notebook route; left the running QA emulators available to the user.

final result: passed
