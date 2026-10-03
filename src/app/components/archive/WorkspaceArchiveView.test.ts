import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import WorkspaceArchiveView from './WorkspaceArchiveView.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useTreeStore } from '../../../stores/tree'
import type { TrashedItem, WorkspaceManifest } from '../../../types/workspace'
import en from '../../../locales/en.json'

import { computed, ref } from 'vue'

const mockConfirm = vi.fn()
let mockConfirmOpen = false

vi.mock('../../../ui/composables/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
    confirmDialogState: {
      get open() {
        return mockConfirmOpen
      },
    },
  }),
}))

const mockIsPhone = ref(false)
vi.mock('../../../composables/useDeviceLayout', () => ({
  useDeviceLayout: () => ({
    isPhone: computed(() => mockIsPhone.value),
  }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

describe('WorkspaceArchiveView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockConfirm.mockReset()
    mockConfirmOpen = false
    mockIsPhone.value = false
  })

  function mountArchive(trash: TrashedItem[] = [], retentionDays = 30) {
    const workspaceStore = useWorkspaceStore()
    const manifest: Partial<WorkspaceManifest> = {
      trash,
      tree: [
        {
          id: 'folder-1',
          title: 'Project Documents',
          icon: '📁',
          parentId: null,
          order: 0,
          notes: [],
          children: [],
        },
      ],
      rootNotes: [],
      rootOrder: [],
    }
    workspaceStore.manifest = manifest as WorkspaceManifest
    workspaceStore.settings = {
      ...workspaceStore.settings,
      files: {
        ...workspaceStore.settings.files,
        trashRetentionDays: retentionDays,
      },
    }

    return mount(WorkspaceArchiveView, {
      global: {
        plugins: [i18n],
      },
    })
  }

  it('renders empty state when there are no items in archive', () => {
    const wrapper = mountArchive([])

    expect(wrapper.find('.trv-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain(en.workspace.trash.emptyTitle)
    expect(wrapper.find('.trv-foot__empty-btn').attributes('disabled')).toBeDefined()
  })

  it('renders groups and rows with localized deleted text and days left', () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000).toISOString()
    const wrapper = mountArchive([
      {
        id: 'note-1',
        type: 'note',
        title: 'Draft Report',
        deletedAt: yesterday,
        originalParentId: 'folder-1',
      },
    ], 30)

    const row = wrapper.find('.trv-item')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('Draft Report')
    expect(row.text()).toContain('Project Documents')
    expect(row.text()).toContain('deleted')
    expect(row.find('.tr-left').text()).toBe('29 d')

    // Group header should be present
    expect(wrapper.find('.tl-day').exists()).toBe(true)
  })

  it('hides days left when retention is 0 (keep forever)', () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000).toISOString()
    const wrapper = mountArchive([
      {
        id: 'note-1',
        type: 'note',
        title: 'Draft Report',
        deletedAt: yesterday,
        originalParentId: null,
      },
    ], 0)

    expect(wrapper.find('.tr-left').exists()).toBe(false)
    expect(wrapper.text()).toContain(en.workspace.trash.retentionForever)
  })

  it('shows no-results state when search query does not match', async () => {
    const wrapper = mountArchive([
      {
        id: 'note-1',
        type: 'note',
        title: 'Meeting Notes',
        deletedAt: new Date().toISOString(),
        originalParentId: null,
      },
    ])

    const searchInput = wrapper.find('.trv-search__input')
    await searchInput.setValue('non-matching query')

    expect(wrapper.find('.trv-no-results').exists()).toBe(true)
    expect(wrapper.text()).toContain(en.workspace.trash.noResultsTitle)
  })

  it('changes selection and restores the focused item with ArrowDown and Enter', async () => {
    const treeStore = useTreeStore()
    const restoreSpy = vi.spyOn(treeStore, 'restoreFromTrash').mockResolvedValue()

    const wrapper = mountArchive([
      {
        id: 'note-1',
        type: 'note',
        title: 'First Note',
        deletedAt: '2026-09-02T10:00:00Z',
        originalParentId: null,
      },
      {
        id: 'note-2',
        type: 'note',
        title: 'Second Note',
        deletedAt: '2026-09-01T10:00:00Z',
        originalParentId: null,
      },
    ])

    const listbox = wrapper.find('.trv-list')
    // Move selection down to second row
    await listbox.trigger('keydown', { key: 'ArrowDown' })

    // Detail pane should update to Second Note
    const detailTitle = wrapper.find('.diff-h h3')
    expect(detailTitle.text()).toBe('Second Note')

    // Press Enter to restore
    await listbox.trigger('keydown', { key: 'Enter' })
    expect(restoreSpy).toHaveBeenCalledWith('note-2')
  })

  it('opens confirmation on Delete key and permanently deletes item when confirmed', async () => {
    const treeStore = useTreeStore()
    const deleteSpy = vi.spyOn(treeStore, 'permanentlyDeleteFromTrash').mockResolvedValue()
    mockConfirm.mockResolvedValueOnce(true)

    const wrapper = mountArchive([
      {
        id: 'note-1',
        type: 'note',
        title: 'Delete Target',
        deletedAt: '2026-09-01T10:00:00Z',
        originalParentId: null,
      },
    ])

    const listbox = wrapper.find('.trv-list')
    await listbox.trigger('keydown', { key: 'Delete' })

    expect(mockConfirm).toHaveBeenCalled()
    expect(deleteSpy).toHaveBeenCalledWith('note-1')
  })

  it('emits back event when clicking back button', async () => {
    const wrapper = mountArchive([])

    await wrapper.find('.trv-back-btn').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('handles Escape key: clears search first, ignores if confirm open, otherwise emits back', async () => {
    const wrapper = mountArchive([
      {
        id: 'note-1',
        type: 'note',
        title: 'Note 1',
        deletedAt: '2026-09-01T10:00:00Z',
        originalParentId: null,
      },
    ])

    const searchInput = wrapper.find('.trv-search__input')
    await searchInput.setValue('test search')

    // First Escape clears search
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect((wrapper.find('.trv-search__input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('back')).toBeUndefined()

    // When confirm is open, Escape is ignored by view
    mockConfirmOpen = true
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('back')).toBeUndefined()

    // When confirm is closed, Escape emits back
    mockConfirmOpen = false
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('renders phone layout with inline-action rows and no detail pane when isPhone is true', () => {
    mockIsPhone.value = true
    const wrapper = mountArchive([
      {
        id: 'note-1',
        type: 'note',
        title: 'Mobile Note',
        deletedAt: '2026-09-01T10:00:00Z',
        originalParentId: null,
      },
    ])

    expect(wrapper.find('.archive-phone').exists()).toBe(true)
    expect(wrapper.find('.archive-row').exists()).toBe(true)
    expect(wrapper.find('.trv-main').exists()).toBe(false)
  })
})
