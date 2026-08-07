import type { BlockNode } from '../../types/note'

export interface ProcessedNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: BlockNode['marks']
  content?: ProcessedNode[]
  headingPrefix?: string
  continuesFromPreviousPage?: boolean
  continuesOnNextPage?: boolean
}

export interface NodeSplit {
  before: ProcessedNode | null
  after: ProcessedNode | null
}

export interface TablePageFragment {
  node: ProcessedNode
  height: number
}

export interface TablePaginationResult {
  fragments: TablePageFragment[]
  startsOnNextPage: boolean
}

function cloneNode(node: ProcessedNode, content?: ProcessedNode[]): ProcessedNode {
  const clone: ProcessedNode = {
    ...node,
    attrs: node.attrs ? { ...node.attrs } : undefined,
    marks: node.marks ? [...node.marks] : undefined,
    content,
  }
  return clone
}

export function processedNodeTextLength(node: ProcessedNode): number {
  if (node.type === 'text') return node.text?.length ?? 0
  return (node.content ?? []).reduce((total, child) => total + processedNodeTextLength(child), 0)
}

export function processedNodeText(node: ProcessedNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(processedNodeText).join('')
}

export function splitProcessedNodeAt(node: ProcessedNode, offset: number): NodeSplit {
  const totalLength = processedNodeTextLength(node)
  const splitOffset = Math.min(totalLength, Math.max(0, offset))

  if (node.type === 'text') {
    const text = node.text ?? ''
    const beforeText = text.slice(0, splitOffset)
    const afterText = text.slice(splitOffset)
    return {
      before: beforeText ? { ...cloneNode(node), text: beforeText } : null,
      after: afterText ? { ...cloneNode(node), text: afterText } : null,
    }
  }

  if (!node.content?.length || totalLength === 0) {
    return splitOffset >= totalLength
      ? { before: cloneNode(node, node.content ? [...node.content] : undefined), after: null }
      : { before: null, after: cloneNode(node, node.content ? [...node.content] : undefined) }
  }

  if (splitOffset === 0) return { before: null, after: cloneNode(node, [...node.content]) }
  if (splitOffset === totalLength) return { before: cloneNode(node, [...node.content]), after: null }

  const beforeChildren: ProcessedNode[] = []
  const afterChildren: ProcessedNode[] = []
  let consumed = 0
  let splitFound = false

  for (const child of node.content) {
    const childLength = processedNodeTextLength(child)
    if (splitFound) {
      afterChildren.push(child)
      continue
    }
    if (childLength === 0 || consumed + childLength <= splitOffset) {
      beforeChildren.push(child)
      consumed += childLength
      continue
    }
    if (consumed >= splitOffset) {
      afterChildren.push(child)
      splitFound = true
      continue
    }

    const childSplit = splitProcessedNodeAt(child, splitOffset - consumed)
    if (childSplit.before) beforeChildren.push(childSplit.before)
    if (childSplit.after) afterChildren.push(childSplit.after)
    consumed += childLength
    splitFound = true
  }

  const before = beforeChildren.length ? cloneNode(node, beforeChildren) : null
  const after = afterChildren.length ? cloneNode(node, afterChildren) : null
  if (after) after.headingPrefix = undefined
  return { before, after }
}

interface SegmentData {
  segment: string
  index: number
  isWordLike?: boolean
}

interface SegmenterInstance {
  segment(input: string): Iterable<SegmentData>
}

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'word' | 'grapheme' },
) => SegmenterInstance

function segmentEnds(text: string, granularity: 'word' | 'grapheme'): number[] {
  if (!text) return []
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter
  if (!Segmenter) {
    return granularity === 'word'
      ? Array.from(text.matchAll(/\s+|$/gu), match => match.index + match[0].length).filter(Boolean)
      : Array.from(text).reduce<number[]>((ends, value) => {
          ends.push((ends.length ? ends[ends.length - 1] : 0) + value.length)
          return ends
        }, [])
  }
  const segmenter = new Segmenter(undefined, { granularity })
  const ends: number[] = []
  for (const segment of segmenter.segment(text)) {
    if (granularity === 'grapheme' || segment.isWordLike || /\s/u.test(segment.segment)) {
      ends.push(segment.index + segment.segment.length)
    }
  }
  return ends
}

