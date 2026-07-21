// Obsidian embed (`![[target]]` / `![[target|alias]]`) and relative-attachment
// handling for the vault importer. Framework-agnostic and Tauri-free: the
// orchestrating composable (`useObsidianImport`) injects the actual IPC calls
// (`importAsset`) and the Phase-2 wiki-link resolver (`resolveNote`).
import type { BlockNode, ImportedImageAsset } from '../../../types/note'
import { stripNoteExtension } from './vaultGraph'

const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov'])
const PDF_EXTENSIONS = new Set(['pdf'])

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
}

// Matches an inline code span (kept verbatim) or an `![[target]]`/`![[target|alias]]`
// embed. The alternation lets a single scan skip code spans without a separate
// pre-pass: when the regex engine lands on a backtick it prefers the code-span
// branch, consuming the whole span (and anything embed-like inside it) unchanged.
const EMBED_OR_CODE_SPAN_RE = /`[^`]*`|!\[\[([^\]]+?)\]\]/g

/** Rewrites every `![[target]]` / `![[target|alias]]` Obsidian embed into a
 *  standard markdown image with a sentinel URL scheme (`obsidian-embed:<encoded target>`)
 *  so the existing remark-based parser turns it into an `image_block` that
 *  `resolveObsidianEmbeds` can later reclassify. Skips fenced code blocks
 *  (```/~~~) and inline code spans. Plain `[[wiki links]]` (no leading `!`)
 *  are left untouched — Phase 2's resolver handles those during parsing. */
export function preprocessObsidianEmbeds(markdown: string): string {
  const lines = markdown.split('\n')
  let inFence = false
  const rewritten = lines.map((line) => {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      return line
    }
    if (inFence) return line
    return rewriteEmbedsInLine(line)
  })
  return rewritten.join('\n')
}

function rewriteEmbedsInLine(line: string): string {
  return line.replace(EMBED_OR_CODE_SPAN_RE, (match, rawInner: string | undefined) => {
    if (rawInner === undefined) return match // matched an inline code span; leave verbatim
    const pipeIndex = rawInner.indexOf('|')
    const rawTarget = (pipeIndex === -1 ? rawInner : rawInner.slice(0, pipeIndex)).trim()
    const alias = pipeIndex === -1 ? '' : rawInner.slice(pipeIndex + 1).trim()
    return `![${alias}](obsidian-embed:${encodeURIComponent(rawTarget)})`
  })
}

function extensionOf(pathOrName: string): string {
  const idx = pathOrName.lastIndexOf('.')
  return idx === -1 ? '' : pathOrName.slice(idx + 1).toLowerCase()
}

/** Classifies an attachment reference by its extension (case-insensitive). */
export function classifyAttachment(pathOrName: string): 'image' | 'audio' | 'video' | 'pdf' | 'file' {
  const ext = extensionOf(pathOrName)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (PDF_EXTENSIONS.has(ext)) return 'pdf'
  return 'file'
}

/** MIME type for an attachment reference by its extension; falls back to
 *  `application/octet-stream` for anything unrecognized. */
export function attachmentMime(pathOrName: string): string {
  return MIME_BY_EXTENSION[extensionOf(pathOrName)] ?? 'application/octet-stream'
}

