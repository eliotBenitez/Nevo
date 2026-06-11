import { FALLBACK_FONT } from './pdfOptions'

let renderSeq = 0
let initialized = false

// Mermaid (~500 KB) is only needed when a note containing a diagram is exported,
// so it's loaded on demand and kept out of the initial bundle. Shares the same
// lazily-loaded chunk as the editor's Mermaid node view.
let mermaidModulePromise: Promise<typeof import('mermaid')['default']> | null = null

async function ensureMermaid(): Promise<typeof import('mermaid')['default']> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((mod) => mod.default)
  }
  const mermaid = await mermaidModulePromise
  if (!initialized) {
    initialized = true
    mermaid.initialize({
      startOnLoad: false,
      // `neutral` keeps diagrams legible on the white PDF page regardless of app theme.
      theme: 'neutral',
      securityLevel: 'loose',
      // Emit node/edge labels as native SVG <text> instead of HTML wrapped in
      // <foreignObject>. Typst's usvg rasteriser (and image rasterisers in general)
      // ignore <foreignObject>, so the default flowchart output loses every label in
      // a PDF. SVG text renders correctly in both the browser (HTML export) and usvg.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    })
  }
  return mermaid
}

/**
 * Render a single mermaid diagram to an SVG string.
 * Returns `null` when the diagram syntax is invalid so the caller can skip it.
 */
export async function renderMermaidToSvg(code: string): Promise<string | null> {
  if (!code.trim()) return null
  try {
    const mermaid = await ensureMermaid()
    const { svg } = await mermaid.render(`nv-export-mermaid-${++renderSeq}`, code)
    return svg
  } catch {
    return null
  }
}

/**
 * Render a mermaid diagram to an SVG string suitable for PDF export (Typst/usvg).
 *
 * The decisive fix is `htmlLabels:false` (see `ensureInitialized`): by default
 * Mermaid renders flowchart labels as HTML inside <foreignObject>, which Typst's
 * usvg rasteriser ignores entirely — so every label vanishes in the PDF. Forcing
 * native SVG <text> makes the labels render (usvg falls back to an available font
 * on its own, including for Cyrillic).
 *
 * On top of that, `normalizeFontsForExport` rewrites Mermaid's font declarations
 * to the document's embedded font so the diagram typography matches the rest of
 * the PDF instead of usvg's arbitrary fallback — cosmetic, not required for the
 * text to appear.
 */
export async function renderMermaidToSvgForPdf(code: string): Promise<string | null> {
  const svg = await renderMermaidToSvg(code)
  return svg ? normalizeFontsForExport(svg) : null
}

/**
 * Point Mermaid's font declarations at the embedded Typst font so usvg renders
 * the diagram in the same typeface as the document body:
 *  • drop @import rules (usvg cannot fetch remote stylesheets)
 *  • replace var(--mermaid-*font*) CSS variable references with the embedded font
 *  • collapse quoted font lists (Mermaid may emit the whole comma list as one CSS
 *    string value, e.g. font-family: '"trebuchet ms", verdana'; usvg treats that
 *    as a single opaque font name)
 */
function normalizeFontsForExport(svg: string): string {
  const embedded = FALLBACK_FONT
  return svg
    .replace(/@import\s+url\([^)]*\)\s*;?/g, '')
    .replace(/var\(--mermaid-[^)]*font[^)]*\)/gi, embedded)
    .replace(/font-family\s*:\s*'[^']+'/g, `font-family: '${embedded}'`)
    .replace(/font-family\s*:\s*"[^"]+"/g, `font-family: '${embedded}'`)
}
