import type { BlockNode } from '../types/note'

const INLINE_TEXT_CONTAINER_TYPES = new Set([
  'paragraph',
  'heading',
  'code_block',
  'checklist_item',
  'toggle_title',
])

/**
 * Incremental word counter: counts transitions from whitespace (or start) to
 * non-whitespace across any number of `feed()` calls, equivalent to counting
 * the segments `text.trim().split(/\s+/)` would produce on the concatenation
 * of every fed chunk — without ever concatenating them into one string. Used
 * by `countWordsInText` below and by the editor's streaming doc-stats walk
 * (`src/editor-core/docStats.ts`) so both paths share one definition of "word"
 * and cannot drift apart.
 */
export function createWordCounter() {
  let insideWord = false
  let words = 0
  return {
    feed(chunk: string) {
      for (let i = 0; i < chunk.length; i++) {
        if (/\s/.test(chunk[i])) {
          insideWord = false
        } else if (!insideWord) {
          insideWord = true
          words += 1
        }
      }
    },
    get count() {
      return words
    },
  }
}

/** Counts whitespace-delimited words in text whose block boundaries are already preserved. */
export function countWordsInText(text: string): number {
  const counter = createWordCounter()
  counter.feed(text)
  return counter.count
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
