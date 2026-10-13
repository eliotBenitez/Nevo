import { sanitizeSvg } from './sanitizeSvg'

// Mermaid's generated styles are needed for readable diagrams, but retaining a
// stylesheet would let its selectors participate in the surrounding document.
// Convert only presentation properties onto sanitized SVG elements instead.
const PRESENTATION_PROPERTIES = new Set([
  'alignment-baseline',
  'baseline-shift',
  'clip-path',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'marker-end',
  'marker-mid',
  'marker-start',
  'opacity',
  'paint-order',
  'shape-rendering',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-decoration',
  'text-rendering',
  'transform',
  'vector-effect',
  'visibility',
])
const MAX_MERMAID_SVG_LENGTH = 2 * 1024 * 1024

function hasUnsafeCss(value: string): boolean {
  if (/\\|(?:expression\s*\(|@import|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding)/i.test(value)) {
    return true
  }
  for (const match of value.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const target = match[2].replace(/\s+/g, '')
    if (!/^#[\w:.-]+$/.test(target)) return true
  }
  return false
}

function applyPresentationStyles(target: Element, source: CSSStyleDeclaration): void {
  for (let index = 0; index < source.length; index++) {
    const property = source.item(index).toLowerCase()
    const value = source.getPropertyValue(property).trim()
    if (!PRESENTATION_PROPERTIES.has(property) || !value || hasUnsafeCss(value)) continue
    target.setAttribute(property, value)
  }
}

function getCssRules(css: string): CSSRuleList | null {
  if (hasUnsafeCss(css)) return null
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    return sheet.cssRules
  } catch {
    return null
  }
}

/** Sanitize Mermaid output while preserving safe styles and intrinsic SVG size. */
export function sanitizeMermaidSvg(svg: string): string {
  if (!svg.trim() || svg.length > MAX_MERMAID_SVG_LENGTH) return ''

  const source = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const sourceRoot = source.documentElement
  if (sourceRoot.localName !== 'svg' || source.querySelector('parsererror')) return ''

  const styleTexts = Array.from(sourceRoot.querySelectorAll('style'), (style) => style.textContent ?? '')
  const inlineStyles = Array.from(sourceRoot.querySelectorAll('[style]'), (element, index) => {
    const marker = `mermaid-style-${index}`
    const value = element.getAttribute('style') ?? ''
    element.setAttribute('data-mermaid-style', marker)
    element.removeAttribute('style')
    return { marker, value }
  })
  sourceRoot.querySelectorAll('style').forEach((style) => style.remove())

  const sanitized = sanitizeSvg(new XMLSerializer().serializeToString(sourceRoot))
  if (!sanitized) return ''
  const cleanDocument = new DOMParser().parseFromString(sanitized, 'image/svg+xml')
  const cleanRoot = cleanDocument.documentElement

  // Retain source order for stylesheet rules; full CSS specificity and !important
  // cascade are intentionally outside this presentation-only adapter.
  for (const css of styleTexts) {
    const rules = getCssRules(css)
    if (!rules) continue
    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.STYLE_RULE) continue
      const styleRule = rule as CSSStyleRule
      let targets: Element[]
      try {
        targets = Array.from(cleanRoot.querySelectorAll(styleRule.selectorText))
        if (cleanRoot.matches(styleRule.selectorText)) targets.unshift(cleanRoot)
      } catch {
        continue
      }
      targets.forEach((target) => applyPresentationStyles(target, styleRule.style))
    }
  }

  // Inline style has higher specificity than generated stylesheet rules.
  for (const { marker, value } of inlineStyles) {
    const target = cleanRoot.querySelector(`[data-mermaid-style="${marker}"]`)
    target?.removeAttribute('data-mermaid-style')
    if (target && !hasUnsafeCss(value)) {
      const style = document.createElement('div').style
      style.cssText = value
      applyPresentationStyles(target, style)
    }
  }

  // Re-run the shared sanitizer after adding attributes from CSS.
  return sanitizeSvg(new XMLSerializer().serializeToString(cleanRoot))
}
