import type { BlockNode } from '../../types/note'
import { serializeNoteToMarkdown } from '../../utils/noteExport/markdownSerializer'

const PLUGIN_MARKER = /<!-- nevo-plugin-node:[^>]*-->\n?/g

/**
 * Note text for the model. Reuses the Markdown export so content kept in block
 * attributes (audio transcripts, file names, map addresses) reaches the model,
 * which plain `textBetween` drops.
 */
export function noteContextText(title: string, content: unknown): string {
  const { markdown } = serializeNoteToMarkdown({ title, content: content as BlockNode }, 'assets')
  return markdown.replace(PLUGIN_MARKER, '').replace(/\n{3,}/g, '\n\n').trim()
}
