const LUCIDE_PREFIX = 'lucide:'

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

export function lucideExportNameFromToken(value: string): string | null {
  const lucideName = getLucideNameFromToken(value)
  if (!lucideName) return null
  return kebabToPascalCase(lucideName)
}

export function humanizeLucideName(exportName: string): string {
  return exportName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}
