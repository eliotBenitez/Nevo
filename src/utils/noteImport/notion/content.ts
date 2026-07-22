import type { BlockNode } from '../../../types/note'
import { transformCallouts } from '../obsidian/obsidianSyntax'

const DEFAULT_CALLOUT_ICON = '💡'
const LEADING_EMOJI_RE = /^(?:\p{RI}\p{RI}|[#*0-9]\ufe0f?\u20e3|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\ufe0f)?(?:\u200d\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\ufe0f)?)*)/u

function textContent(node: BlockNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(textContent).join('')
}

function normalizedTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripDuplicatePageTitle(doc: BlockNode, pageTitle: string): BlockNode {
  const [firstBlock, ...remainingBlocks] = doc.content ?? []
  const isMatchingTitle = firstBlock?.type === 'heading'
    && firstBlock.attrs?.level === 1
    && normalizedTitle(textContent(firstBlock)) === normalizedTitle(pageTitle)

  return isMatchingTitle ? { ...doc, content: remainingBlocks } : doc
}

function extractLeadingIcon(node: BlockNode): { icon: string; node: BlockNode | null } | null {
  if (node.type !== 'text' || !node.text) return null
  const leadingWhitespace = node.text.match(/^[ \t]*/)?.[0] ?? ''
  const text = node.text.slice(leadingWhitespace.length)
  const match = LEADING_EMOJI_RE.exec(text)
  if (!match) return null

  const remainder = text.slice(match[0].length).replace(/^[ \t]*(?:\n[ \t]*)?/, '')
  return {
    icon: match[0],
    node: remainder ? { ...node, text: remainder } : null,
  }
}

function normalizeCallout(node: BlockNode): BlockNode {
  const content = (node.content ?? []).map(normalizeCallout)
  if (node.type !== 'callout') return node.content ? { ...node, content } : node

  const [firstBlock, ...remainingBlocks] = content
  const [firstInline, ...remainingInline] = firstBlock?.type === 'paragraph' ? (firstBlock.content ?? []) : []
  const extracted = firstInline ? extractLeadingIcon(firstInline) : null
  if (!extracted) {
    return { ...node, attrs: { ...node.attrs, icon: node.attrs?.icon || DEFAULT_CALLOUT_ICON }, content }
  }

  const firstParagraphContent = extracted.node
    ? [extracted.node, ...remainingInline]
    : remainingInline
  const normalizedContent = firstParagraphContent.length > 0
    ? [{ ...firstBlock, content: firstParagraphContent }, ...remainingBlocks]
    : remainingBlocks

  return {
    ...node,
    attrs: { ...node.attrs, icon: extracted.icon },
    content: normalizedContent.length > 0 ? normalizedContent : [{ type: 'paragraph' }],
  }
}

/** Applies Notion-specific cleanup after the shared Markdown parser. */
export function normalizeNotionDocument(doc: BlockNode, pageTitle: string): BlockNode {
  return normalizeCallout(transformCallouts(stripDuplicatePageTitle(doc, pageTitle)))
}
