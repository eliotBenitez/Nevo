import DOMPurify from 'dompurify'

const MAX_SVG_LENGTH = 2 * 1024 * 1024
const forbiddenTags = [
  'script',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'style',
  'link',
  'meta',
]

function isSafeEmbeddedImage(value: string): boolean {
  return /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,/i.test(value)
}

function hasUnsafeUrl(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, '')
  if (/^javascript:/i.test(normalized) || /^vbscript:/i.test(normalized)) return true
  for (const match of normalized.matchAll(/url\(([^)]+)\)/gi)) {
    const target = match[1].replace(/^['"]|['"]$/g, '')
    if (!target.startsWith('#')) return true
  }
  return false
}

/**
 * Sanitize a stored SVG preview before persistence or insertion into an HTML
 * sink. The second XML pass removes URL-bearing constructs that are valid SVG
 * but outside Nevo drawing previews (network fetches, script URLs and CSS).
 */
export function sanitizeSvg(svg: string): string {
  if (!svg.trim() || svg.length > MAX_SVG_LENGTH) return ''

  const purified = String(DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: forbiddenTags,
    FORBID_ATTR: ['style'],
  }))
  const parsed = new DOMParser().parseFromString(purified, 'image/svg+xml')
  const root = parsed.documentElement
  if (root.localName !== 'svg' || parsed.querySelector('parsererror')) return ''

  for (const element of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      if (name.startsWith('on') || name === 'style' || hasUnsafeUrl(value)) {
        element.removeAttribute(attr.name)
        continue
      }
      if (name === 'href' || name === 'xlink:href' || name === 'src') {
        if (!value.startsWith('#') && !isSafeEmbeddedImage(value)) {
          element.removeAttribute(attr.name)
        }
      }
    }
  }

  return new XMLSerializer().serializeToString(root)
}