function basenamePosix(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

function normalizeRef(ref: string): string {
  let normalized = ref.replace(/\\/g, '/').trim()
  if (normalized.startsWith('./')) normalized = normalized.slice(2)
  return normalized
}

/** Joins a (possibly empty) POSIX directory with a relative reference,
 *  resolving `.` and `..` segments. Does not clamp `..` above the root; a
 *  reference that walks above the vault root simply won't match any asset. */
function joinPosix(dir: string, ref: string): string {
  const stack = dir === '' ? [] : dir.split('/')
  for (const part of ref.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

function bySegmentCountThenPath(a: string, b: string): number {
  const segmentsA = a.split('/').length
  const segmentsB = b.split('/').length
  if (segmentsA !== segmentsB) return segmentsA - segmentsB
  return a.localeCompare(b)
}

export interface VaultAssetRef {
  relativePath: string
}

/** Builds an asset resolver over the whole vault (Obsidian-like, case-insensitive).
 *  Resolution order for a given `ref` and the current note's directory (`fromDir`):
 *   1. If `ref` contains `/`, resolve it relative to `fromDir` (joining and
 *      normalizing `.`/`..`) and match that path against the asset list.
 *   2. Otherwise (or if step 1 misses), match `ref` as an exact vault-root-relative path.
 *   3. Otherwise, match by basename; a collision is resolved deterministically
 *      by picking the shortest `relativePath` (fewest `/` segments), tie-broken
 *      lexicographically.
 *  Returns the asset's original-casing `relativePath`, or `null` if nothing matches.
 *  Lookup maps are precomputed once; resolving a ref never rescans `assets`. */
export function createVaultAssetResolver(
  assets: VaultAssetRef[],
): (ref: string, fromDir: string) => string | null {
  const byPath = new Map<string, string>()
  const byBasename = new Map<string, string[]>()

  for (const asset of assets) {
    byPath.set(asset.relativePath.toLowerCase(), asset.relativePath)
    const baseKey = basenamePosix(asset.relativePath).toLowerCase()
    const candidates = byBasename.get(baseKey)
    if (candidates) candidates.push(asset.relativePath)
    else byBasename.set(baseKey, [asset.relativePath])
  }
  for (const candidates of byBasename.values()) {
    candidates.sort(bySegmentCountThenPath)
  }

  return (ref: string, fromDir: string): string | null => {
    const normalized = normalizeRef(ref)

    if (normalized.includes('/')) {
      const joined = joinPosix(fromDir, normalized)
      const relativeMatch = byPath.get(joined.toLowerCase())
      if (relativeMatch) return relativeMatch
    }

    const rootMatch = byPath.get(normalized.toLowerCase())
    if (rootMatch) return rootMatch

    const baseKey = basenamePosix(normalized).toLowerCase()
    const candidates = byBasename.get(baseKey)
    if (candidates && candidates.length > 0) return candidates[0]

    return null
  }
}

export interface ResolveEmbedsCtx {
  /** Dirname (POSIX, vault-relative) of the note currently being resolved; `''` for root. */
  noteDir: string
  resolveAsset: (ref: string, fromDir: string) => string | null
  resolveNote: (target: string) => string | null
  importAsset: (assetRelativePath: string) => Promise<ImportedImageAsset | null>
  onUnresolvedEmbed?: (ref: string) => void
  onAttachmentImported?: () => void
}

const EXTERNAL_SCHEME_RE = /^(?:https?:|data:|blob:)/i

function isRelativeAttachmentSrc(src: string): boolean {
  if (EXTERNAL_SCHEME_RE.test(src)) return false
  if (src.startsWith('.nevo/assets/')) return false
  return true
}

function unresolvedEmbedNode(rawTarget: string): BlockNode {
  return { type: 'paragraph', content: [{ type: 'text', text: `![[${rawTarget}]]` }] }
}

function buildImportedAssetNode(
  kind: 'image' | 'audio' | 'video' | 'pdf' | 'file',
  imported: ImportedImageAsset,
  filename: string,
  alt: string | null,
): BlockNode {
  const mime = attachmentMime(filename)
  if (kind === 'image') {
    return {
      type: 'image_block',
      attrs: { src: imported.src, alt, caption: '', sizePreset: 'medium', width: null, align: 'center' },
    }
  }
  if (kind === 'audio' || kind === 'video') {
    return {
      type: 'media_block',
      attrs: { kind, src: imported.src, name: filename, mime, size: imported.bytes, duration: null, poster: '' },
    }
  }
  return {
    type: 'file_block',
    attrs: { src: imported.src, filename, mime, size: imported.bytes },
  }
}

async function resolveEmbedTarget(rawTarget: string, alias: string, ctx: ResolveEmbedsCtx): Promise<BlockNode> {
  const ext = extensionOf(rawTarget)
  const isNoteTarget = ext === '' || NOTE_EXTENSIONS.has(ext)

  if (isNoteTarget) {
    const noteId = ctx.resolveNote(rawTarget)
    if (noteId) {
      const title = basenamePosix(stripNoteExtension(rawTarget))
      return { type: 'note_embed', attrs: { noteId, title, previewText: '', icon: '' } }
    }
    ctx.onUnresolvedEmbed?.(rawTarget)
    return unresolvedEmbedNode(rawTarget)
  }

  const assetPath = ctx.resolveAsset(rawTarget, ctx.noteDir)
  if (!assetPath) {
    ctx.onUnresolvedEmbed?.(rawTarget)
    return unresolvedEmbedNode(rawTarget)
  }
  const imported = await ctx.importAsset(assetPath)
  if (!imported) {
    ctx.onUnresolvedEmbed?.(rawTarget)
    return unresolvedEmbedNode(rawTarget)
  }
  ctx.onAttachmentImported?.()
  return buildImportedAssetNode(classifyAttachment(assetPath), imported, basenamePosix(assetPath), alias || null)
}

async function resolveMarkdownAttachment(node: BlockNode, src: string, ctx: ResolveEmbedsCtx): Promise<BlockNode> {
  const assetPath = ctx.resolveAsset(src, ctx.noteDir)
  if (!assetPath) {
    ctx.onUnresolvedEmbed?.(src)
    return node
  }
  const imported = await ctx.importAsset(assetPath)
  if (!imported) {
    ctx.onUnresolvedEmbed?.(src)
    return node
  }
  ctx.onAttachmentImported?.()
  const existingAlt = node.attrs && typeof node.attrs.alt === 'string' ? (node.attrs.alt as string) : null
  return buildImportedAssetNode(classifyAttachment(assetPath), imported, basenamePosix(assetPath), existingAlt)
}

async function resolveImageNode(node: BlockNode, ctx: ResolveEmbedsCtx): Promise<BlockNode> {
  const src = node.attrs?.src
  if (typeof src !== 'string') return node

  if (src.startsWith('obsidian-embed:')) {
    const rawTarget = decodeURIComponent(src.slice('obsidian-embed:'.length))
    const alt = node.attrs?.alt
    const alias = typeof alt === 'string' ? alt : ''
    return resolveEmbedTarget(rawTarget, alias, ctx)
  }

  if (isRelativeAttachmentSrc(src)) {
    return resolveMarkdownAttachment(node, src, ctx)
  }

  return node
}

async function walkNode(node: BlockNode, ctx: ResolveEmbedsCtx): Promise<BlockNode> {
  if (node.type === 'image_block') return resolveImageNode(node, ctx)
  if (!node.content) return { ...node }
  const content = await Promise.all(node.content.map((child) => walkNode(child, ctx)))
  return { ...node, content }
}

/** Recursively walks every node (descending into every `content` array —
 *  blockquotes, lists, callouts, columns, table cells, toggles, etc.) and
 *  resolves Obsidian embeds and relative markdown attachments into the
 *  appropriate block type. Returns a new doc; the input is not mutated. */
export async function resolveObsidianEmbeds(doc: BlockNode, ctx: ResolveEmbedsCtx): Promise<BlockNode> {
  return walkNode(doc, ctx)
}
