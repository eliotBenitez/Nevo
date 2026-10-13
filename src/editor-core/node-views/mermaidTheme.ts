// Mermaid "paper" theme: diagrams are drawn from the app's design tokens so they
// follow light/dark mode and the workspace accent instead of Mermaid's stock palette.

export interface MermaidThemeConfig {
  theme: 'base' | 'dark' | 'neutral'
  themeVariables?: Record<string, string | boolean>
}

const FONT = "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('theme-dark')
}

let probe: HTMLSpanElement | null = null
let context: CanvasRenderingContext2D | null | undefined

function getContext(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    try {
      context = canvas.getContext('2d', { willReadFrequently: true })
    } catch {
      context = null
    }
  }
  return context
}

function computedColor(color: string): string {
  if (!probe) {
    probe = document.createElement('span')
    probe.style.display = 'none'
    probe.setAttribute('aria-hidden', 'true')
  }
  if (!probe.isConnected) document.body.append(probe)
  probe.style.color = ''
  probe.style.color = color
  return getComputedStyle(probe).color
}

/**
 * Flattens any CSS color (oklch, color-mix, var()) to an opaque `#rrggbb` over
 * `backdrop`. Mermaid derives shades with khroma, which only parses hex/rgb/hsl,
 * so token values must be resolved by the browser and rasterised first.
 */
export function resolveCssColor(ctx: CanvasRenderingContext2D, color: string, backdrop = 'var(--surface-panel)'): string {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = computedColor(backdrop)
  ctx.fillRect(0, 0, 1, 1)
  ctx.fillStyle = computedColor(color)
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function buildMermaidThemeConfig(): MermaidThemeConfig {
  const dark = isDarkTheme()
  const ctx = getContext()
  // No canvas (tests, exotic webviews): keep Mermaid's stock themes.
  if (!ctx) return { theme: dark ? 'dark' : 'neutral' }

  const c = (color: string) => resolveCssColor(ctx, color)
  const panel = c('var(--surface-panel)')
  const card = c('var(--surface-raised)')
  const border = c('var(--border-default)')
  const textPrimary = c('var(--text-primary)')
  const textSecondary = c('var(--text-secondary)')
  const lineStrong = c('var(--border-strong)')

  return {
    theme: 'base',
    themeVariables: {
      darkMode: dark,
      fontFamily: FONT,
      fontSize: '14px',
      background: panel,
      primaryColor: card,
      primaryBorderColor: border,
      primaryTextColor: textPrimary,
      secondaryColor: c('color-mix(in oklab, var(--hue-mist) 22%, var(--surface-raised))'),
      tertiaryColor: c('var(--surface-subtle)'),
      mainBkg: card,
      nodeBorder: border,
      lineColor: lineStrong,
      textColor: textSecondary,
      clusterBkg: c('color-mix(in oklab, var(--accent) 7%, var(--surface-panel))'),
      clusterBorder: c('color-mix(in oklab, var(--accent) 30%, var(--surface-panel))'),
      edgeLabelBackground: panel,
      titleColor: textPrimary,
      actorBkg: card,
      actorBorder: border,
      actorTextColor: textPrimary,
      actorLineColor: lineStrong,
      signalColor: textSecondary,
      signalTextColor: textPrimary,
      noteBkgColor: c('color-mix(in oklab, var(--accent) 12%, var(--surface-raised))'),
      noteBorderColor: c('color-mix(in oklab, var(--accent) 35%, var(--surface-raised))'),
      noteTextColor: textPrimary,
      pie1: c('var(--accent)'),
      pie2: c('var(--hue-plum)'),
      pie3: c('var(--hue-amber)'),
      pie4: c('var(--hue-rose)'),
      pie5: c('var(--hue-sage)'),
      pieStrokeColor: card,
      pieStrokeWidth: '2px',
      pieOuterStrokeWidth: '0px',
      pieOpacity: '1',
      pieTitleTextColor: textPrimary,
      pieSectionTextColor: card,
      pieLegendTextColor: textSecondary,
    },
  }
}

let cached: { config: MermaidThemeConfig, key: string } | null = null

function refresh(): boolean {
  const config = buildMermaidThemeConfig()
  const key = JSON.stringify(config)
  const changed = cached?.key !== key
  cached = { config, key }
  return changed
}

/** Current theme config plus a key that changes whenever any resolved color does. */
export function getMermaidTheme(): { config: MermaidThemeConfig, key: string } {
  if (!cached) refresh()
  return cached!
}

type Listener = () => void
const listeners = new Set<Listener>()
let observer: MutationObserver | null = null

/** Notifies when the theme class or accent tokens on <html> change the resolved palette. */
export function onMermaidThemeChange(listener: Listener): () => void {
  listeners.add(listener)
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (cached && refresh()) listeners.forEach((fn) => fn())
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      observer?.disconnect()
      observer = null
      cached = null
    }
  }
}
