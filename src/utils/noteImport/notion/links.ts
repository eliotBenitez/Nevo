import type { MarkdownLinkResolver, MarkdownLinkTarget } from '../markdownParser'
import type { NotionDocumentPlan } from './tree'
import {
  decodeArchiveReference,
  dirnameArchivePath,
  normalizeArchivePath,
  stripNotionId,
  withoutDocumentExtension,
} from './paths'

export function isExternalReference(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)
}

export function resolveArchiveReference(reference: string, fromPath: string): { path: string; anchor: string | null } | null {
  if (!reference || isExternalReference(reference)) return null
  const [rawPath, rawAnchor] = reference.split('#', 2)
  const decoded = decodeArchiveReference(rawPath).split('?')[0]
  const base = decoded.startsWith('/') ? decoded.slice(1) : `${dirnameArchivePath(fromPath)}/${decoded}`
  return {
    path: normalizeArchivePath(base),
    anchor: rawAnchor ? decodeArchiveReference(rawAnchor) : null,
  }
}

export function createNotionLinkResolver(
  fromPath: string,
  plans: NotionDocumentPlan[],
  noteIdByKey: ReadonlyMap<string, string>,
  onUnresolved?: (reference: string) => void,
): MarkdownLinkResolver {
  const aliases = new Map<string, NotionDocumentPlan>()
  for (const plan of plans) {
    const normalized = normalizeArchivePath(plan.document.relativePath)
    aliases.set(normalized.toLowerCase(), plan)
    aliases.set(withoutDocumentExtension(normalized).toLowerCase(), plan)
    aliases.set(stripNotionId(withoutDocumentExtension(normalized)).toLowerCase(), plan)
  }
  return (href: string): MarkdownLinkTarget | null => {
    const resolved = resolveArchiveReference(href, fromPath)
    if (!resolved) return null
    const candidate = aliases.get(resolved.path.toLowerCase())
      ?? aliases.get(withoutDocumentExtension(resolved.path).toLowerCase())
      ?? aliases.get(stripNotionId(withoutDocumentExtension(resolved.path)).toLowerCase())
    if (!candidate) {
      if (!/\.[a-z0-9]{2,8}$/i.test(resolved.path) || /\.(?:md|markdown|csv)$/i.test(resolved.path)) {
        onUnresolved?.(href)
      }
      return null
    }
    const noteId = noteIdByKey.get(candidate.key)
    if (!noteId) {
      onUnresolved?.(href)
      return null
    }
    return { noteId, title: candidate.title, anchor: resolved.anchor }
  }
}
