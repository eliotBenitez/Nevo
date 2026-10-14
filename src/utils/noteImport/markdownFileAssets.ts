import type { BlockNode, ImportedImageAsset } from '../../types/note'
import { resolveObsidianEmbeds } from './obsidian/obsidianEmbeds'

function toFileRelativePath(ref: string): string {
  let path = ref
  try {
    path = decodeURIComponent(ref)
  } catch {
    // Not percent-encoded; use the raw reference.
  }
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** Imports attachments that a standalone Markdown file references relative to
 *  its own directory into workspace assets. `importAsset` receives the path
 *  relative to that directory; unresolved images keep their original src. */
export function resolveMarkdownFileAssets(
  doc: BlockNode,
  importAsset: (relativePath: string) => Promise<ImportedImageAsset | null>,
): Promise<BlockNode> {
  return resolveObsidianEmbeds(doc, {
    noteDir: '',
    resolveAsset: toFileRelativePath,
    resolveNote: () => null,
    importAsset,
  })
}
