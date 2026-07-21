import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { NoteDocument } from '../../types/note'
import type { DocxOrientation, DocxPaperFormat } from '../../utils/noteExport/docxOptions'

export interface ProcessedNode {
  type: string
  text?: string
  attrs?: any
  marks?: any[]
  content?: ProcessedNode[]
  headingPrefix?: string
}

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

function canonicalWidthFor(format: DocxPaperFormat, orientation: DocxOrientation): number {
  if (format === 'Letter') {
    return orientation === 'landscape' ? 634 : 490
  }
  return orientation === 'landscape' ? 678 : 480
}

function processNodes(node: any, headingCounters: number[], headingNumbers: boolean): ProcessedNode {
  const result: ProcessedNode = {
    type: node.type,
    text: node.text,
    attrs: node.attrs,
    marks: node.marks,
  }

  if (node.type === 'heading' && headingNumbers) {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
    headingCounters[level - 1]++
    for (let i = level; i < 6; i++) {
      headingCounters[i] = 0
    }
    const segments = headingCounters.slice(0, level)
    while (segments.length > 1 && segments[0] === 0) segments.shift()
    result.headingPrefix = segments.join('.') + '. '
  }

  if (node.content) {
    result.content = node.content.map((child: any) => processNodes(child, headingCounters, headingNumbers))
  }

  return result
}

