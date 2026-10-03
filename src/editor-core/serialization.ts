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

export interface ParsedNoteContentToDoc {
  doc: PMNode
  /** True when `schema.nodeFromJSON` rejected the (normalized) content and the
   *  returned `doc` is the plain-text fallback rather than the real content.
   *  Callers that persist documents back to disk must treat this as "do not
   *  save over the original" — see `useEditorCore`'s note-open path. */
  degraded: boolean
}

export function parseNoteContentToDocSafe(schema: Schema, content: unknown): ParsedNoteContentToDoc {
  try {
    return { doc: schema.nodeFromJSON(normalizeNoteContent(content)), degraded: false }
  } catch (error) {
    // A failing `nodeFromJSON` collapses the whole note to a single empty
    // paragraph below, which surfaces as a "one giant block" / truncated note
    // on the canvas and as silent data loss elsewhere. Never swallow it: log
    // enough to identify the offending node before falling back.
    console.error('[editor-core] parseNoteContentToDoc: schema.nodeFromJSON failed, falling back to plain text', {
      error,
      topLevelType:
        content && typeof content === 'object' && 'type' in content
          ? (content as { type?: unknown }).type
          : typeof content,
    })
    return { doc: schema.nodeFromJSON(fallbackDocFromUnknown(content)), degraded: true }
  }
}

export function parseNoteContentToDoc(schema: Schema, content: unknown): PMNode {
  return parseNoteContentToDocSafe(schema, content).doc
}

/**
 * `Node.toJSON()` includes `attrs` whenever the node has ANY declared attrs,
 * regardless of value — so the lazily-assigned `id` attr (see
 * `schema/blockIdAttr.ts`) would otherwise appear as `id: null` on every
 * referenceable block, even ones that never became a reference target. That
 * would be pure noise in saved note JSON and would break `toEqual` compat
 * checks against pre-existing content. Strip it back out here so a block
 * with no assigned id serializes identically to before this attr existed;
 * a block WITH an id keeps `attrs.id` untouched.
 *
 * Builds new plain objects rather than mutating in place — `Node.toJSON()`
 * reuses the live node's `attrs` object by reference, so deleting keys on it
 * directly would corrupt the in-memory document.
 */
export function stripNullBlockIds<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripNullBlockIds) as unknown as T
  }
  if (!value || typeof value !== 'object') return value

  const node = value as Record<string, unknown>
  const result: Record<string, unknown> = { ...node }

  const attrs = result.attrs
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    const attrsRecord = attrs as Record<string, unknown>
    if (attrsRecord.id === null || attrsRecord.id === undefined) {
      const strippedAttrs = { ...attrsRecord }
      delete strippedAttrs.id
      if (Object.keys(strippedAttrs).length === 0) {
        delete result.attrs
      } else {
        result.attrs = strippedAttrs
      }
    }
  }

  if (Array.isArray(result.content)) {
    result.content = result.content.map(stripNullBlockIds)
  }

  return result as T
}

export function serializeDocToNoteContent(doc: PMNode): BlockNode {
  return stripNullBlockIds(doc.toJSON()) as BlockNode
}
