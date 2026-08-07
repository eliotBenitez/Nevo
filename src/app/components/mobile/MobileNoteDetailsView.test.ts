import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import en from '../../../locales/en.json'
import { useNoteStore } from '../../../stores/note'
import type { NoteDocument } from '../../../types/note'
import MobileNoteDetailsView from './MobileNoteDetailsView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function createNote(): NoteDocument {
  return {
    id: 'note-1',
    title: 'Q4 product strategy',
    icon: '◐',
    folderId: 'planning',
    createdAt: '2026-07-18T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    properties: {
      type: 'note',
      status: 'active',
      date: '2026-08-12',
      tags: ['strategy', 'q4'],
    },
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'North star' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Make the next useful connection obvious.' }] },
      ],
    },
  }
}

describe('MobileNoteDetailsView', () => {
  it('renders the design sections and updates note properties', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const noteStore = useNoteStore()
    noteStore.activeNote = createNote()

    const wrapper = mount(MobileNoteDetailsView, {
      props: {
        note: noteStore.activeNote,
        folderPath: 'Product / Planning',
      },
      global: { plugins: [pinia, i18n] },
    })

    expect(wrapper.get('h1').text()).toBe('Note details')
    expect(wrapper.get('.mobile-note-details__identity-copy small').text()).toBe('Product / Planning')
    expect(wrapper.text()).toContain('1 sections')
    expect(wrapper.text()).toContain('Reading time')

    await wrapper.findAll('select')[0].setValue('project')
    await wrapper.findAll('select')[1].setValue('done')
    await wrapper.get('input[type="date"]').setValue('2026-08-20')

    expect(noteStore.activeNote?.properties).toMatchObject({
      type: 'project',
      status: 'done',
      date: '2026-08-20',
    })
  })

  it('forwards navigation, export, and close actions', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const noteStore = useNoteStore()
    noteStore.activeNote = createNote()

    const onOpenOutline = vi.fn()
    const onOpenGraph = vi.fn()
    const onExport = vi.fn()
    const onClose = vi.fn()
    const wrapper = mount(MobileNoteDetailsView, {
      props: {
        note: noteStore.activeNote,
        folderPath: 'Workspace',
        onOpenOutline,
        onOpenGraph,
        onExport,
        onClose,
      },
      global: { plugins: [pinia, i18n] },
    })

    const rows = wrapper.findAll('button.mobile-note-details__row')
    await rows[0].trigger('click')
    await rows[1].trigger('click')
    await wrapper.get('.mobile-note-details__export').trigger('click')
    await wrapper.get('.mobile-note-details__done').trigger('click')

    expect(onOpenOutline).toHaveBeenCalledTimes(1)
    expect(onOpenGraph).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
