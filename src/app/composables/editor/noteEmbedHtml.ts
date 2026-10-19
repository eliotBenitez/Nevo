import type { WorkspaceBackend } from '../../../core/workspace-backend'
import { blockNode } from '../../../utils/noteExport/htmlSerializer'
import { assetBasename } from '../../../utils/noteExport/assetBasename'

const EMBED_ASSETS_DIR = '__EMBED__'

// The serializer escapes attribute values; undo it to compare with raw srcs.
function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function rewriteEmbedAssetSrcs(
  html: string,
  assetSrcs: string[],
  resolveAssetSrc: (src: string) => string,
): string {
  if (assetSrcs.length === 0) return html
  return html.replace(
    /\bsrc="__EMBED__\/([^"]+)"/g,
    (_, escaped: string) => {
      const filename = unescapeAttr(escaped)
      const original = assetSrcs.find(src => assetBasename(src) === filename) ?? filename
      return `src="${resolveAssetSrc(original)}"`
    },
  )
}

// Through the backend: a note's body is not part of `loadNote` (see loadNoteWithContent).
export async function loadNoteEmbedHtml(
  backend: Pick<WorkspaceBackend, 'loadNoteWithContent'> | null,
  noteId: string,
  resolveAssetSrc: (src: string) => string,
): Promise<string> {
  if (!backend) throw new Error('No workspace')
  const doc = await backend.loadNoteWithContent(noteId)
  const ctx = { assetSrcs: [] as string[], assetsSubfolderName: EMBED_ASSETS_DIR }
  const rawHtml = await blockNode(doc.content, ctx)
  return rewriteEmbedAssetSrcs(rawHtml, ctx.assetSrcs, resolveAssetSrc)
}
