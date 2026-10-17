import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DocxPreviewNode from './DocxPreviewNode.vue'
import { DOCX_PREVIEW_RELAYOUT } from '../composables/useDocxPreviewSvg'
import type { ProcessedNode } from '../../utils/noteExport/docxPagination'

const renderBlockSvg = vi.hoisted(() => vi.fn(async (node: { attrs?: { code?: string } }) => `<svg xmlns="http://www.w3.org/2000/svg"><title>${node.attrs?.code ?? ''}</title></svg>`))

vi.mock('../../utils/noteExport/blockSvg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/noteExport/blockSvg')>()),
  renderBlockSvg,
}))

function render(node: ProcessedNode, relayout = () => {}) {
  return mount(DocxPreviewNode, { props: { node }, global: { provide: { [DOCX_PREVIEW_RELAYOUT as symbol]: relayout } } })
}

describe('DocxPreviewNode', () => {
  it('renders file, embed, note embed, block embed and query blocks as text', () => {
    expect(render({ type: 'file_block', attrs: { filename: 'a.pdf' } }).text()).toBe('📎 a.pdf')
    expect(render({ type: 'embed_block', attrs: { url: 'https://x.test', title: ' Site ' } }).text()).toBe('Site')
    expect(render({ type: 'embed_block', attrs: { url: '' } }).text()).toBe('')
    const note = render({ type: 'note_embed', attrs: { title: 'Linked', previewText: 'Preview body' } })
    expect(note.text()).toContain('Linked')
    expect(note.text()).toContain('Preview body')
    expect(render({ type: 'block_embed' }).text()).toBe('↪ Embedded block')
    expect(render({ type: 'query_block', attrs: { data: {} } }).text()).toMatch(/^Query: /)
  })

  it('renders audio bookmarks and transcript', () => {
    const wrapper = render({
      type: 'media_block',
      attrs: {
        kind: 'audio',
        name: 'Track',
        bookmarks: [{ id: 'b1', time: 5, label: 'Intro' }],
        transcript: [{ start: 65, end: 70, text: 'Hello   world' }],
      },
    })
    const text = wrapper.text()
    expect(text).toContain('🔊 Track')
    expect(text).toContain('Intro')
    expect(text).toContain('Transcript')
    expect(text).toContain('Hello world')
  })

  it('renders a database block as a table', () => {
    const wrapper = render({
      type: 'database_block',
      attrs: {
        data: {
          version: 1,
          title: 'Tasks',
          fields: [{ id: 'f1', name: 'Name', type: 'text' }],
          records: [{ id: 'r1', cells: { f1: 'Write tests' } }],
          views: [],
          activeView: '',
        },
      },
    })
    expect(wrapper.text()).toContain('Tasks')
    expect(wrapper.find('th').text()).toBe('Name')
    expect(wrapper.find('td').text()).toBe('Write tests')
  })

  it('renders diagrams as an image once rendered and requests a relayout', async () => {
    const relayout = vi.fn()
    const wrapper = render({ type: 'mermaid_block', attrs: { code: 'graph TD;A-->B' } }, relayout)
    await flushPromises()
    const img = wrapper.find('img.docx-page__diagram')
    expect(img.attributes('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(relayout).toHaveBeenCalled()
  })

  it('falls back to the latex text when a math block fails to render', async () => {
    renderBlockSvg.mockResolvedValueOnce(null as never)
    const wrapper = render({ type: 'math_block', attrs: { latex: 'x^2' } })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('x^2')
  })

  it('bolds toggle titles', () => {
    const wrapper = render({ type: 'toggle_title', content: [{ type: 'text', text: 'Title' }] })
    expect(wrapper.find('p').classes()).toContain('docx-mark-strong')
  })
})
