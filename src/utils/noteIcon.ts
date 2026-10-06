const LUCIDE_PREFIX = 'lucide:'

/**
 * Brand icons removed from `lucide-vue-next` in Lucide v1. Notes saved before
 * the migration can reference them via picker tokens, so they map to the
 * closest current glyph instead of falling back to the emoji placeholder.
 */
const LEGACY_BRAND_ALIASES: Record<string, string> = {
  chrome: 'Globe',
  chromium: 'Globe',
  codepen: 'Code',
  codesandbox: 'Box',
  dribbble: 'Globe',
  facebook: 'ThumbsUp',
  figma: 'Component',
  framer: 'Layers',
  github: 'GitBranch',
  gitlab: 'GitBranch',
  instagram: 'Camera',
  linkedin: 'Briefcase',
  pocket: 'Bookmark',
  'rail-symbol': 'TrainFront',
  slack: 'MessageCircle',
  trello: 'SquareKanban',
  twitch: 'Tv',
  twitter: 'Bird',
  youtube: 'Play',
}

export function isLucideNoteIcon(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return value.startsWith(LUCIDE_PREFIX)
}

export function getLucideNameFromToken(value: string | null | undefined): string | null {
  if (!isLucideNoteIcon(value) || typeof value !== 'string') return null
  const raw = value.slice(LUCIDE_PREFIX.length).trim()
  return raw || null
}

export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function kebabToPascalCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function lucideTokenFromExportName(exportName: string): string {
  return `${LUCIDE_PREFIX}${toKebabCase(exportName)}`
}

export function lucideExportNameFromToken(value: string | null | undefined): string | null {
  const lucideName = getLucideNameFromToken(value)
  if (!lucideName) return null
  // The old picker also offered `LucideX` prefixed exports, which produced
  // `lucide:lucide-x` tokens; strip that prefix before alias/Pascal lookup.
  const name = lucideName.replace(/^lucide-/, '')
  const alias = LEGACY_BRAND_ALIASES[name]
  if (alias) return alias
  return kebabToPascalCase(name)
}

export function humanizeLucideName(exportName: string): string {
  return exportName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}
