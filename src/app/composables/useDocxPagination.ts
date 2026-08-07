import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { BlockNode, NoteDocument } from '../../types/note'
import {
  createDocxPageGeometry,
  mmToPx,
  ptToPx,
  twipToPx,
} from '../../utils/noteExport/docxLayout'
import type { DocxOrientation, DocxPaperFormat } from '../../utils/noteExport/docxOptions'
import {
  markPageContinuation,
  paginateTableRows,
  processedNodeText,
  processedNodeTextLength,
  splitProcessedNodeAt,
  textBreakOffsets,
  type ProcessedNode,
} from '../../utils/noteExport/docxPagination'
import {
  DOCX_BLOCKQUOTE_LEFT_INDENT_TWIPS,
  DOCX_CODE_FONT_SIZE_PT,
  DOCX_HEADING_STYLES,
  DOCX_LIST_LEFT_INDENT_TWIPS,
  DOCX_TITLE_PAGE_FONT_SIZE_PT,
  DOCX_TITLE_STYLE,
} from '../../utils/noteExport/docxTypography'

export type { ProcessedNode } from '../../utils/noteExport/docxPagination'

export interface ContentPage {
  nodes: ProcessedNode[]
  hasTitle?: boolean
}

export interface PreviewPage {
  id: string
  type: 'title' | 'toc' | 'content'
  pageNumber: number
  contentPageIndex?: number
}

export interface DocxPaginationInput {
  note: Ref<NoteDocument>
  paperFormat: Ref<DocxPaperFormat>
  orientation: Ref<DocxOrientation>
  fontSize: Ref<number>
  fontFamily: Ref<string>
  marginTop: Ref<number>
  marginRight: Ref<number>
  marginBottom: Ref<number>
  marginLeft: Ref<number>
  lineSpacing: Ref<number>
  paragraphSpacing: Ref<number>
  headingNumbers: Ref<boolean>
  tableOfContents: Ref<boolean>
  titlePage: Ref<boolean>
  exportNoteTitle: Ref<boolean>
  surfaceWidth: Ref<number>
  zoom: Ref<number>
  fitWidth: Ref<boolean>
  hiddenContainerRef: Ref<HTMLElement | null>
}

interface TextPosition {
  node: Text
  start: number
  end: number
}

interface TextMeasurement {
  positions: TextPosition[]
  wrapperRect: DOMRect
  fullRangeRect: DOMRect
}

function processNodes(node: BlockNode, headingCounters: number[], headingNumbers: boolean): ProcessedNode {
  const result: ProcessedNode = {
    type: node.type,
    text: node.text,
    attrs: node.attrs,
    marks: node.marks,
  }

  if (node.type === 'heading' && headingNumbers) {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
    headingCounters[level - 1]++
    for (let i = level; i < 6; i++) headingCounters[i] = 0
    const segments = headingCounters.slice(0, level)
    while (segments.length > 1 && segments[0] === 0) segments.shift()
    result.headingPrefix = `${segments.join('.')}. `
  }

  if (node.content) {
    result.content = node.content.map(child => processNodes(child, headingCounters, headingNumbers))
  }

  return result
}

function prepareNodesForPagination(nodes: ProcessedNode[]): ProcessedNode[] {
  const result: ProcessedNode[] = []

  for (const node of nodes) {
    if ((node.type === 'bullet_list' || node.type === 'ordered_list') && node.content) {
      let itemIndex = Number(node.attrs?.start ?? 1)
      for (const item of node.content) {
        if (item.type === 'list_item') {
          result.push({
            type: node.type,
            attrs: { ...node.attrs, start: itemIndex++ },
            content: [item],
          })
        } else {
          result.push(item)
        }
      }
    } else {
      result.push(node)
    }
  }

  return result
}

function boxHeight(element: Element): number {
  return Math.max(0, element.getBoundingClientRect().height)
}

function collectTextMeasurement(wrapper: HTMLElement): TextMeasurement | null {
  if (typeof document === 'undefined' || typeof document.createRange !== 'function') return null
  const positions: TextPosition[] = []
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT)
  let offset = 0
  let current = walker.nextNode()

  while (current) {
    const textNode = current as Text
    const parent = textNode.parentElement
    if (!parent?.closest('[data-docx-generated]') && textNode.data.length > 0) {
      positions.push({ node: textNode, start: offset, end: offset + textNode.data.length })
      offset += textNode.data.length
    }
    current = walker.nextNode()
  }

  if (!positions.length) return null
  const range = document.createRange()
  range.setStart(positions[0].node, 0)
  const last = positions[positions.length - 1]
  range.setEnd(last.node, last.node.data.length)
  if (typeof range.getBoundingClientRect !== 'function') return null
  const fullRangeRect = range.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  if (fullRangeRect.height <= 0 || wrapperRect.height <= 0) return null
  return { positions, wrapperRect, fullRangeRect }
}

