// Framework-agnostic helpers for Obsidian vault import: path utilities and
// wiki-link resolution across the whole vault. No Vue/Pinia imports — the
// orchestrating composable (`useObsidianImport`) owns all side effects.
import type { WikiLinkResolver } from '../markdownParser'

const NOTE_EXTENSION_RE = /\.(?:md|markdown|mdown|mkd)$/i

/** Strips a trailing `.md`/`.markdown`/`.mdown`/`.mkd` extension (case-insensitive). */
export function stripNoteExtension(path: string): string {
  return path.replace(NOTE_EXTENSION_RE, '')
}

function lastSegment(posixPath: string): string {
  const idx = posixPath.lastIndexOf('/')
  return idx === -1 ? posixPath : posixPath.slice(idx + 1)
}

/** Parent directory of a POSIX relative path. Root-level paths (no `/`) return `''`. */
export function dirnamePosix(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/')
  return idx === -1 ? '' : relativePath.slice(0, idx)
}

/** Every unique ancestor directory across the given note paths, sorted
 *  parents-before-children (by segment count ascending, then lexicographically)
 *  so callers can create the corresponding folders top-down. */
export function collectFolderPaths(relativePaths: string[]): string[] {
  const paths = new Set<string>()
  for (const relativePath of relativePaths) {
    let dir = dirnamePosix(relativePath)
    while (dir !== '') {
      paths.add(dir)
      dir = dirnamePosix(dir)
    }
  }
  return [...paths].sort((a, b) => {
    const segmentsA = a.split('/').length
    const segmentsB = b.split('/').length
    if (segmentsA !== segmentsB) return segmentsA - segmentsB
    return a.localeCompare(b)
  })
}

export interface VaultNoteEntry {
  relativePath: string
  noteId: string
}

function normalizeTarget(target: string): string {
  let normalized = target.trim().replace(/\\/g, '/')
  if (normalized.startsWith('./')) normalized = normalized.slice(2)
  return stripNoteExtension(normalized).trim()
}

function bySegmentCountThenPath(a: VaultNoteEntry, b: VaultNoteEntry): number {
  const segmentsA = a.relativePath.split('/').length
  const segmentsB = b.relativePath.split('/').length
  if (segmentsA !== segmentsB) return segmentsA - segmentsB
  return a.relativePath.localeCompare(b.relativePath)
}

/** Builds a `WikiLinkResolver` over the whole vault (Obsidian-like, case-insensitive).
 *  Resolution order for a `[[target]]`:
 *   1. Exact match against the entry's path without extension.
 *   2. Exact match against the basename without extension; a collision is
 *      resolved deterministically by picking the shortest `relativePath`
 *      (fewest `/` segments), tie-broken lexicographically.
 *   3. Otherwise `onUnresolved(target)` (if given) is invoked and `null` is returned.
 *  Lookup maps are precomputed once here; resolving a link never rescans `entries`. */
export function createVaultLinkResolver(
  entries: VaultNoteEntry[],
  onUnresolved?: (target: string) => void,
): WikiLinkResolver {
  const byFullPath = new Map<string, string>()
  const byBasename = new Map<string, VaultNoteEntry[]>()

  for (const entry of entries) {
    const withoutExt = stripNoteExtension(entry.relativePath)
    byFullPath.set(withoutExt.toLowerCase(), entry.noteId)

    const basenameKey = lastSegment(withoutExt).toLowerCase()
    const candidates = byBasename.get(basenameKey)
    if (candidates) candidates.push(entry)
    else byBasename.set(basenameKey, [entry])
  }
  for (const candidates of byBasename.values()) {
    candidates.sort(bySegmentCountThenPath)
  }

  return (target: string): string | null => {
    const normalized = normalizeTarget(target)

    const fullMatch = byFullPath.get(normalized.toLowerCase())
    if (fullMatch) return fullMatch

    const basenameKey = lastSegment(normalized).toLowerCase()
    const candidates = byBasename.get(basenameKey)
    if (candidates && candidates.length > 0) return candidates[0].noteId

    onUnresolved?.(target)
    return null
  }
}
