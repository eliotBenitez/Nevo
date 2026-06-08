import type { BlockNode } from '../types/note'

function collectInlineText(node: BlockNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hard_break') return '\n'
  if (!node.content?.length) return ''
  return node.content.map(collectInlineText).join('')
}

function flattenBlocks(node: BlockNode): string[] {
  if (!node.content?.length) return []
  return node.content.map((block) => {
    const text = collectInlineText(block)
    if (text) return text
    return block.content?.length ? collectInlineText(block) : ''
  })
}

export function noteContentToPlainText(content: BlockNode): string {
  if (!content || content.type !== 'doc') return ''
  return flattenBlocks(content).join('\n').trimEnd()
}

export function plainTextToNoteContent(text: string): BlockNode {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line.length ? [{ type: 'text', text: line }] : [],
    })),
  }
}
