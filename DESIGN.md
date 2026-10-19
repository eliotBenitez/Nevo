---
name: Nevo
description: A premium, local-first workspace for your knowledge.
colors:
  mineral-teal: "oklch(0.50 0.075 185)"
  mineral-teal-dark: "oklch(0.76 0.075 185)"
  on-accent: "#FFFFFF"
  on-accent-dark: "#10191A"
  island: "#F6F4EF"
  island-dark: "#161718"
  frame: "#EEEBE4"
  frame-dark: "#1C1D1F"
  panel: "#FBFAF7"
  panel-dark: "#1F2022"
  subtle: "#E9E5DC"
  subtle-dark: "#28292C"
  raised: "#FFFFFF"
  raised-dark: "#26272A"
  ink: "#1F1E1B"
  ink-dark: "#EDECE8"
  ink-secondary: "#57544D"
  ink-secondary-dark: "#B5B3AC"
  ink-muted: "#736E66"
  ink-muted-dark: "#8E8C86"
  border-subtle: "#E5E1D8"
  border-subtle-dark: "#2A2B2E"
  border-default: "#D8D2C6"
  border-default-dark: "#35363A"
  border-strong: "#BDB6A8"
  border-strong-dark: "#4B4C52"
  hue-rose: "oklch(0.72 0.06 18)"
  hue-amber: "oklch(0.78 0.07 78)"
  hue-sage: "oklch(0.72 0.05 155)"
  hue-mist: "oklch(0.72 0.04 210)"
  hue-plum: "oklch(0.68 0.06 305)"
  danger: "#B0412F"
  danger-dark: "#E47D6B"
  success: "#2D7A4D"
  success-dark: "#6EC08F"
  warning: "#93650F"
  warning-dark: "#D9A646"
typography:
  display:
    fontFamily: "Geist, -apple-system, 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(30px, 4.4vw, 58px)"
    fontWeight: 650
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist, -apple-system, 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(28px, 3.4vw, 44px)"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist, -apple-system, 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, -apple-system, 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist, -apple-system, 'Segoe UI', system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1
  mono:
    fontFamily: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "4px"
  inner: "6px"
  control: "8px"
  card: "12px"
  island: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.mineral-teal}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "28px"
  button-tonal:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "28px"
  button-ghost:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "28px"
  button-ghost-hover:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: "28px"
  input:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "30px"
  segmented:
    backgroundColor: "{colors.subtle}"
    rounded: "{rounded.control}"
    padding: "2px"
  segmented-item:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.inner}"
    padding: "0 10px"
    height: "26px"
  segmented-item-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  chip:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "20px"
  island:
    backgroundColor: "{colors.island}"
    rounded: "{rounded.island}"
  card-raised:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.card}"
    padding: "12px 14px"
---

# Design System: Nevo

## Overview

**Creative North Star: "The Quiet Desk"**

Nevo is a calm, borderless productivity world built on a frame and an island. The frame (titlebar, sidebar, inspector, settings navigation, mobile bottom bar) is one continuous navigation tone; the content sits on a rounded island inset 8px into it. Separation comes from tone and spacing, not hairlines. The light theme is warm paper; the dark theme is neutral graphite, never pure black. One muted teal accent, Mineral, is the only voice of action and selection, and five muted note hues carry data identity.

Density is desktop-productive: controls are 28–32px tall with 12.5–13px labels, rising to 44px targets on touch. Hierarchy comes from weight and color before size. Geist sets all chrome; Geist Mono marks anything a machine produced (paths, file names, shortcuts, versions, numeric columns). Depth is earned by behavior: only objects that are dragged or float above content get a shadow.

The landing page (`site/`) is one consumer of this world: it renders a single Nevo window (frame plus island) as a sticky stage whose note morphs through document, canvas, graph, kanban and database views. It uses the same tokens, the same Lucide icon grammar, and follows the system color scheme through `prefers-color-scheme`.