function prepareNodesForPagination(nodes: ProcessedNode[]): ProcessedNode[] {
  const result: ProcessedNode[] = []

  for (const node of nodes) {
    if ((node.type === 'bullet_list' || node.type === 'ordered_list') && node.content) {
      let itemIndex = 1
      for (const item of node.content) {
        if (item.type === 'list_item') {
          result.push({
            type: node.type,
            attrs: {
              ...node.attrs,
              start: itemIndex++,
            },
            headingPrefix: node.headingPrefix,
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

export function useDocxPagination(input: DocxPaginationInput) {
  const contentPages = ref<ContentPage[]>([])

  const paperWidthMm = computed(() => {
    const isLetter = input.paperFormat.value === 'Letter'
    const isLandscape = input.orientation.value === 'landscape'
    if (isLetter) {
      return isLandscape ? 279.4 : 215.9
    }
    return isLandscape ? 297 : 210
  })

  const paperHeightMm = computed(() => {
    const isLetter = input.paperFormat.value === 'Letter'
    const isLandscape = input.orientation.value === 'landscape'
    if (isLetter) {
      return isLandscape ? 215.9 : 279.4
    }
    return isLandscape ? 210 : 297
  })

  const pageStyleWidthPx = computed(() => {
    if (input.fitWidth.value) {
      return Math.max(100, input.surfaceWidth.value - 40)
    }
    const canonicalWidth = canonicalWidthFor(input.paperFormat.value, input.orientation.value)
    return canonicalWidth * (input.zoom.value / 100)
  })

  const pageHeightPx = computed(() => {
    return (pageStyleWidthPx.value * paperHeightMm.value) / paperWidthMm.value
  })

  const pageScale = computed(() => {
    const canonicalWidth = canonicalWidthFor(input.paperFormat.value, input.orientation.value)
    return pageStyleWidthPx.value / canonicalWidth
  })

  const paddingTopPx = computed(() => (input.marginTop.value / paperWidthMm.value) * pageStyleWidthPx.value)
  const paddingRightPx = computed(() => (input.marginRight.value / paperWidthMm.value) * pageStyleWidthPx.value)
  const paddingBottomPx = computed(() => (input.marginBottom.value / paperWidthMm.value) * pageStyleWidthPx.value)
  const paddingLeftPx = computed(() => (input.marginLeft.value / paperWidthMm.value) * pageStyleWidthPx.value)

  const usableHeightPx = computed(() => {
    return pageHeightPx.value - paddingTopPx.value - paddingBottomPx.value - 8
  })

  const pageStyle = computed(() => {
    const styles: Record<string, string> = {}

    styles.width = `${pageStyleWidthPx.value}px`
    styles.height = `${pageHeightPx.value}px`
    styles.overflow = 'hidden'

    styles['--docx-font-family'] = input.fontFamily.value
      ? `'${input.fontFamily.value}', sans-serif`
      : 'var(--font-ui)'
    styles['--docx-font-size'] = `${input.fontSize.value * pageScale.value}px`

    styles['--docx-padding-top'] = `${paddingTopPx.value}px`
    styles['--docx-padding-right'] = `${paddingRightPx.value}px`
    styles['--docx-padding-bottom'] = `${paddingBottomPx.value}px`
    styles['--docx-padding-left'] = `${paddingLeftPx.value}px`

    styles['--docx-line-height'] = String(input.lineSpacing.value)
    styles['--docx-paragraph-spacing'] = `${input.paragraphSpacing.value * pageScale.value}pt`

    return styles
  })

  const processedContent = computed<ProcessedNode | null>(() => {
    if (!input.note.value.content) return null
    const counters = [0, 0, 0, 0, 0, 0]
    return processNodes(input.note.value.content, counters, input.headingNumbers.value)
  })

  const paginatedContentNodes = computed<ProcessedNode[]>(() => {
    if (!processedContent.value || !processedContent.value.content) return []
    return prepareNodesForPagination(processedContent.value.content)
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

    if (contentPages.value.length === 0) {
      list.push({ id: 'content-fallback', type: 'content', pageNumber: currentPage++, contentPageIndex: undefined })
    } else {
      contentPages.value.forEach((_page, index) => {
        list.push({ id: `content-${index}`, type: 'content', pageNumber: currentPage++, contentPageIndex: index })
      })
    }

    return list
  })

  async function updatePagination() {
    await nextTick()
    if (typeof window !== 'undefined' && !window.navigator.userAgent.includes('jsdom')) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    if (!input.hiddenContainerRef.value) {
      contentPages.value = [{ nodes: paginatedContentNodes.value }]
      return
    }

    const contentContainer = input.hiddenContainerRef.value.querySelector('.docx-page__content')
    if (!contentContainer) {
      contentPages.value = [{ nodes: paginatedContentNodes.value }]
      return
    }

    const children = contentContainer.querySelectorAll('.docx-preview-node-wrapper')
    if (children.length === 0) {
      contentPages.value = []
      return
    }

    const pagesList: ContentPage[] = []
    let currentPageNodes: ProcessedNode[] = []
    let currentPageHeight = 0
    let prevMarginBottom = 0

    const limit = usableHeightPx.value
    const nodes = paginatedContentNodes.value

    let titleHeight = 0
    if (input.exportNoteTitle.value && !input.titlePage.value) {
      const titleWrapper = contentContainer.querySelector('.docx-page__content-title-wrapper')
      if (titleWrapper) {
        const style = window.getComputedStyle(titleWrapper)
        const marginTop = parseFloat(style.marginTop) || 0
        const marginBottom = parseFloat(style.marginBottom) || 0
        titleHeight = titleWrapper.getBoundingClientRect().height + marginTop
        prevMarginBottom = marginBottom
      }
    }

    currentPageHeight += titleHeight

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      const node = nodes[i]
      if (!node) continue

      const style = window.getComputedStyle(child)
      const marginTop = parseFloat(style.marginTop) || 0
      const marginBottom = parseFloat(style.marginBottom) || 0

      const childHeight = child.getBoundingClientRect().height

      const collapsedMargin = Math.max(prevMarginBottom, marginTop)
      const totalHeightContribution = childHeight + (currentPageHeight > 0 ? collapsedMargin : marginTop)

      if (currentPageNodes.length > 0 && currentPageHeight + totalHeightContribution > limit) {
        pagesList.push({
          nodes: currentPageNodes,
          hasTitle: pagesList.length === 0 && input.exportNoteTitle.value && !input.titlePage.value,
        })
        currentPageNodes = [node]
        currentPageHeight = childHeight + marginTop
        prevMarginBottom = marginBottom
      } else {
        currentPageNodes.push(node)
        currentPageHeight += totalHeightContribution
        prevMarginBottom = marginBottom
      }
    }

    if (currentPageNodes.length > 0) {
      pagesList.push({
        nodes: currentPageNodes,
        hasTitle: pagesList.length === 0 && input.exportNoteTitle.value && !input.titlePage.value,
      })
    }

    contentPages.value = pagesList
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
    pageStyle,
    processedContent,
    paginatedContentNodes,
    pages,
    updatePagination,
  }
}
