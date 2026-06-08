import { Node as PMNode, Schema } from 'prosemirror-model'
import type { BlockNode } from '../types/note'
import { plainTextToNoteContent } from '../utils/noteContent'

function fallbackDocFromUnknown(content: unknown): BlockNode {
  if (typeof content === 'string') {
    return plainTextToNoteContent(content)
  }
  return plainTextToNoteContent('')
}

function isInlineCalloutChild(node: BlockNode): boolean {
  return node.type === 'text' || node.type === 'hard_break' || node.type === 'math_inline'
}

function createParagraphNode(content?: BlockNode[]): BlockNode {
  if (!content || content.length === 0) {
    return { type: 'paragraph' }
  }

  return { type: 'paragraph', content }
}

function normalizeCalloutContent(content: BlockNode[] | undefined): BlockNode[] {
  if (!content || content.length === 0) return [createParagraphNode()]

  const normalizedChildren = content.map(normalizeBlockNode)
  const result: BlockNode[] = []
  let inlineBuffer: BlockNode[] = []

  const flushInlineBuffer = () => {
    if (inlineBuffer.length === 0) return
    result.push(createParagraphNode(inlineBuffer))
    inlineBuffer = []
  }

  for (const child of normalizedChildren) {
    if (isInlineCalloutChild(child)) {
      inlineBuffer.push(child)
      continue
    }
    flushInlineBuffer()
    result.push(child)
  }

  flushInlineBuffer()

  if (result.length === 0) return [createParagraphNode()]
  return result
}

function normalizeBlockNode(node: BlockNode): BlockNode {
  if (node.type === 'callout') {
    return {
      ...node,
      attrs: node.attrs
        ? Object.fromEntries(Object.entries(node.attrs).filter(([key]) => key !== 'text'))
        : undefined,
      content: normalizeCalloutContent(node.content),
    }
  }

  if (node.type === 'toggle') {
    const children = node.content?.map(normalizeBlockNode) ?? []
    const hasTitle = children.length > 0 && children[0].type === 'toggle_title'
    const normalized = hasTitle ? children : [{ type: 'toggle_title', content: [{ type: 'text', text: 'Toggle' }] }, ...children]
    const bodyBlocks = normalized.slice(1)
    const content = bodyBlocks.length === 0 ? [...normalized, { type: 'paragraph' }] : normalized
    return {
      ...node,
      content,
    }
  }

  return {
    ...node,
    content: node.content?.map(normalizeBlockNode),
  }
}

function normalizeNoteContent(content: unknown): unknown {
  if (!content || typeof content !== 'object') return content
  if (!('type' in content) || typeof (content as BlockNode).type !== 'string') return content
  return normalizeBlockNode(content as BlockNode)
}

export function parseNoteContentToDoc(schema: Schema, content: unknown): PMNode {
  try {
    return schema.nodeFromJSON(normalizeNoteContent(content))
  } catch {
    return schema.nodeFromJSON(fallbackDocFromUnknown(content))
  }
}

export function serializeDocToNoteContent(doc: PMNode): BlockNode {
  return doc.toJSON() as BlockNode
}
