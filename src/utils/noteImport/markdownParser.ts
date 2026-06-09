import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { Root, Content, PhrasingContent, ListItem } from 'mdast'
import type { BlockNode } from '../../types/note'

export interface ParsedMarkdown {
  title: string
  content: BlockNode
}

// Single shared processor instance
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

// Mark descriptor
type Mark = { type: string; attrs?: Record<string, unknown> }

function inlineToContent(nodes: PhrasingContent[], marks: Mark[] = []): BlockNode[] {
  const result: BlockNode[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        if (node.value) {
          const block: BlockNode = { type: 'text', text: node.value }
          if (marks.length) block.marks = marks
          result.push(block)
        }
        break
      }
      case 'strong':
        result.push(...inlineToContent(node.children as PhrasingContent[], [...marks, { type: 'strong' }]))
        break
      case 'emphasis':
        result.push(...inlineToContent(node.children as PhrasingContent[], [...marks, { type: 'em' }]))
        break
      case 'delete':
        result.push(...inlineToContent((node as { children: PhrasingContent[] }).children, [...marks, { type: 'strike' }]))
        break
      case 'inlineCode':
        if (node.value) {
          result.push({ type: 'text', text: node.value, marks: [...marks, { type: 'code' }] })
        }
        break
      case 'link':
        result.push(...inlineToContent(
          node.children as PhrasingContent[],
          [...marks, { type: 'link', attrs: { href: node.url } }],
        ))
        break
      case 'image':
        result.push({
          type: 'image_block',
          attrs: { src: node.url, alt: node.alt || null, caption: null, sizePreset: 'full', width: null },
        })
        break
      default:
        // inlineMath — remark-math augments the type system at runtime
        if ((node as { type?: string; value?: string }).type === 'inlineMath') {
          result.push({ type: 'math_inline', attrs: { latex: (node as { type?: string; value?: string }).value ?? '', displayMode: false } })
        }
    }
  }
  return result
}

function cellParagraph(cells: PhrasingContent[]): BlockNode {
  const content = inlineToContent(cells)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function listItemToNode(item: ListItem): BlockNode {
  // Checklist item: content is inline*
  if (typeof item.checked === 'boolean') {
    const content: BlockNode[] = []
    for (const child of item.children) {
      if (child.type === 'paragraph') content.push(...inlineToContent(child.children as PhrasingContent[]))
    }
    return { type: 'checklist_item', attrs: { checked: item.checked }, content }
  }
  // Regular list item: content is paragraph block*
  const content = item.children.flatMap(blockToNodes)
  return { type: 'list_item', content: content.length ? content : [{ type: 'paragraph' }] }
}

function blockToNodes(node: Content): BlockNode[] {
  switch (node.type) {
    case 'paragraph': {
      // Standalone image → image_block
      if (node.children.length === 1 && node.children[0].type === 'image') {
        const img = node.children[0]
        return [{ type: 'image_block', attrs: { src: img.url, alt: img.alt || null, caption: null, sizePreset: 'full', width: null } }]
      }
      const content = inlineToContent(node.children as PhrasingContent[])
      return [{ type: 'paragraph', content }]
    }
    case 'heading': {
      const content = inlineToContent(node.children as PhrasingContent[])
      return [{ type: 'heading', attrs: { level: node.depth }, content }]
    }
    case 'code': {
      if (node.lang === 'mermaid') {
        return [{ type: 'mermaid_block', attrs: { code: node.value } }]
      }
      const content = node.value ? [{ type: 'text', text: node.value }] : []
      return [{ type: 'code_block', attrs: { language: node.lang ?? null }, content }]
    }
    case 'blockquote': {
      const content = node.children.flatMap(blockToNodes)
      return [{ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] }]
    }
    case 'list': {
      const isChecklist = node.children.some(item => typeof item.checked === 'boolean')
      if (isChecklist) {
        return node.children.map(listItemToNode)
      }
      const listType = node.ordered ? 'ordered_list' : 'bullet_list'
      return [{ type: listType, content: node.children.map(listItemToNode) }]
    }
    case 'table': {
      const rows = node.children.map((row, rowIndex) => ({
        type: 'table_row',
        content: row.children.map(cell => ({
          type: rowIndex === 0 ? 'table_header' : 'table_cell',
          attrs: { colspan: 1, rowspan: 1, colwidth: null },
          content: [cellParagraph(cell.children as PhrasingContent[])],
        })),
      }))
      return [{ type: 'table', content: rows }]
    }
    case 'thematicBreak':
      return [{ type: 'divider' }]
    default: {
      // math block — added by remark-math
      if ((node as { type?: string; value?: string }).type === 'math') {
        return [{ type: 'math_block', attrs: { latex: (node as { type?: string; value?: string }).value ?? '', displayMode: true } }]
      }
      return []
    }
  }
}

export function parseMarkdownToBlockNode(markdown: string, fallbackTitle: string): ParsedMarkdown {
  const tree = processor.parse(markdown) as Root
  let title = fallbackTitle
  let titleExtracted = false
  const blocks: BlockNode[] = []

  for (const node of tree.children) {
    // Extract first H1 as note title
    if (!titleExtracted && node.type === 'heading' && node.depth === 1) {
      title = inlineToContent(node.children as PhrasingContent[])
        .filter(n => n.type === 'text')
        .map(n => n.text ?? '')
        .join('')
      titleExtracted = true
      continue
    }
    blocks.push(...blockToNodes(node))
  }

  return {
    title,
    content: { type: 'doc', content: blocks },
  }
}
