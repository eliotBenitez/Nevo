import { nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteDocument } from '../../types/note'
import { processedNodeText } from '../../utils/noteExport/docxPagination'
import { useDocxPagination } from './useDocxPagination'

function noteWithParagraphs(count: number): NoteDocument {
  return {
    id: 'n1',
    title: 'Pagination',
    icon: '',
    folderId: null,
    createdAt: '',
    updatedAt: '',
    content: {
      type: 'doc',
      content: Array.from({ length: count }, (_, index) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: `Paragraph ${index}` }],
      })),
    },
  }
}

function measuredContainer(heights: number[]): HTMLElement {
  const page = document.createElement('div')
  const content = document.createElement('div')
  content.className = 'docx-page__content'
  heights.forEach((height, index) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'docx-preview-node-wrapper'
    wrapper.dataset.docxNodeIndex = String(index)
    wrapper.getBoundingClientRect = () => ({ height } as DOMRect)
    content.append(wrapper)
  })
  page.append(content)
  return page
}

function createPagination(
  paragraphCount: number,
  heights: number[],
  noteDocument = noteWithParagraphs(paragraphCount),
) {
  const note = ref(noteDocument)
  const marginBottom = ref(25)
  const pagination = useDocxPagination({
    note,
    paperFormat: ref('A4'),
    orientation: ref('portrait'),
    fontSize: ref(11),
    fontFamily: ref(''),
    marginTop: ref(25),
    marginRight: ref(20),
    marginBottom,
    marginLeft: ref(20),
    lineSpacing: ref(1.15),
    paragraphSpacing: ref(8),
    headingNumbers: ref(false),
    tableOfContents: ref(false),
    titlePage: ref(false),
    exportNoteTitle: ref(false),
    surfaceWidth: ref(800),
    zoom: ref(100),
    fitWidth: ref(false),
    hiddenContainerRef: ref(measuredContainer(heights)),
  })
  return { marginBottom, pagination }
}

