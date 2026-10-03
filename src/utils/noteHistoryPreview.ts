import type { BlockNode } from '../types/note'

/**
 * Read-only preview model for the history screen's "As note" view. Turns a
 * snapshot's `content` (or the current note's) into a small, render-agnostic
 * tree that Vue components can walk without touching ProseMirror or the live
 * editor. Pure functions only — no Vue, no I/O, no mutation of the input.
 */

export type HistoryInlineMark =
  | 'strong'
  | 'em'
  | 'code'
  | 'strike'
  | 'underline'
  | 'highlight'
  | 'link'
  | 'superscript'
  | 'subscript'

export interface HistoryInlineRun {
  kind: 'text' | 'break' | 'math' | 'atom'
  text: string
  marks: HistoryInlineMark[]
  /** link target, shown as text only — never rendered as a live anchor */
  href?: string
}

export type HistoryPreviewBlock =
  | { kind: 'paragraph'; runs: HistoryInlineRun[] }
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; runs: HistoryInlineRun[] }
  | { kind: 'quote'; children: HistoryPreviewBlock[] }
  | { kind: 'code'; language: string | null; text: string }
  | { kind: 'list'; ordered: boolean; items: HistoryPreviewBlock[][] }
  | { kind: 'checklist'; checked: boolean; children: HistoryPreviewBlock[] }
  | { kind: 'callout'; variant: string | null; icon: string | null; children: HistoryPreviewBlock[] }
  | { kind: 'toggle'; title: HistoryInlineRun[]; children: HistoryPreviewBlock[] }
  | { kind: 'table'; rows: Array<Array<{ header: boolean; blocks: HistoryPreviewBlock[] }>> }
  | { kind: 'image'; src: string | null; alt: string; caption: string; external: boolean; externalUrl: string | null }
  | { kind: 'divider' }
  | { kind: 'math'; latex: string }
  | { kind: 'unsupported'; type: string; text: string }

const KNOWN_MARKS: readonly HistoryInlineMark[] = [
  'strong',
  'em',
  'code',
  'strike',
  'underline',
  'highlight',
  'link',
  'superscript',
  'subscript',
]

const HEADING_LEVELS = new Set([1, 2, 3, 4, 5, 6])

/** URLs with an explicit scheme other than `data:image/…` are never trusted
 *  as an image source or a live link — only `data:image/…` and scheme-less
 *  (workspace-relative) paths render. */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

export function buildHistoryPreview(content: BlockNode): HistoryPreviewBlock[] {
  if (content.type !== 'doc' || !content.content?.length) return []
  return content.content.map(buildBlock)
}

function buildChildren(nodes: BlockNode[] | undefined): HistoryPreviewBlock[] {
  return (nodes ?? []).map(buildBlock)
}

function buildBlock(node: BlockNode): HistoryPreviewBlock {
  switch (node.type) {
    case 'paragraph':
      return { kind: 'paragraph', runs: buildRuns(node.content) }
    case 'heading':
      return { kind: 'heading', level: normalizeHeadingLevel(node.attrs?.level), runs: buildRuns(node.content) }
    case 'blockquote':
      return { kind: 'quote', children: buildChildren(node.content) }
    case 'code_block':
      return { kind: 'code', language: normalizeStringAttr(node.attrs?.language), text: collectRawText(node) }
    case 'bullet_list':
      return { kind: 'list', ordered: false, items: buildListItems(node.content) }
    case 'ordered_list':
      return { kind: 'list', ordered: true, items: buildListItems(node.content) }
    case 'checklist_item':
      // checklist_item's own content is inline (like a paragraph, not block
      // children) — wrap it as a single paragraph so `children` stays a
      // HistoryPreviewBlock[] as the interface declares.
      return {
        kind: 'checklist',
        checked: node.attrs?.checked === true,
        children: [{ kind: 'paragraph', runs: buildRuns(node.content) }],
      }
    case 'callout':
      return {
        kind: 'callout',
        variant: normalizeStringAttr(node.attrs?.variant),
        icon: normalizeStringAttr(node.attrs?.icon),
        children: buildChildren(node.content),
      }
    case 'toggle':
      return buildToggle(node)
    case 'table':
      return { kind: 'table', rows: buildTableRows(node.content) }
    case 'image_block':
      return buildImage(node)
    case 'divider':
    case 'horizontal_rule':
      return { kind: 'divider' }
    case 'math_block':
      return { kind: 'math', latex: normalizeStringAttr(node.attrs?.latex) ?? '' }
    default:
      return { kind: 'unsupported', type: node.type, text: collectRawText(node).trim() }
  }
}

