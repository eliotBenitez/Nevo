import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import PdfPreviewModal from './PdfPreviewModal.vue'
import en from '../../locales/en.json'
import type { NoteDocument } from '../../types/note'
import { noteCommands } from '../../tauri/commands'
import { buildTypstExport } from '../../utils/noteExport/buildTypstExport'

vi.mock('../../tauri/commands', () => ({
  noteCommands: {
    prepareNotePdfPreview: vi.fn(async () => ({ token: 1, totalPages: 2 })),
    renderNotePdfPreviewPages: vi.fn(async () => ['cGFnZTE=', 'cGFnZTI=']),
    exportNotePdf: vi.fn(async () => true),
  },
}))

vi.mock('../../utils/noteExport/buildTypstExport', () => ({
  buildTypstExport: vi.fn(async () => ({ source: '#set page()', assets: [] })),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function createNote(): NoteDocument {
  return {
    id: 'note-1',
    title: 'PDF Note',
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
    },
  }
}

async function flushPdfModal() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

function mountModal() {
  return mount(PdfPreviewModal, {
    props: { note: createNote(), workspacePath: '/workspace' },
    global: { plugins: [i18n], stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('PdfPreviewModal', () => {
  let previewTokenCounter = 0

  beforeEach(() => {
    vi.clearAllMocks()
    previewTokenCounter = 0
    vi.mocked(noteCommands.prepareNotePdfPreview).mockImplementation(async () => ({
      token: ++previewTokenCounter,
      totalPages: 2,
    }))
    vi.mocked(noteCommands.renderNotePdfPreviewPages).mockResolvedValue(['cGFnZTE=', 'cGFnZTI='])
    vi.mocked(noteCommands.exportNotePdf).mockResolvedValue(true)
    vi.mocked(buildTypstExport).mockResolvedValue({ source: '#set page()', assets: [] })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('regenerates preview pages when font size changes', async () => {
    const wrapper = mountModal()
    await flushPdfModal()

    expect(noteCommands.exportNotePdf).not.toHaveBeenCalled()
    expect(noteCommands.prepareNotePdfPreview).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.pdf-preview__page')).toHaveLength(2)

    await wrapper.findAll('.pdf-stepper__btn')[1]!.trigger('click')
    await flushPdfModal()

    expect(noteCommands.prepareNotePdfPreview).toHaveBeenCalledTimes(2)
    expect(vi.mocked(buildTypstExport).mock.calls[1]?.[1]?.fontSize).toBe(12)
  })

  it('asks the backend to export the PDF when saving', async () => {
    const wrapper = mountModal()
    await flushPdfModal()

    const saveButton = wrapper.find('.nv-btn--primary')
    expect(saveButton.attributes('disabled')).toBeUndefined()
    await saveButton.trigger('click')
    await flushPdfModal()

    expect(noteCommands.exportNotePdf).toHaveBeenCalledWith(
      '/workspace',
      'PDF Note.pdf',
      '#set page()',
      [],
    )
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('stays open when the backend save dialog is cancelled', async () => {
    vi.mocked(noteCommands.exportNotePdf).mockResolvedValueOnce(false)
    const wrapper = mountModal()
    await flushPdfModal()

    await wrapper.find('.nv-btn--primary').trigger('click')
    await flushPdfModal()

    expect(noteCommands.exportNotePdf).toHaveBeenCalledOnce()
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('shows an error when export fails', async () => {
    vi.mocked(noteCommands.exportNotePdf).mockRejectedValueOnce(new Error('export failed'))
    const wrapper = mountModal()
    await flushPdfModal()

    await wrapper.find('.nv-btn--primary').trigger('click')
    await flushPdfModal()

    expect(wrapper.text()).toContain('Failed to save PDF.')
  })

  it('shows generation errors and closes on Escape', async () => {
    vi.mocked(noteCommands.prepareNotePdfPreview).mockRejectedValueOnce(new Error('render failed'))
    const wrapper = mountModal()
    await flushPdfModal()

    expect(wrapper.text()).toContain('Failed to generate PDF preview.')
    await wrapper.find('.pdf-backdrop').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