function resolveDomOffset(positions: TextPosition[], offset: number): { node: Text; offset: number } {
  for (const position of positions) {
    if (offset <= position.end) {
      return {
        node: position.node,
        offset: Math.max(0, Math.min(position.node.data.length, offset - position.start)),
      }
    }
  }
  const last = positions[positions.length - 1]
  return { node: last.node, offset: last.node.data.length }
}

function measuredSliceHeight(
  measurement: TextMeasurement,
  start: number,
  end: number,
  includeTop: boolean,
  includeBottom: boolean,
): number {
  const startPosition = resolveDomOffset(measurement.positions, start)
  const endPosition = resolveDomOffset(measurement.positions, end)
  const range = document.createRange()
  range.setStart(startPosition.node, startPosition.offset)
  range.setEnd(endPosition.node, endPosition.offset)
  const rect = range.getBoundingClientRect()
  const topExtra = Math.max(0, measurement.fullRangeRect.top - measurement.wrapperRect.top)
  const bottomExtra = Math.max(0, measurement.wrapperRect.bottom - measurement.fullRangeRect.bottom)
  return Math.max(0, rect.height)
    + (includeTop ? topExtra : 0)
    + (includeBottom ? bottomExtra : 0)
}

function largestFittingOffset(
  offsets: number[],
  start: number,
  totalLength: number,
  capacity: number,
  measurement: TextMeasurement,
): number | null {
  const candidates = offsets.filter(offset => offset > start)
  let low = 0
  let high = candidates.length - 1
  let best: number | null = null

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const end = candidates[middle]
    const height = measuredSliceHeight(measurement, start, end, start === 0, end === totalLength)
    if (height <= capacity + 0.5) {
      best = end
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return best
}

function sliceProcessedNode(node: ProcessedNode, start: number, end: number): ProcessedNode | null {
  const throughEnd = splitProcessedNodeAt(node, end).before
  if (!throughEnd) return null
  if (start === 0) return throughEnd
  return splitProcessedNodeAt(throughEnd, start).after
}

export function useDocxPagination(input: DocxPaginationInput) {
  const contentPages = ref<ContentPage[]>([])

  const geometry = computed(() => createDocxPageGeometry({
    paperFormat: input.paperFormat.value,
    orientation: input.orientation.value,
    marginTop: input.marginTop.value,
    marginRight: input.marginRight.value,
    marginBottom: input.marginBottom.value,
    marginLeft: input.marginLeft.value,
  }))

  const pageStyleWidthPx = computed(() => {
    if (input.fitWidth.value) return Math.max(100, input.surfaceWidth.value - 40)
    return geometry.value.pageWidthPx * (input.zoom.value / 100)
  })

  const pageScale = computed(() => pageStyleWidthPx.value / geometry.value.pageWidthPx)
  const pageHeightPx = computed(() => geometry.value.pageHeightPx * pageScale.value)
  const usableHeightPx = computed(() => geometry.value.contentHeightPx * pageScale.value)

  const pageStyle = computed<Record<string, string>>(() => {
    const scale = pageScale.value
    const scaledPoints = (points: number) => `${ptToPx(points) * scale}px`
    const fontStack = input.fontFamily.value
      ? `'${input.fontFamily.value.replace(/'/gu, "\\'")}', Calibri, Carlito, Arial, sans-serif`
      : 'Calibri, Carlito, Arial, sans-serif'
    const headingFontSize = (level: number) => {
      return DOCX_HEADING_STYLES[level - 1]?.fontSizePt ?? input.fontSize.value
    }
    const headingColor = (level: number) => {
      return `#${DOCX_HEADING_STYLES[level - 1]?.color ?? '1A1A1A'}`
    }

    return {
      flex: '0 0 auto',
      width: `${pageStyleWidthPx.value}px`,
      height: `${pageHeightPx.value}px`,
      overflow: 'hidden',
      '--docx-page-scale': String(scale),
      '--docx-font-family': fontStack,
      '--docx-font-size': `${ptToPx(input.fontSize.value) * scale}px`,
      '--docx-padding-top': `${mmToPx(geometry.value.marginsMm.top) * scale}px`,
      '--docx-padding-right': `${mmToPx(geometry.value.marginsMm.right) * scale}px`,
      '--docx-padding-bottom': `${mmToPx(geometry.value.marginsMm.bottom) * scale}px`,
      '--docx-padding-left': `${mmToPx(geometry.value.marginsMm.left) * scale}px`,
      '--docx-header-distance': `${mmToPx(geometry.value.headerDistanceMm) * scale}px`,
      '--docx-footer-distance': `${mmToPx(geometry.value.footerDistanceMm) * scale}px`,
      '--docx-content-width': `${geometry.value.contentWidthPx * scale}px`,
      '--docx-content-height': `${geometry.value.contentHeightPx * scale}px`,
      '--docx-line-height': String(input.lineSpacing.value),
      '--docx-paragraph-spacing': scaledPoints(input.paragraphSpacing.value),
      '--docx-title-page-font-size': scaledPoints(DOCX_TITLE_PAGE_FONT_SIZE_PT),
      '--docx-title-font-size': scaledPoints(DOCX_TITLE_STYLE.fontSizePt ?? input.fontSize.value),
      '--docx-heading-1-font-size': scaledPoints(headingFontSize(1)),
      '--docx-heading-2-font-size': scaledPoints(headingFontSize(2)),
      '--docx-heading-3-font-size': scaledPoints(headingFontSize(3)),
      '--docx-heading-4-font-size': scaledPoints(headingFontSize(4)),
      '--docx-heading-5-font-size': scaledPoints(headingFontSize(5)),
      '--docx-heading-6-font-size': scaledPoints(headingFontSize(6)),
      '--docx-heading-1-color': headingColor(1),
      '--docx-heading-2-color': headingColor(2),
      '--docx-heading-3-color': headingColor(3),
      '--docx-heading-4-color': headingColor(4),
      '--docx-heading-5-color': headingColor(5),
      '--docx-heading-6-color': headingColor(6),
      '--docx-code-font-size': scaledPoints(DOCX_CODE_FONT_SIZE_PT),
      '--docx-list-left-indent': `${twipToPx(DOCX_LIST_LEFT_INDENT_TWIPS) * scale}px`,
      '--docx-blockquote-left-indent': `${twipToPx(DOCX_BLOCKQUOTE_LEFT_INDENT_TWIPS) * scale}px`,
    }
  })

  const processedContent = computed<ProcessedNode | null>(() => {
    const counters = [0, 0, 0, 0, 0, 0]
    return processNodes(input.note.value.content, counters, input.headingNumbers.value)
  })

  const paginatedContentNodes = computed<ProcessedNode[]>(() => {
    return prepareNodesForPagination(processedContent.value?.content ?? [])
  })

  const pages = computed<PreviewPage[]>(() => {
    const list: PreviewPage[] = []
    let currentPage = 1

    if (input.exportNoteTitle.value && input.titlePage.value) {
      list.push({ id: 'title', type: 'title', pageNumber: currentPage++ })
    }
    if (input.tableOfContents.value) {
      list.push({ id: 'toc', type: 'toc', pageNumber: currentPage++ })
    }

    const content = contentPages.value.length
      ? contentPages.value
      : [{ nodes: paginatedContentNodes.value }]
    content.forEach((_page, index) => {
      list.push({ id: `content-${index}`, type: 'content', pageNumber: currentPage++, contentPageIndex: index })
    })

    return list
  })

  async function updatePagination() {
    await nextTick()
    if (typeof window !== 'undefined' && !window.navigator.userAgent.includes('jsdom')) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    const hiddenPage = input.hiddenContainerRef.value
    const contentContainer = hiddenPage?.querySelector('.docx-page__content')
    const nodes = paginatedContentNodes.value
    if (!hiddenPage || !contentContainer) {
      contentPages.value = [{ nodes }]
      return
    }

    const wrappers = Array.from(
      contentContainer.querySelectorAll<HTMLElement>('.docx-preview-node-wrapper[data-docx-node-index]'),
    )
    if (!wrappers.length) {
      contentPages.value = [{ nodes: [] }]
      return
    }

    const limit = usableHeightPx.value
    const pagesList: ContentPage[] = []
    let currentPageNodes: ProcessedNode[] = []
    let currentPageHeight = 0
    let currentPageHasTitle = false

    const titleWrapper = contentContainer.querySelector<HTMLElement>('[data-docx-title]')
    if (titleWrapper) {
      currentPageHeight = boxHeight(titleWrapper)
      currentPageHasTitle = true
    }

    const flushPage = () => {
      if (!currentPageNodes.length && !currentPageHasTitle) return
      pagesList.push({ nodes: currentPageNodes, hasTitle: currentPageHasTitle })
      currentPageNodes = []
      currentPageHeight = 0
      currentPageHasTitle = false
    }

    for (let index = 0; index < wrappers.length; index++) {
      const wrapper = wrappers[index]
      const node = nodes[index]
      if (!node) continue
      const height = boxHeight(wrapper)

      if (node.type === 'table') {
        const table = wrapper.querySelector<HTMLTableElement>(':scope > table.docx-page__table')
        const rows = table?.tBodies[0] ? Array.from(table.tBodies[0].rows) : []
        const rowHeights = rows.map(boxHeight)
        const tableExtraHeight = Math.max(
          0,
          height - rowHeights.reduce((total, rowHeight) => total + rowHeight, 0),
        )
        const tablePagination = paginateTableRows(
          node,
          rowHeights,
          tableExtraHeight,
          limit - currentPageHeight,
          limit,
        )

        if (tablePagination) {
          if (tablePagination.startsOnNextPage) flushPage()
          for (const fragment of tablePagination.fragments) {
            if (currentPageHeight > 0 && currentPageHeight + fragment.height > limit + 0.5) {
              flushPage()
            }
            currentPageNodes.push(fragment.node)
            currentPageHeight += Math.min(fragment.height, limit)
            if (fragment.node.continuesOnNextPage) flushPage()
          }
          continue
        }
      }

      if (height <= limit + 0.5) {
        if (currentPageHeight > 0 && currentPageHeight + height > limit + 0.5) flushPage()
        currentPageNodes.push(node)
        currentPageHeight += height
        continue
      }

      const text = processedNodeText(node)
      const totalLength = processedNodeTextLength(node)
      const measurement = collectTextMeasurement(wrapper)
      if (!measurement || !text || totalLength !== text.length) {
        if (currentPageHeight > 0) flushPage()
        currentPageNodes.push(node)
        currentPageHeight = Math.min(height, limit)
        flushPage()
        continue
      }

      const breaks = textBreakOffsets(text)
      let start = 0
      while (start < totalLength) {
        let capacity = limit - currentPageHeight
        let end = largestFittingOffset(breaks.words, start, totalLength, capacity, measurement)
          ?? largestFittingOffset(breaks.graphemes, start, totalLength, capacity, measurement)

        if (end === null && currentPageHeight > 0) {
          flushPage()
          capacity = limit
          end = largestFittingOffset(breaks.words, start, totalLength, capacity, measurement)
            ?? largestFittingOffset(breaks.graphemes, start, totalLength, capacity, measurement)
        }

        if (end === null) {
          end = breaks.graphemes.find(offset => offset > start) ?? totalLength
        }

        const fragment = sliceProcessedNode(node, start, end)
        if (!fragment) break
        const measuredHeight = measuredSliceHeight(
          measurement,
          start,
          end,
          start === 0,
          end === totalLength,
        )
        currentPageNodes.push(markPageContinuation(fragment, start > 0, end < totalLength))
        currentPageHeight += Math.min(measuredHeight, limit)
        start = end
        if (start < totalLength) flushPage()
      }
    }

    flushPage()
    contentPages.value = pagesList.length ? pagesList : [{ nodes: [] }]
  }

  watch(
    [
      paginatedContentNodes,
      input.paperFormat,
      input.orientation,
      input.fontSize,
      input.fontFamily,
      input.marginTop,
      input.marginRight,
      input.marginBottom,
      input.marginLeft,
      input.lineSpacing,
      input.paragraphSpacing,
      input.exportNoteTitle,
      input.titlePage,
      pageStyleWidthPx,
    ],
    () => {
      void updatePagination()
    },
    { immediate: true },
  )

  return {
    contentPages,
    geometry,
    pageScale,
    pageStyle,
    processedContent,
    paginatedContentNodes,
    pages,
    usableHeightPx,
    updatePagination,
  }
}
