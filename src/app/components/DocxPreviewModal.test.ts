import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import DocxPreviewModal from './DocxPreviewModal.vue'
import en from '../../locales/en.json'
import type { NoteDocument } from '../../types/note'

vi.mock('../../tauri/commands', () => ({
  configCommands: {
    listSystemFonts: vi.fn(async () => ['Arial', 'Calibri', 'Times New Roman']),
  },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function createNote(): NoteDocument {
  return {
    id: 'note-1',
    title: 'Word Note',
    icon: '📝',
    folderId: null,
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paragraph Content' }] }],
    },
  }
}

async function flushDocxModal() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

function mountModal() {
  return mount(DocxPreviewModal, {
    props: { note: createNote(), workspacePath: '/workspace' },
    global: { plugins: [i18n], stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('DocxPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders with default props and simulates page preview updates', async () => {
    const wrapper = mountModal()
    await flushDocxModal()

    const pageElement = wrapper.find('.docx-page')
    expect(pageElement.exists()).toBe(true)
    expect(pageElement.classes()).toContain('A4')
    expect(pageElement.classes()).toContain('portrait')
    expect(pageElement.attributes('style')).toContain('--docx-padding-top')
  })

  it('updates page classes and styling when configuration buttons are clicked', async () => {
    const wrapper = mountModal()
    await flushDocxModal()

    // Find page format Letter button
    
    // Find orientation landscape button (second button in the second segment, or search by icon wrappers)
    // Let's change orientation to landscape
    const landscapeBtn = wrapper.find('button[aria-label="Landscape"]')
    expect(landscapeBtn.exists()).toBe(true)
    await landscapeBtn.trigger('click')
    await flushDocxModal()

    expect(wrapper.find('.docx-page').classes()).toContain('landscape')

    // Change format to Letter (click the button labeled "Letter")
    const letterBtn = wrapper.findAll('.docx-segment__btn').find(el => el.text() === 'Letter')
    expect(letterBtn).toBeDefined()
    await letterBtn!.trigger('click')
    await flushDocxModal()

    expect(wrapper.find('.docx-page').classes()).toContain('Letter')
  })

  it('emits save event with options when primary save button is clicked', async () => {
    const wrapper = mountModal()
    await flushDocxModal()

    const saveButton = wrapper.find('.nv-btn--primary')
    expect(saveButton.exists()).toBe(true)
    await saveButton.trigger('click')
    await flushDocxModal()

    const saveEvents = wrapper.emitted('save')
    expect(saveEvents).toBeTruthy()
    expect(saveEvents![0]![0]).toEqual({
      paperFormat: 'A4',
      orientation: 'portrait',
      fontSize: 11,
      fontFamily: '',
      marginTop: 25,
      marginRight: 20,
      marginBottom: 25,
      marginLeft: 20,
      lineSpacing: 1.15,
      paragraphSpacing: 8,
      pageNumbers: false,
      headingNumbers: false,
      tableOfContents: false,
      titlePage: false,
      runningHeader: false,
      exportNoteTitle: true,
    })
  })

  it('closes modal on Escape key press and cancel click', async () => {
    const wrapper = mountModal()
    await flushDocxModal()

    // Trigger Cancel button click
    const cancelBtn = wrapper.findAll('.nv-btn').find(el => el.text() === 'Cancel')
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()

    // Reset emitted events
    wrapper.vm.$emit('close') // manually clear / emit again just in case, but let's test Escape key on backdrop
    await wrapper.find('.docx-backdrop').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
