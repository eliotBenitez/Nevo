import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../locales/en.json'
import MobileLibraryView from './MobileLibraryView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const rootNotes = [
  {
    id: 'note-1',
    title: 'Product strategy',
    icon: '📄',
    folderId: null,
    updatedAt: '2026-08-02T10:00:00.000Z',
  },
]

const folders = [
  {
    id: 'folder-1',
    title: 'Research',
    icon: '📁',
    parentId: null,
    order: 0,
    children: [],
    notes: [
      {
        id: 'note-2',
        title: 'Interview synthesis',
        icon: '🧪',
        folderId: 'folder-1',
        updatedAt: '2026-08-01T10:00:00.000Z',
      },
    ],
  },
]

const previews = [
  {
    noteId: 'note-1',
    title: 'Product strategy',
    icon: '📄',
    folderPath: '',
    updatedAt: '2026-08-02T10:00:00.000Z',
    tags: ['strategy'],
    previewText: 'Three product bets for the next quarter.',
  },
  {
    noteId: 'note-2',
    title: 'Interview synthesis',
    icon: '🧪',
    folderPath: 'Research',
    updatedAt: '2026-08-01T10:00:00.000Z',
    tags: ['research'],
    previewText: 'Patterns across five interviews.',
  },
]

function mountLibrary(onOpenNote = vi.fn()) {
  return mount(MobileLibraryView, {
    props: {
      workspaceName: 'Atelier',
      rootNotes,
      folders,
      previews,
      onOpenNote,
    },
    global: { plugins: [i18n] },
  })
}

describe('MobileLibraryView', () => {
  it('filters notes locally and opens the selected note', async () => {
    const onOpenNote = vi.fn()
    const wrapper = mountLibrary(onOpenNote)
    const search = wrapper.get<HTMLInputElement>('input[type="search"]')

    await search.setValue('interview')
    expect(wrapper.findAll('.mobile-note-row')).toHaveLength(1)
    expect(wrapper.get('.mobile-note-row').text()).toContain('Interview synthesis')

    await wrapper.get('.mobile-note-row').trigger('click')
    expect(onOpenNote).toHaveBeenCalledWith('note-2')
  })

  it('switches between folder and tag views with accessible tab state', async () => {
    const wrapper = mountLibrary()
    const tabs = wrapper.findAll('[role="tab"]')

    await tabs[1].trigger('click')
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('.mobile-library-row')).toHaveLength(1)

    await tabs[2].trigger('click')
    expect(tabs[2].attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('.mobile-tag-cloud button')).toHaveLength(2)
  })
})
