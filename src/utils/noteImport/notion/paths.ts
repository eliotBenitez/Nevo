const NOTION_ID_SUFFIX_RE = /(?:\s+)([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function stripNotionId(value: string): string {
  return value.replace(NOTION_ID_SUFFIX_RE, '').trim() || value.trim()
}

export function stripDocumentExtension(value: string): string {
  return value.replace(/\.(?:md|markdown|csv)$/i, '')
}

export function notionTitleFromPath(relativePath: string): string {
  const segments = relativePath.split('/').filter(Boolean)
  const segment = segments[segments.length - 1] ?? relativePath
  return stripNotionId(stripDocumentExtension(segment)) || 'Untitled'
}

export function normalizeArchivePath(value: string): string {
  const parts: string[] = []
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

export function dirnameArchivePath(value: string): string {
  const normalized = normalizeArchivePath(value)
  const index = normalized.lastIndexOf('/')
  return index === -1 ? '' : normalized.slice(0, index)
}

export function withoutDocumentExtension(value: string): string {
  return normalizeArchivePath(value).replace(/\.(?:md|markdown|csv)$/i, '')
}

export function decodeArchiveReference(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