export function textBreakOffsets(text: string): { words: number[]; graphemes: number[] } {
  const normalize = (values: number[]) => [...new Set([...values, text.length])]
    .filter(value => value > 0 && value <= text.length)
    .sort((a, b) => a - b)

  return {
    words: normalize(segmentEnds(text, 'word')),
    graphemes: normalize(segmentEnds(text, 'grapheme')),
  }
}

export function markPageContinuation(
  node: ProcessedNode,
  fromPreviousPage: boolean,
  onNextPage: boolean,
): ProcessedNode {
  return {
    ...node,
    continuesFromPreviousPage: fromPreviousPage,
    continuesOnNextPage: onNextPage,
  }
}

function isHeaderRow(row: ProcessedNode | undefined): boolean {
  return row?.type === 'table_row'
    && Boolean(row.content?.some(cell => cell.type === 'table_header'))
}

export function paginateTableRows(
  table: ProcessedNode,
  rowHeights: number[],
  tableExtraHeight: number,
  firstPageCapacity: number,
  fullPageCapacity: number,
): TablePaginationResult | null {
  const rows = (table.content ?? []).filter(row => row.type === 'table_row')
  if (table.type !== 'table' || rows.length === 0 || rows.length !== rowHeights.length) return null

  const extraHeight = Math.max(0, tableExtraHeight)
  const fullCapacity = Math.max(0, fullPageCapacity)
  const hasHeader = isHeaderRow(rows[0])
  const headerRows = hasHeader ? [rows[0]] : []
  const headerHeight = hasHeader ? Math.max(0, rowHeights[0]) : 0
  const firstDataIndex = hasHeader ? 1 : 0
  const minimumRowsHeight = firstDataIndex < rows.length
    ? headerHeight + Math.max(0, rowHeights[firstDataIndex])
    : headerHeight
  const minimumFragmentHeight = extraHeight + minimumRowsHeight
  const startsOnNextPage = firstPageCapacity + 0.5 < minimumFragmentHeight
    && firstPageCapacity + 0.5 < fullCapacity

  const fragments: TablePageFragment[] = []
  let rowIndex = firstDataIndex
  let capacity = startsOnNextPage ? fullCapacity : Math.max(0, firstPageCapacity)

  if (firstDataIndex === rows.length) {
    return {
      fragments: [{
        node: cloneNode(table, [...headerRows]),
        height: minimumFragmentHeight,
      }],
      startsOnNextPage,
    }
  }

  while (rowIndex < rows.length) {
    const fragmentRows = [...headerRows]
    let fragmentHeight = extraHeight + headerHeight
    let dataRowsAdded = 0

    while (rowIndex < rows.length) {
      const rowHeight = Math.max(0, rowHeights[rowIndex])
      if (dataRowsAdded > 0 && fragmentHeight + rowHeight > capacity + 0.5) break
      if (dataRowsAdded === 0 && fragmentHeight + rowHeight > capacity + 0.5) {
        fragmentRows.push(rows[rowIndex++])
        fragmentHeight += rowHeight
        break
      }
      fragmentRows.push(rows[rowIndex++])
      fragmentHeight += rowHeight
      dataRowsAdded++
    }

    const fragmentIndex = fragments.length
    const continuesOnNextPage = rowIndex < rows.length
    fragments.push({
      node: markPageContinuation(
        cloneNode(table, fragmentRows),
        fragmentIndex > 0,
        continuesOnNextPage,
      ),
      height: fragmentHeight,
    })
    capacity = fullCapacity
  }

  return { fragments, startsOnNextPage }
}
