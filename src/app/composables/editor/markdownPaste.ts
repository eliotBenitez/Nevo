import { Fragment, Slice, type Schema } from 'prosemirror-model'
import { parseMarkdownToBlockNode } from '../../../utils/noteImport/markdownParser'

export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split('\n')
  return (
    lines.some(
      l =>
        /^#{1,6}\s/.test(l) ||
        /^[-*+]\s/.test(l) ||
        /^\d+\.\s/.test(l) ||
        /^>\s/.test(l) ||
        /^`{3}/.test(l) ||
        /^\|.+\|/.test(l),
    ) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /~~[^~]+~~/.test(text) ||
    /`[^`]+`/.test(text)
  )
}

export function parseMarkdownToSlice(text: string, schema: Schema): Slice | null {
  const parsed = parseMarkdownToBlockNode(text, '')
  const blocks = parsed.content.content ?? []
  const nodes = blocks.flatMap(block => {
    try {
      return [schema.nodeFromJSON(block)]
    } catch {
      return []
    }
  })
  if (!nodes.length) return null
  return new Slice(Fragment.fromArray(nodes), 0, 0)
}
