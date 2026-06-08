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
    renderNotePdfPreview: vi.fn(async () => ['cGFnZTE=', 'cGFnZTI=']),
    exportNotePdf: vi.fn(async () => {}),
  },
}))

vi.mock('../../utils/noteExport/buildTypstExport', () => ({
  buildTypstExport: vi.fn(async () => ({ source: '#set page()', assets: [] })),
}))

const saveMock = vi.fn(async (..._args: unknown[]) => '/out/note.pdf')
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...args: unknown[]) => saveMock(...args) }))

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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(noteCommands.renderNotePdfPreview).mockResolvedValue(['cGFnZTE=', 'cGFnZTI='])
    vi.mocked(buildTypstExport).mockResolvedValue({ source: '#set page()', assets: [] })
    saveMock.mockResolvedValue('/out/note.pdf')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('regenerates preview pages when font size changes', async () => {
    const wrapper = mountModal()
    await flushPdfModal()

    expect(noteCommands.exportNotePdf).not.toHaveBeenCalled()
    expect(noteCommands.renderNotePdfPreview).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.pdf-preview__page')).toHaveLength(2)

    await wrapper.findAll('.pdf-stepper__btn')[1]!.trigger('click')
    await flushPdfModal()

    expect(noteCommands.renderNotePdfPreview).toHaveBeenCalledTimes(2)
    expect(vi.mocked(buildTypstExport).mock.calls[1]?.[1]?.fontSize).toBe(12)
  })

  it('exports the PDF via save dialog when saving', async () => {
    const wrapper = mountModal()
    await flushPdfModal()

    const saveButton = wrapper.find('.nv-btn--primary')
    expect(saveButton.attributes('disabled')).toBeUndefined()
    await saveButton.trigger('click')
    await flushPdfModal()

    expect(saveMock).toHaveBeenCalledOnce()
    expect(noteCommands.exportNotePdf).toHaveBeenCalledWith(
      '/workspace',
      '/out/note.pdf',
      '#set page()',
      [],
    )
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('does not export when the save dialog is cancelled', async () => {
    saveMock.mockResolvedValueOnce(null as never)
    const wrapper = mountModal()
    await flushPdfModal()

    await wrapper.find('.nv-btn--primary').trigger('click')
    await flushPdfModal()

    expect(noteCommands.exportNotePdf).not.toHaveBeenCalled()
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
    vi.mocked(noteCommands.renderNotePdfPreview).mockRejectedValueOnce(new Error('render failed'))
    const wrapper = mountModal()
    await flushPdfModal()

    expect(wrapper.text()).toContain('Failed to generate PDF preview.')
    await wrapper.find('.pdf-backdrop').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
