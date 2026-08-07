import type {
  CanvasRichTextBlock,
  CanvasRichTextBlockType,
  CanvasRichTextDocument,
  CanvasRichTextMark,
  CanvasRichTextSpan,
} from './types'

const BLOCK_TYPES = new Set<CanvasRichTextBlockType>(['paragraph', 'heading', 'bullet', 'number', 'todo', 'quote'])
const MARKS = new Set<CanvasRichTextMark>(['bold', 'italic', 'underline', 'strike', 'code'])
const MAX_BLOCKS = 200
const MAX_SPANS = 500
const MAX_TEXT_LENGTH = 20_000

function normalizedMarks(value: unknown): CanvasRichTextMark[] | undefined {
  if (!Array.isArray(value)) return undefined
  const marks = value
    .filter((mark): mark is CanvasRichTextMark => MARKS.has(mark as CanvasRichTextMark))
    .filter((mark, index, all) => all.indexOf(mark) === index)
  return marks.length ? marks : undefined
}

function normalizeSpan(value: unknown): CanvasRichTextSpan | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<CanvasRichTextSpan>
  if (typeof source.text !== 'string') return null
  const valueText = source.text.slice(0, MAX_TEXT_LENGTH)
  const marks = normalizedMarks(source.marks)
  return { text: valueText, ...(marks ? { marks } : {}) }
}

function normalizeBlock(value: unknown): CanvasRichTextBlock | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<CanvasRichTextBlock>
  const type = BLOCK_TYPES.has(source.type as CanvasRichTextBlockType)
    ? source.type as CanvasRichTextBlockType
    : 'paragraph'
  const spans = Array.isArray(source.spans)
    ? source.spans.slice(0, MAX_SPANS).flatMap(span => normalizeSpan(span) ?? [])
    : []
  const level = type === 'heading' && [1, 2, 3].includes(Number(source.level))
    ? Number(source.level) as 1 | 2 | 3
    : undefined
  const checked = type === 'todo' ? source.checked === true : undefined
  return {
    type,
    spans: spans.length ? spans : [{ text: '' }],
    ...(level ? { level } : {}),
    ...(checked !== undefined ? { checked } : {}),
  }
}

export function emptyCanvasRichText(): CanvasRichTextDocument {
  return { blocks: [{ type: 'paragraph', spans: [{ text: '' }] }] }
}

export function normalizeCanvasRichText(value: unknown): CanvasRichTextDocument {
  if (!value || typeof value !== 'object') return emptyCanvasRichText()
  const source = value as Partial<CanvasRichTextDocument>
  const blocks = Array.isArray(source.blocks)
    ? source.blocks.slice(0, MAX_BLOCKS).flatMap(block => normalizeBlock(block) ?? [])
    : []
  return { blocks: blocks.length ? blocks : emptyCanvasRichText().blocks }
}

export function canvasRichTextFromPlainText(value: string): CanvasRichTextDocument {
  const blocks = value.slice(0, MAX_TEXT_LENGTH).split(/\r?\n/).slice(0, MAX_BLOCKS)
    .map(line => ({ type: 'paragraph' as const, spans: [{ text: line }] }))
  return { blocks: blocks.length ? blocks : emptyCanvasRichText().blocks }
}

export function canvasRichTextToPlainText(document: CanvasRichTextDocument): string {
  return normalizeCanvasRichText(document).blocks.map((block) => {
    const blockText = block.spans.map(span => span.text).join('')
    if (block.type === 'bullet') return `• ${blockText}`
    if (block.type === 'number') return `1. ${blockText}`
    if (block.type === 'todo') return `${block.checked ? '☑' : '☐'} ${blockText}`
    if (block.type === 'quote') return `“${blockText}”`
    return blockText
  }).join('\n')
}

export function canvasRichTextLines(document: CanvasRichTextDocument): CanvasRichTextBlock[] {
  return normalizeCanvasRichText(document).blocks.map(block => ({ ...block }))
}
