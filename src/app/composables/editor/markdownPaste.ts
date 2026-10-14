import { Fragment, Slice, type Schema } from 'prosemirror-model'
import { parseMarkdownToBlockNode, type WikiLinkResolver } from '../../../utils/noteImport/markdownParser'

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

/** True when clipboard HTML carries real formatting. Code editors (VS Code,
 *  terminals) wrap raw Markdown source in bare div/span/br/p markup, which
 *  must not win over converting the plain-text Markdown. */
export function hasSemanticHtml(html: string): boolean {
  return /<(h[1-6]|ul|ol|li|table|strong|b|em|i|u|s|del|a|pre|code|blockquote|img|hr)\b/i.test(html)
}

export function parseMarkdownToSlice(text: string, schema: Schema, resolver?: WikiLinkResolver): Slice | null {
  // A pasted H1 is content, not the note title.
  const parsed = parseMarkdownToBlockNode(text, '', resolver, { extractTitle: false })
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
