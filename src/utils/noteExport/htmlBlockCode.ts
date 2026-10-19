import type { BlockNode } from '../../types/note'

/** Formats that cannot host live HTML export an html_block as a plain `html` code block. */
export function htmlBlockAsCodeNode(node: BlockNode): BlockNode {
  const code = String(node.attrs?.code ?? '')
  return { type: 'code_block', attrs: { language: 'html' }, content: code ? [{ type: 'text', text: code }] : [] }
}
