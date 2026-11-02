import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Root, RootContent, PhrasingContent } from 'mdast'
import { splitCitations } from './citations'

export type ChatInline =
  | { kind: 'text'; value: string }
  | { kind: 'cite'; n: number }
  | { kind: 'strong' | 'em' | 'del'; children: ChatInline[] }
  | { kind: 'code'; value: string }
  | { kind: 'break' }

export interface ChatListItem { checked: boolean | null; children: ChatBlock[] }

export type ChatBlock =
  | { kind: 'paragraph'; children: ChatInline[] }
  | { kind: 'heading'; depth: number; children: ChatInline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: ChatListItem[] }
  | { kind: 'code'; lang: string; value: string }
  | { kind: 'blockquote'; children: ChatBlock[] }
  | { kind: 'table'; header: ChatInline[][]; rows: ChatInline[][][] }
  | { kind: 'hr' }

// No remark-math: model answers like "costs $5 and $6" must stay plain text.
const processor = unified().use(remarkParse).use(remarkGfm)

type Loose = { value?: unknown; children?: unknown[] }

function textOf(node: Loose): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(child => textOf(child as Loose)).join('')
}

function inlines(nodes: PhrasingContent[]): ChatInline[] {
  const out: ChatInline[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push(...splitCitations(node.value))
        break
      case 'strong':
        out.push({ kind: 'strong', children: inlines(node.children) })
        break
      case 'emphasis':
        out.push({ kind: 'em', children: inlines(node.children) })
        break
      case 'delete':
        out.push({ kind: 'del', children: inlines(node.children) })
        break
      case 'inlineCode':
        out.push({ kind: 'code', value: node.value })
        break
      case 'break':
        out.push({ kind: 'break' })
        break
      case 'link':
      case 'linkReference':
        out.push(...inlines(node.children))
        break
      case 'image':
      case 'imageReference':
        if (node.alt) out.push({ kind: 'text', value: node.alt })
        break
      default: {
        // Raw html and unknown nodes surface as text, never as markup.
        const value = textOf(node as Loose)
        if (value) out.push({ kind: 'text', value })
      }
    }
  }
  return out
}

function blocks(nodes: RootContent[]): ChatBlock[] {
  const out: ChatBlock[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        out.push({ kind: 'paragraph', children: inlines(node.children) })
        break
      case 'heading':
        out.push({ kind: 'heading', depth: node.depth, children: inlines(node.children) })
        break
      case 'list':
        out.push({
          kind: 'list',
          ordered: !!node.ordered,
          start: node.start ?? 1,
          items: node.children.map(item => ({ checked: item.checked ?? null, children: blocks(item.children) })),
        })
        break
      case 'code':
        out.push({ kind: 'code', lang: node.lang ?? '', value: node.value })
        break
      case 'blockquote':
        out.push({ kind: 'blockquote', children: blocks(node.children) })
        break
      case 'table': {
        const [head, ...body] = node.children.map(row => row.children.map(cell => inlines(cell.children)))
        out.push({ kind: 'table', header: head ?? [], rows: body })
        break
      }
      case 'thematicBreak':
        out.push({ kind: 'hr' })
        break
      default: {
        const value = textOf(node as Loose)
        if (value) out.push({ kind: 'paragraph', children: [{ kind: 'text', value }] })
      }
    }
  }
  return out
}

export function parseChatMarkdown(text: string): ChatBlock[] {
  if (!text.trim()) return []
  try {
    return blocks((processor.parse(text) as Root).children)
  } catch {
    return [{ kind: 'paragraph', children: splitCitations(text) }]
  }
}
