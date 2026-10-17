import type { NevoDocxBlock, NevoDocxFragment, NevoDocxInline } from '../../types/editor-plugin'
import type { BlockNode, NoteDocument } from '../../types/note'
import { getPluginNodeSerializer } from '../../editor-core/plugin-host/active-serialization'
import { normalizeDocxFragment } from './docxFragment'

export { normalizeDocxFragment }

type GetSerializer = typeof getPluginNodeSerializer
type Mark = NonNullable<BlockNode['marks']>[number]

function inlineNodes(items: NevoDocxInline[]): BlockNode[] {
  const out: BlockNode[] = []
  for (const item of items) {
    if (item.type === 'break') {
      out.push({ type: 'hard_break' })
      continue
    }
    if (!item.text) continue
    const marks: Mark[] = []
    if (item.bold) marks.push({ type: 'strong' })
    if (item.italic) marks.push({ type: 'em' })
    if (item.underline) marks.push({ type: 'underline' })
    if (item.strike) marks.push({ type: 'strike' })
    if (item.code) marks.push({ type: 'code' })
    if (item.color) marks.push({ type: 'text_color', attrs: { color: item.color } })
    if (item.link) marks.push({ type: 'link', attrs: { href: item.link } })
    out.push(marks.length ? { type: 'text', text: item.text, marks } : { type: 'text', text: item.text })
  }
  return out
}

function blockNodes(block: NevoDocxBlock, children: BlockNode[]): BlockNode[] {
  switch (block.type) {
    case 'children':
      return children
    case 'paragraph':
      return [{ type: 'paragraph', content: inlineNodes(block.children) }]
    case 'heading':
      return [{ type: 'heading', attrs: { level: block.level }, content: inlineNodes(block.children) }]
    case 'table':
      return [{
        type: 'table',
        content: block.rows.map((row, rowIndex) => ({
          type: 'table_row',
          content: row.map(cell => ({
            type: block.header && rowIndex === 0 ? 'table_header' : 'table_cell',
            content: [{ type: 'paragraph', content: inlineNodes(cell) }],
          })),
        })),
      }]
    case 'image':
      return 'svg' in block
        ? [{ type: 'draw_block', attrs: { svgPreview: block.svg, title: block.caption ?? '' } }]
        : [{ type: 'image_block', attrs: { src: block.src, caption: block.caption ?? '' } }]
  }
}

export function fragmentToBlocks(fragment: NevoDocxFragment, children: BlockNode[]): BlockNode[] {
  return fragment.blocks.flatMap(block => blockNodes(block, children))
}

async function expandNodes(nodes: BlockNode[], getSerializer: GetSerializer): Promise<BlockNode[]> {
  const out: BlockNode[] = []
  for (const original of nodes) {
    const node = original.content
      ? { ...original, content: await expandNodes(original.content, getSerializer) }
      : original
    const docx = original.text === undefined ? getSerializer(node.type)?.docx : undefined
    if (!docx) {
      out.push(node)
      continue
    }
    try {
      const fragment = normalizeDocxFragment(await docx(node))
      if (!fragment) throw new Error('invalid DOCX fragment')
      out.push(...fragmentToBlocks(fragment, node.content ?? []))
    } catch (error) {
      console.warn(`Plugin DOCX serializer failed for node "${node.type}"`, error)
      out.push(node)
    }
  }
  return out
}

/** Replaces plugin nodes that provide a `docx` serializer with ordinary Nevo blocks. */
export async function expandPluginDocxNodes(
  note: NoteDocument,
  getSerializer: GetSerializer = getPluginNodeSerializer,
): Promise<NoteDocument> {
  const clone = structuredClone(note)
  const [content] = await expandNodes([clone.content], getSerializer)
  return { ...clone, content: content ?? clone.content }
}