**Key Characteristics:**
- Frame-and-island: navigation tone around a rounded canvas-tone island, inset 8px.
- Warm paper light (island #F6F4EF), graphite dark (island #161718).
- One accent at a time, Mineral teal by default; lightness fixed per theme.
- Five muted note hues for data only.
- Geist for chrome, Geist Mono for technical values, Lucide line icons.
- Tone and spacing before shadows; contours only where they carry meaning.
- Light and dark are first-class; neither is derived from the other.

## Colors

Warm, low-chroma neutrals with a single muted teal accent and five quiet data hues.

### Primary
- **Mineral Teal** (`mineral-teal` light, `mineral-teal-dark` dark): the only accent. Primary buttons, links, wiki-links, active segmented-control icon, selected-row tint (12–17% mixed into the frame), focus ring (80% mixed toward text), text selection, the highlighted graph edge. Accent presets change hue and chroma only; lightness stays 0.50 light / 0.76 dark so contrast holds for every preset. Hover mixes 88% accent toward black (light) or white (dark).
- **On Accent** (`on-accent` / `on-accent-dark`): label color on accent fills; white in light, near-black teal in dark because the dark accent is light.

### Secondary
- **Note Hues** (`hue-rose`, `hue-amber`, `hue-sage`, `hue-mist`, `hue-plum`): muted identity colors for notes and categories. They appear as 7–8px dots, 16% tinted area pills with 70%-hue text, graph node fills and halos. They never fill buttons, chrome, or large surfaces.

### Neutral
- **Island** (`island` / `island-dark`): the content island and editor surface; also the page ground on the landing. Not pure white.
- **Frame** (`frame` / `frame-dark`): titlebar, sidebar, inspector, settings nav, kanban column wells, file trees.
- **Panel** (`panel` / `panel-dark`): grouped regions inside content, such as the landing's file preview.
- **Subtle** (`subtle` / `subtle-dark`): filled inputs, tonal buttons, hover, segmented-control track.
- **Raised** (`raised` / `raised-dark`): draggable cards, active segment, floating panels; overlays use the same values.
- **Ink, Ink Secondary, Ink Muted** (`ink*`): primary text, supporting text and leads, metadata and hints.
- **Borders** (`border-subtle`, `border-default`, `border-strong`): retained contours only (see Shapes).

### Status
- **Danger, Success, Warning** (`danger*`, `success*`, `warning*`): semantic status only, always paired with text, icon or sign; soft fills are 12–16% mixes.

### Named Rules
**The One Accent Rule.** Exactly one accent is active at runtime. Note hues are data, status colors are status; neither is a second accent.

**The Fixed Lightness Rule.** Accent presets store hue and chroma only. Lightness is 0.50 in light and 0.76 in dark, always.

**The No Pure Black Rule.** Dark mode is graphite (#161718 and up). No pure black, no glow, no gradient text, no backdrop blur.

## Typography

**Display Font:** Geist (with -apple-system, Segoe UI, system-ui)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (with JetBrains Mono, ui-monospace)
**Document Font (user-selected only):** Instrument Serif (with Cambria, Georgia)

**Character:** One neutral grotesk carries everything; the mono companion signals machine-made values. Serif exists only inside document content when the user chooses it.

### Hierarchy
- **Display** (650, clamp(30px, 4.4vw, 58px), 1.04, -0.035em): the note H1 on marketing surfaces. Inside the app, note titles use weight and color, not oversized display.
- **Headline** (650, clamp(28px, 3.4vw, 44px), 1.08, -0.03em): section headings on marketing surfaces; max ~20ch, balanced wrap.
- **Title** (600, 15px, -0.01em): block and card titles, platform names.
- **Body** (400, 15px, 1.55): running text; leads at 15–17px in ink secondary, max 56–58ch.
- **Label** (500, 12.5–13px, line-height 1): buttons, segmented items, menu and nav rows; captions and metadata 11.5–12.5px.
- **Mono** (400–500, 11–13px): file names, paths, JSON, versions, shortcuts (`kbd`), tabular numbers.

### Named Rules
**The Weight Not Size Rule.** In application chrome, hierarchy comes from weight (500/600/650) and ink tone, not from size jumps.

**The Mono Means Machine Rule.** Geist Mono is reserved for values a machine produced or a user types literally: paths, file names, shortcuts, versions, numeric columns.

## Layout

The app is a frame with an inset island: the island sits 8px from the frame on three sides beneath the titlebar, with the large radius. Asymmetry is allowed on onboarding and home; dense work areas (trees, tables, boards, settings) use predictable geometry. Spacing follows a 4px-derived rhythm (4, 8, 12, 16, 24); list rows, inspector sections and dialog parts are separated by 12–20px gaps rather than dividers. Desktop controls are 28–36px; coarse pointers get at least 44px.

The landing composes one window up to 1400px wide inside a sticky full-height stage (16px outer padding, 52px titlebar, island padding clamp(24px, 4vw, 52px) by clamp(20px, 5vw, 72px)); later sections sit in a 1180px column with clamp(72px, 10vw, 140px) top padding. Breakpoints: 980px (view-switcher labels collapse to icons, table drops the file column) and 720px (titlebar wraps, switcher becomes a full-width row, two-column sections stack, island inset tightens to 4px).

## Elevation & Depth

Tonal layering first; shadows only for things that are dragged or float. The frame-island relationship is pure tone (island lighter than frame in light, deeper in dark). Raised objects (canvas cards, kanban cards, the active segment, the active tab) get a soft two-layer raised shadow; overlays (menus, dialogs, popovers, toasts) get a longer overlay shadow and, in dark mode, a lighter surface than what they cover. Scrims darken without blur.

### Shadow Vocabulary
- **Raised** (light `0 1px 2px rgb(58 48 30 / .08), 0 2px 6px rgb(58 48 30 / .05)`; dark `0 1px 2px rgb(0 0 0 / .40), 0 0 0 1px rgb(255 255 255 / .03)`): draggable cards, active segment and tab, floating tool panels.
- **Overlay** (light `0 14px 36px -10px rgb(48 38 22 / .24), 0 2px 6px rgb(48 38 22 / .08)`; dark `0 18px 44px -12px rgb(0 0 0 / .62), 0 2px 8px rgb(0 0 0 / .34)`): menus, dialogs, popovers, palettes.

### Named Rules
**The Tone Before Shadow Rule.** Surfaces are flat at rest. A shadow means the object moves or floats; static containers never get one.

## Shapes

Soft, consistent corners scaled by the user's roundness multiplier: 4px for keycaps and tiny marks, 6px for inner segments and extra-small buttons, 8px for controls and inputs, 12px for cards, menus and floating panels, 16px for the island and dialogs. Pills (999px) are limited to statuses, compact filters, chips and true segmented controls.

Borders are retained only where they carry meaning: checkbox and radio outlines, the focus ring, dashed drop targets and canvas frames, history diff stripes, data-grid row hairlines, and boundaries around content Nevo does not control. Removed borders are written as `1px solid transparent`, not `0`, so Windows forced-colors mode still draws structure. Icons are Lucide line icons at 16px, 1.75 stroke, round caps and joins, inherited color.

**The Retained Contour Rule.** A line must carry affordance, data structure, or accessibility. Frame regions are never divided from each other by lines.

## Components

### Buttons
Quiet, compact, tonal by default.
- **Shape:** gently rounded (8px), 28px tall (32px medium, 22px extra-small with 6px corners), 12px horizontal padding, 500 weight at 12.5px.
- **Primary:** Mineral fill with on-accent label; hover mixes toward black (light) or white (dark).
- **Tonal (default):** subtle fill, ink label; hover deepens the fill by mixing in 8% ink. Tonal replaces the retired Outline variant.
- **Ghost:** transparent, ink-secondary label; hover takes the subtle fill and ink label.
- **Danger:** danger fill with on-accent label.
- **States:** active presses 1px down; focus-visible draws a 2px focus-ring outline at 2px offset; disabled at 45% opacity; loading shows an inline spinner. Transitions list explicit properties at 100–140ms.

### Segmented Control
- **Track:** subtle fill, 2px padding, 2px gap, 8px corners.
- **Item:** 26–28px tall, 6px corners, 500 weight 12–12.5px, ink-secondary; icon plus label.
- **Active:** raised surface, ink label, raised shadow, accent-colored icon. State is exposed via `aria-pressed` or an active class.

### Chips
- **Style:** 20px pill, 11px 500, ink-secondary on an 8% ink tint with a subtle border.
- **Area pills (data):** 22px pill tinted 16% with a note hue, label mixed 70% hue into ink.

### Cards / Containers
- **Corner Style:** 12px (cards), 16px (island).
- **Background:** raised for movable cards; frame for column wells and trees; panel for grouped previews.
- **Shadow Strategy:** raised shadow only on movable or floating objects (see Elevation & Depth).
- **Border:** transparent in the app; landing cards keep a default hairline.
- **Internal Padding:** 12px 14px for cards.

### Inputs / Fields
- **Style:** filled (subtle), 30px tall, 8px corners, 10px padding, transparent border.
- **Focus:** fill lifts to raised and a 2px accent ring appears.
- **Error:** danger fill plus danger ring; message below the field.

### Navigation
- **Style:** frame-tone rows 30px tall, 13px, ink-secondary, 8px corners. Selected rows take an accent-tinted frame (12% light, 17% dark), ink label, 500 weight, accent icon; no rail marker. Tabs are tonal pills; the active tab is island tone with a raised shadow.

### Keycap
- Geist Mono 10.5–11px, ink-muted, default border with a 2px bottom edge, 4–5px corners.

### Note Block (signature)
A note entry rendered as a hue dot plus a title and a supporting line. The same element re-lays out as a document line, a canvas card, a graph node with a canvas-tone halo ring, a kanban card with an area pill, or a data-grid row with a mono file name. This is how the app's five views share one content model.

## Do's and Don'ts

### Do:
- **Do** set content on the island (#F6F4EF light, #161718 dark) inset 8px from a frame-tone surround.
- **Do** keep Mineral teal as the single accent at oklch(0.50 0.075 185) light and oklch(0.76 0.075 185) dark.
- **Do** use the five note hues only for data identity: dots, area pills, graph nodes.
- **Do** use Geist Mono for paths, file names, shortcuts, versions and numeric columns.
- **Do** draw icons as Lucide line icons at 16px with 1.75 stroke and current color.
- **Do** write removed borders as `1px solid transparent` so forced-colors mode keeps structure.
- **Do** honor `prefers-reduced-motion` by dropping transitions and animations; keep motion at 100–240ms with `cubic-bezier(0.16, 1, 0.3, 1)`.

### Don't:
- **Don't** separate frame regions (titlebar, sidebar, inspector) with divider lines.
- **Don't** put a shadow on a static container; shadows belong to dragged or floating objects.
- **Don't** use pure black, glow, gradient text or backdrop blur.
- **Don't** introduce a second accent or fill chrome with a note hue.
- **Don't** use serif type in application chrome.
- **Don't** use `transition: all`.
