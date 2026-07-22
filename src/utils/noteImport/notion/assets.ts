import type { BlockNode, ImportedImageAsset } from '../../../types/note'
import { dirnameArchivePath, normalizeArchivePath } from './paths'
import { isExternalReference, resolveArchiveReference } from './links'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'mov', 'mkv', 'avi'])

function extension(path: string): string {
  const segments = path.split('.')
  return segments[segments.length - 1]?.toLowerCase() ?? ''
}

function basename(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] ?? path
}

function mimeFor(path: string): string {
  const ext = extension(path)
  const known: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  }
  return known[ext] ?? 'application/octet-stream'
}

export function collectNotionAssetReferences(doc: BlockNode, fromPath: string): Set<string> {
  const result = new Set<string>()
  const visit = (node: BlockNode) => {
    if (node.type === 'image_block' && typeof node.attrs?.src === 'string' && !isExternalReference(node.attrs.src)) {
      const resolved = resolveArchiveReference(node.attrs.src, fromPath)
      if (resolved) result.add(resolved.path)
    }
    for (const mark of node.marks ?? []) {
      const href = mark.type === 'link' && typeof mark.attrs?.href === 'string' ? mark.attrs.href : null
      const resolved = href ? resolveArchiveReference(href, fromPath) : null
      if (resolved) result.add(resolved.path)
    }
    node.content?.forEach(visit)
  }
  visit(doc)
  return result
}

function assetNode(path: string, imported: ImportedImageAsset, size: number, label?: string): BlockNode {
  const name = label || basename(path)
  const ext = extension(path)
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { type: 'image_block', attrs: { src: imported.src, alt: name, caption: null, sizePreset: 'full', width: null } }
  }
  if (AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)) {
    return {
      type: 'media_block',
      attrs: { kind: AUDIO_EXTENSIONS.has(ext) ? 'audio' : 'video', src: imported.src, name, mime: mimeFor(path), size },
    }
  }
  return { type: 'file_block', attrs: { src: imported.src, filename: name, mime: mimeFor(path), size } }
}

export function resolveNotionAssets(
  doc: BlockNode,
  fromPath: string,
  importedByPath: ReadonlyMap<string, ImportedImageAsset | null>,
  sizeByPath: ReadonlyMap<string, number>,
  onMissing?: (path: string) => void,
): BlockNode {
  const resolvePath = (reference: string) => resolveArchiveReference(reference, fromPath)?.path ?? normalizeArchivePath(`${dirnameArchivePath(fromPath)}/${reference}`)
  const visit = (node: BlockNode): BlockNode[] => {
    if (node.type === 'image_block' && typeof node.attrs?.src === 'string' && !isExternalReference(node.attrs.src)) {
      const path = resolvePath(node.attrs.src)
      const imported = importedByPath.get(path)
      if (imported) return [assetNode(path, imported, sizeByPath.get(path) ?? imported.bytes, String(node.attrs.alt ?? ''))]
      onMissing?.(path)
      return [{ type: 'paragraph', content: [{ type: 'text', text: String(node.attrs.alt || basename(path)) }] }]
    }
    if (node.type === 'paragraph' && node.content) {
      const blocks: BlockNode[] = []
      let inline: BlockNode[] = []
      const flushInline = () => {
        if (!inline.length) return
        blocks.push({ type: 'paragraph', content: inline })
        inline = []
      }
      for (const child of node.content) {
        if (child.type === 'image_block') {
          flushInline()
          blocks.push(...visit(child))
          continue
        }
        const link = child.marks?.find(mark => mark.type === 'link' && typeof mark.attrs?.href === 'string')
        if (!link || typeof link.attrs?.href !== 'string' || isExternalReference(link.attrs.href)) {
          inline.push(child)
          continue
        }
        const path = resolvePath(link.attrs.href)
        const imported = importedByPath.get(path)
        if (imported) {
          flushInline()
          blocks.push(assetNode(path, imported, sizeByPath.get(path) ?? imported.bytes, child.text))
        } else {
          onMissing?.(path)
          inline.push({
            ...child,
            text: child.text || basename(path),
            marks: child.marks?.filter(mark => mark !== link),
          })
        }
      }
      flushInline()
      return blocks.length ? blocks : [{ type: 'paragraph' }]
    }
    return [node.content ? { ...node, content: node.content.flatMap(child => visit(child)) } : node]
  }
  return visit(doc)[0] ?? doc
}
