import type { BlockNode } from '../types/note'

const INLINE_TEXT_CONTAINER_TYPES = new Set([
  'paragraph',
  'heading',
  'code_block',
  'checklist_item',
  'toggle_title',
])

/** Counts whitespace-delimited words in text whose block boundaries are already preserved. */
export function countWordsInText(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/**
 * Converts persisted editor content to word-count text. Text nodes in the same
 * inline container remain adjacent, while block siblings are separated so that
 * a formatting boundary cannot split a word and a block boundary cannot merge
 * two words.
 */
export function noteContentToWordCountText(node: BlockNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hard_break') return '\n'
  if (!node.content?.length) return ''

  const separator = INLINE_TEXT_CONTAINER_TYPES.has(node.type) ? '' : '\n'
  return node.content.map(noteContentToWordCountText).join(separator)
}

export function countWordsInNoteContent(content: BlockNode): number {
  return countWordsInText(noteContentToWordCountText(content))
}
