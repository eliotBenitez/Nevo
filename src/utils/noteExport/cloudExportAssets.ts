// Cloud workspaces have no asset directory on disk: their images live on the
// relay as encrypted blobs. Export has to hand the bytes to Rust instead of a
// path, and the file name written next to the export must match the one the
// serializers put in the document.
//
// Both are solved in one pass here, before serialization: every `cloud-asset:`
// reference is rewritten to `.nevo/assets/<generated name>` — the exact shape a
// local asset has, so every serializer derives the same basename from it —
// while the decrypted bytes are collected under that name.

import type { NoteDocument, BlockNode } from '../../types/note'
import type { InlineExportAsset } from '../../tauri/commands'
import { CLOUD_ASSET_SCHEME } from '../../core/workspace-backend'

/** Reads one cloud asset. Returns null when it cannot be fetched or decrypted. */
export type CloudAssetReader = (src: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
}

function extensionFor(contentType: string): string {
  return EXTENSION_BY_MIME[contentType.split(';')[0].trim().toLowerCase()] ?? 'bin'
}

function toBase64(bytes: Uint8Array): string {
  // Chunked so a large asset cannot blow the argument limit of String.fromCharCode.
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export interface PreparedCloudAssets {
  /** The note with every cloud asset reference rewritten to a local-shaped path. */
  note: NoteDocument
  /** Assets to write beside the export, keyed by the same generated name. */
  inlineAssets: InlineExportAsset[]
  /** Raw bytes by generated name, for exporters that embed rather than copy. */
  bytesByName: Map<string, Uint8Array>
}

/**
 * Rewrites a note's cloud asset references and fetches their bytes.
 *
 * Assets that cannot be read are left pointing at their original `cloud-asset:`
 * src: the export then simply lacks that image rather than failing outright,
 * which matches how a missing local asset behaves.
 */
export async function prepareCloudExportAssets(
  note: NoteDocument,
  readAsset: CloudAssetReader,
): Promise<PreparedCloudAssets> {
  const inlineAssets: InlineExportAsset[] = []
  const bytesByName = new Map<string, Uint8Array>()
  const nameBySrc = new Map<string, string>()

  const collect = (node: BlockNode): void => {
    const src = node.attrs?.src
    if (typeof src === 'string' && src.startsWith(CLOUD_ASSET_SCHEME)) nameBySrc.set(src, '')
    for (const child of node.content ?? []) collect(child)
  }
  collect(note.content)
  if (nameBySrc.size === 0) return { note, inlineAssets, bytesByName }

  let index = 0
  for (const src of [...nameBySrc.keys()]) {
    const asset = await readAsset(src)
    if (!asset) {
      nameBySrc.delete(src)
      continue
    }
    index++
    const name = `cloud-asset-${index}.${extensionFor(asset.contentType)}`
    nameBySrc.set(src, name)
    bytesByName.set(name, asset.bytes)
    inlineAssets.push({ name, bytesBase64: toBase64(asset.bytes) })
  }

  const rewrite = (node: BlockNode): void => {
    const src = node.attrs?.src
    if (typeof src === 'string') {
      const name = nameBySrc.get(src)
      if (name) node.attrs = { ...node.attrs, src: `.nevo/assets/${name}` }
    }
    for (const child of node.content ?? []) rewrite(child)
  }
  rewrite(note.content)

  return { note, inlineAssets, bytesByName }
}