describe('useDocxPagination', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('packs many short paragraphs without crossing the content boundary', async () => {
    const heights = Array.from({ length: 12 }, () => 100)
    const { pagination } = createPagination(heights.length, heights)
    await pagination.updatePagination()

    expect(pagination.contentPages.value).toHaveLength(2)
    for (const page of pagination.contentPages.value) {
      const height = page.nodes.length * 100
      expect(height).toBeLessThanOrEqual(pagination.usableHeightPx.value + 0.5)
    }
  })

  it('repaginates against a larger bottom margin', async () => {
    const heights = Array.from({ length: 8 }, () => 100)
    const { marginBottom, pagination } = createPagination(heights.length, heights)
    await pagination.updatePagination()
    expect(pagination.contentPages.value).toHaveLength(1)

    marginBottom.value = 100
    await nextTick()
    await pagination.updatePagination()

    expect(pagination.contentPages.value).toHaveLength(2)
    expect(pagination.contentPages.value[0].nodes.length * 100)
      .toBeLessThanOrEqual(pagination.usableHeightPx.value + 0.5)
  })

  it('splits a paragraph longer than a page at measured text boundaries', async () => {
    const text = 'word '.repeat(240)
    const longNote = noteWithParagraphs(0)
    longNote.content.content = [{
      type: 'paragraph',
      content: [{ type: 'text', text, marks: [{ type: 'strong' }] }],
    }]
    const container = measuredContainer([1200])
    const wrapper = container.querySelector<HTMLElement>('.docx-preview-node-wrapper')!
    wrapper.append(document.createTextNode(text))
    wrapper.getBoundingClientRect = () => ({
      top: 0,
      bottom: 1200,
      height: 1200,
    } as DOMRect)

    let rangeStart = 0
    let rangeEnd = 0
    vi.spyOn(document, 'createRange').mockImplementation(() => ({
      setStart: (_node: Node, offset: number) => { rangeStart = offset },
      setEnd: (_node: Node, offset: number) => { rangeEnd = offset },
      getBoundingClientRect: () => {
        const top = Math.floor(rangeStart / 20) * 20
        const bottom = Math.ceil(rangeEnd / 20) * 20
        return { top, bottom, height: bottom - top } as DOMRect
      },
    } as Range))

    const hiddenContainer = container
    const fresh = useDocxPagination({
      note: ref(longNote),
      paperFormat: ref('A4'),
      orientation: ref('portrait'),
      fontSize: ref(11),
      fontFamily: ref(''),
      marginTop: ref(25),
      marginRight: ref(20),
      marginBottom: ref(25),
      marginLeft: ref(20),
      lineSpacing: ref(1.15),
      paragraphSpacing: ref(8),
      headingNumbers: ref(false),
      tableOfContents: ref(false),
      titlePage: ref(false),
      exportNoteTitle: ref(false),
      surfaceWidth: ref(800),
      zoom: ref(100),
      fitWidth: ref(false),
      hiddenContainerRef: ref(hiddenContainer),
    })
    await fresh.updatePagination()

    expect(fresh.contentPages.value).toHaveLength(2)
    const fragments = fresh.contentPages.value.flatMap(page => page.nodes)
    expect(fragments.map(processedNodeText).join('')).toBe(text)
    expect(fragments[0].continuesOnNextPage).toBe(true)
    expect(fragments[1].continuesFromPreviousPage).toBe(true)
    expect(fragments[0].content?.[0].marks).toEqual([{ type: 'strong' }])
    expect(fragments[1].content?.[0].marks).toEqual([{ type: 'strong' }])
  })

  it('uses the Word title, heading, code, and list metrics at 100% scale', () => {
    const { pagination } = createPagination(1, [20])
    const numericStyle = (property: string) => {
      return Number.parseFloat(pagination.pageStyle.value[property])
    }

    expect(numericStyle('--docx-title-font-size')).toBeCloseTo(28 * 96 / 72, 8)
    expect(numericStyle('--docx-heading-1-font-size')).toBeCloseTo(16 * 96 / 72, 8)
    expect(numericStyle('--docx-heading-2-font-size')).toBeCloseTo(13 * 96 / 72, 8)
    expect(numericStyle('--docx-code-font-size')).toBeCloseTo(9 * 96 / 72, 8)
    expect(numericStyle('--docx-list-left-indent')).toBeCloseTo(48, 8)
  })

  it('places the first fitting table rows on the current page and repeats the header', async () => {
    const tableNote = noteWithParagraphs(0)
    tableNote.content.content = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [{ type: 'table_header', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head' }] }] }],
          },
          ...['One', 'Two', 'Three'].map(text => ({
            type: 'table_row',
            content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }],
          })),
        ],
      },
    ]

    const container = measuredContainer([700, 400])
    const tableWrapper = container.querySelectorAll<HTMLElement>('.docx-preview-node-wrapper')[1]
    const table = document.createElement('table')
    table.className = 'docx-page__table'
    const tbody = document.createElement('tbody')
    for (let index = 0; index < 4; index++) {
      const row = document.createElement('tr')
      row.getBoundingClientRect = () => ({ height: 100 } as DOMRect)
      tbody.append(row)
    }
    table.append(tbody)
    tableWrapper.append(table)

    const fresh = useDocxPagination({
      note: ref(tableNote),
      paperFormat: ref('A4'),
      orientation: ref('portrait'),
      fontSize: ref(11),
      fontFamily: ref(''),
      marginTop: ref(25),
      marginRight: ref(20),
      marginBottom: ref(25),
      marginLeft: ref(20),
      lineSpacing: ref(1.15),
      paragraphSpacing: ref(8),
      headingNumbers: ref(false),
      tableOfContents: ref(false),
      titlePage: ref(false),
      exportNoteTitle: ref(false),
      surfaceWidth: ref(800),
      zoom: ref(100),
      fitWidth: ref(false),
      hiddenContainerRef: ref(container),
    })
    await fresh.updatePagination()

    expect(fresh.contentPages.value).toHaveLength(2)
    expect(fresh.contentPages.value[0].nodes).toHaveLength(2)
    expect(fresh.contentPages.value[0].nodes[1].content).toHaveLength(2)
    expect(fresh.contentPages.value[1].nodes).toHaveLength(1)
    expect(fresh.contentPages.value[1].nodes[0].content).toHaveLength(3)
    expect(processedNodeText(fresh.contentPages.value[1].nodes[0])).toBe('HeadTwoThree')
  })
})