function buildListItems(items: BlockNode[] | undefined): HistoryPreviewBlock[][] {
  return (items ?? []).map(item => buildChildren(item.content))
}

function buildToggle(node: BlockNode): HistoryPreviewBlock {
  const content = node.content ?? []
  const [first, ...rest] = content
  const hasTitle = first?.type === 'toggle_title'
  const title = hasTitle ? buildRuns(first.content) : []
  const childrenNodes = hasTitle ? rest : content
  return { kind: 'toggle', title, children: buildChildren(childrenNodes) }
}

function buildTableRows(rows: BlockNode[] | undefined): Array<Array<{ header: boolean; blocks: HistoryPreviewBlock[] }>> {
  return (rows ?? []).map(row =>
    (row.content ?? []).map(cell => ({
      header: cell.type === 'table_header',
      blocks: buildChildren(cell.content),
    })),
  )
}

function buildImage(node: BlockNode): HistoryPreviewBlock {
  const rawSrc = normalizeStringAttr(node.attrs?.src) ?? ''
  const alt = normalizeStringAttr(node.attrs?.alt) ?? ''
  const caption = normalizeStringAttr(node.attrs?.caption) ?? ''
  const { src, external, externalUrl } = resolveImageSrc(rawSrc)
  return { kind: 'image', src, alt, caption, external, externalUrl }
}

function resolveImageSrc(rawSrc: string): { src: string | null; external: boolean; externalUrl: string | null } {
  if (!rawSrc) return { src: null, external: false, externalUrl: null }
  if (rawSrc.startsWith('data:image/')) return { src: rawSrc, external: false, externalUrl: null }
  if (SCHEME_RE.test(rawSrc)) {
    // Never trusted as an <img src> or a live link, but the raw address is
    // still safe — and useful — to show as inert text (see HistoryPreviewBlock.vue).
    return { src: null, external: true, externalUrl: rawSrc }
  }
  return { src: rawSrc, external: false, externalUrl: null }
}

function buildRuns(nodes: BlockNode[] | undefined): HistoryInlineRun[] {
  return (nodes ?? []).map(buildRun)
}

function buildRun(node: BlockNode): HistoryInlineRun {
  if (node.type === 'text') {
    return { kind: 'text', text: node.text ?? '', ...buildMarks(node.marks) }
  }
  if (node.type === 'hard_break') {
    return { kind: 'break', text: '', marks: [] }
  }
  if (node.type === 'math_inline') {
    return { kind: 'math', text: normalizeStringAttr(node.attrs?.latex) ?? '', marks: [] }
  }
  return { kind: 'atom', text: '', marks: [] }
}

function buildMarks(marks: BlockNode['marks']): { marks: HistoryInlineMark[]; href?: string } {
  const known: HistoryInlineMark[] = []
  let href: string | undefined
  for (const mark of marks ?? []) {
    if (!KNOWN_MARKS.includes(mark.type as HistoryInlineMark)) continue
    known.push(mark.type as HistoryInlineMark)
    if (mark.type === 'link' && typeof mark.attrs?.href === 'string') href = mark.attrs.href
  }
  return href !== undefined ? { marks: known, href } : { marks: known }
}

function normalizeHeadingLevel(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  return typeof value === 'number' && HEADING_LEVELS.has(value) ? (value as 1 | 2 | 3 | 4 | 5 | 6) : 1
}

function normalizeStringAttr(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Collects raw inline text (unTrimmed — callers trim where whitespace isn't
 *  meaningful, e.g. `unsupported`, but not for `code`, where it is). */
function collectRawText(node: BlockNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hard_break') return '\n'
  if (!node.content?.length) return ''
  return node.content.map(collectRawText).join('')
}
