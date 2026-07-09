import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import WorkspaceSidebar from './WorkspaceSidebar.vue'
import en from '../../locales/en.json'
import type { SidebarNotePreview, TreeNode } from '../../types/note'
import type { KanbanBoardMeta } from '../../types/kanban'
import type { SidebarContentMode } from '../../types/workspace'
import type { SortMode } from '../composables/useSidebarTree'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const tree: TreeNode[] = [
  {
    kind: 'note',
    meta: {
      id: 'note-1',
      title: 'First note',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
    },
  },
]

function mountSidebar(options: { boards?: KanbanBoardMeta[]; kanbanEnabled?: boolean; tree?: TreeNode[]; sidebarMode?: SidebarContentMode; notePreviews?: SidebarNotePreview[]; sidebarSortMode?: SortMode } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workspace', component: { template: '<div />' } }],
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  if (options.sidebarSortMode) {
    const workspaceStore = useWorkspaceStore()
    workspaceStore.settings = {
      ...workspaceStore.settings,
      workspace: {
        ...workspaceStore.settings.workspace,
        sidebarSortMode: options.sidebarSortMode,
      },
    }
  }

  void router.push('/workspace')

  return mount(WorkspaceSidebar, {
    attachTo: document.body,
    global: {
      plugins: [i18n, pinia, router],
    },
    props: {
      workspaceName: 'Workspace',
      workspaceGlyph: 'N',
      tree: options.tree ?? tree,
      activeNoteId: 'note-1',
      activeFolderId: null,
      boards: options.boards,
      kanbanEnabled: options.kanbanEnabled,
      sidebarMode: options.sidebarMode,
      notePreviews: options.notePreviews,
    },
  })
}

async function openNoteContextMenu(wrapper: VueWrapper) {
  await wrapper.get('.tree-row').trigger('contextmenu', {
    clientX: 40,
    clientY: 50,
  })
}

async function flushUi() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

/** jsdom не реализует DataTransfer; минимальный стаб для HTML5 DnD-тестов. */
function makeDataTransfer() {
  const store = new Map<string, string>()
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'uninitialized',
    setData(type: string, value: string) { store.set(type, value) },
    getData(type: string) { return store.get(type) ?? '' },
  }
}

async function activateMenuButton(label: string) {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
    .find(candidate => candidate.textContent?.includes(label))
  expect(button).toBeTruthy()
  button!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button!.click()
  await flushUi()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('WorkspaceSidebar', () => {
  it('emits open-history when the sidebar history button is clicked', async () => {
    const wrapper = mountSidebar()

    const historyButton = wrapper.findAll('.sidebar-system__item')
      .find(button => button.text().includes('History'))

    expect(historyButton).toBeTruthy()

    await historyButton!.trigger('click')

    expect(wrapper.emitted('open-history')).toEqual([[]])
    wrapper.unmount()
  })

  it('offers a History action for note context menus', async () => {
    const wrapper = mountSidebar()

    await openNoteContextMenu(wrapper)

    const historyAction = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(button => button.textContent?.includes('History'))

    expect(historyAction).toBeTruthy()

    historyAction!.click()

    expect(wrapper.emitted('tree-action')).toEqual([
      [{ action: 'history', target: expect.objectContaining({ kind: 'note', id: 'note-1' }) }],
    ])
    wrapper.unmount()
  })

  it('offers export formats in a submenu for note context menus', async () => {
    const wrapper = mountSidebar()

    await openNoteContextMenu(wrapper)

    await activateMenuButton('Export')
    expect(Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .some(button => button.textContent?.includes('Typst archive (.zip)'))).toBe(true)
    await activateMenuButton('Typst archive (.zip)')

    expect(wrapper.emitted('tree-action')).toEqual([
      [{
        action: 'export',
        format: 'typst',
        target: expect.objectContaining({ kind: 'note', id: 'note-1' }),
      }],
    ])
    wrapper.unmount()
  })

  it('renders localized board actions only when Kanban is enabled', async () => {
    const wrapper = mountSidebar({ boards: [] })

    expect(wrapper.find('.sidebar-boards__label').text()).toBe('Boards')
    expect(wrapper.get('.sidebar-boards__add').attributes('title')).toBe('New board')
    expect(wrapper.text()).toContain('No boards yet')

    await wrapper.get('.sidebar-board-empty').trigger('click')
    expect(wrapper.emitted('create-board')).toEqual([[]])

    await wrapper.setProps({ kanbanEnabled: false })
    expect(wrapper.find('.sidebar-boards').exists()).toBe(false)

    wrapper.unmount()
  })

  it('offers note and folder actions in the empty tree state', async () => {
    const wrapper = mountSidebar({ tree: [] })

    expect(wrapper.text()).toContain('No pages yet')
    await wrapper.get('.tree-empty .nv-btn--primary').trigger('click')

    expect(wrapper.emitted('create-note')).toEqual([[]])
    wrapper.unmount()
  })

  it('renders tag preview mode and filters selected tags with OR logic', async () => {
    const wrapper = mountSidebar({
      sidebarMode: 'tag-preview',
      notePreviews: [
        { noteId: 'note-1', title: 'First note', icon: '📄', folderPath: 'Projects', updatedAt: '2026-05-14T10:00:00.000Z', tags: ['alpha'], previewText: 'Alpha body' },
        { noteId: 'note-2', title: 'Second note', icon: '🧭', folderPath: 'Research', updatedAt: '2026-05-15T10:00:00.000Z', tags: ['beta'], previewText: 'Beta body' },
      ],
    })

    expect(wrapper.find('.tree-wrap').exists()).toBe(false)
    expect(wrapper.findAll('.tag-preview-tag')).toHaveLength(2)
    expect(wrapper.text()).toContain('First note')
    expect(wrapper.text()).toContain('Second note')

    await wrapper.findAll('.tag-preview-tag')[0].trigger('click')
    expect(wrapper.text()).toContain('First note')
    expect(wrapper.text()).not.toContain('Second note')

    await wrapper.find('.tag-preview-card__open').trigger('click')
    expect(wrapper.emitted('open-note')).toEqual([['note-1']])
    wrapper.unmount()
  })

  it('applies the sidebar sort mode to tag preview cards before filtering', async () => {
    const wrapper = mountSidebar({
      sidebarMode: 'tag-preview',
      sidebarSortMode: 'name-asc',
      notePreviews: [
        { noteId: 'note-1', title: 'Zulu', icon: '📄', folderPath: '', updatedAt: '2026-05-14T10:00:00.000Z', tags: ['work'], previewText: '' },
        { noteId: 'note-2', title: 'Alpha', icon: '🧭', folderPath: '', updatedAt: '2026-05-16T10:00:00.000Z', tags: ['work'], previewText: '' },
        { noteId: 'note-3', title: 'Middle', icon: '📌', folderPath: '', updatedAt: '2026-05-15T10:00:00.000Z', tags: ['other'], previewText: '' },
      ],
    })

    expect(wrapper.findAll('.tag-preview-card__title').map(item => item.text())).toEqual(['Alpha', 'Middle', 'Zulu'])

    await wrapper.findAll('.tag-preview-tag')
      .find(tag => tag.text().includes('work'))!
      .trigger('click')

    expect(wrapper.findAll('.tag-preview-card__title').map(item => item.text())).toEqual(['Alpha', 'Zulu'])
    wrapper.unmount()
  })

  it('opens the note context menu from tag preview cards', async () => {
    const wrapper = mountSidebar({
      sidebarMode: 'tag-preview',
      notePreviews: [
        { noteId: 'note-1', title: 'First note', icon: '📄', folderPath: 'Projects', updatedAt: '2026-05-14T10:00:00.000Z', tags: ['alpha'], previewText: 'Alpha body' },
      ],
    })

    await wrapper.get('.tag-preview-card__menu').trigger('click')
    await activateMenuButton('History')

    expect(wrapper.emitted('tree-action')).toEqual([
      [{ action: 'history', target: expect.objectContaining({ kind: 'note', id: 'note-1', title: 'First note' }) }],
    ])
    wrapper.unmount()
  })
})

const treeWithFolder: TreeNode[] = [
  {
    kind: 'folder',
    meta: {
      id: 'folder-1',
      title: 'Projects',
      icon: '📁',
      parentId: null,
      order: 0,
      children: [],
      notes: [],
    },
  },
  {
    kind: 'note',
    meta: {
      id: 'note-1',
      title: 'First note',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
    },
  },
  {
    kind: 'note',
    meta: {
      id: 'note-2',
      title: 'Second note',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T11:00:00.000Z',
    },
  },
]

const treeWithNestedNotes: TreeNode[] = [
  {
    kind: 'note',
    meta: {
      id: 'root-note',
      title: 'Root note',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
    },
  },
  {
    kind: 'folder',
    meta: {
      id: 'folder-1',
      title: 'Projects',
      icon: '📁',
      parentId: null,
      order: 0,
      children: [],
      notes: [
        {
          id: 'folder-note',
          title: 'Folder note',
          icon: '📄',
          folderId: 'folder-1',
          updatedAt: '2026-05-14T11:00:00.000Z',
        },
      ],
    },
  },
]

describe('WorkspaceSidebar drag-and-drop', () => {
  it('renders tree rows as draggable', async () => {
    const wrapper = mountSidebar({ tree: treeWithFolder })

    const rows = wrapper.findAll('.tree-row')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    for (const row of rows) {
      expect(row.attributes('draggable')).toBe('true')
    }
    wrapper.unmount()
  })

  it('moves a note into a folder on drop into the folder row', async () => {
    const wrapper = mountSidebar({ tree: treeWithFolder })
    const treeStore = useTreeStore()

    const moveSpy = vi.spyOn(treeStore, 'moveNote').mockResolvedValue(undefined)

    const rows = wrapper.findAll('.tree-row')
    const folderRow = rows.find((r) => r.text().includes('Projects'))!
    const noteRow = rows.find((r) => r.text().includes('First note'))!

    // dragstart на заметке
    await noteRow.trigger('dragstart', { dataTransfer: makeDataTransfer() })
    // dragover на папке в центральной зоне (into)
    await folderRow.trigger('dragover', {
      dataTransfer: makeDataTransfer(),
      offsetY: 15,
      currentTarget: { offsetHeight: 30 },
    })
    await flushUi()
    // drop на папке
    await folderRow.trigger('drop', { dataTransfer: makeDataTransfer() })

    expect(moveSpy).toHaveBeenCalledWith('note-1', 'folder-1')
    moveSpy.mockRestore()
    wrapper.unmount()
  })

  it('keeps folder drop detection relative to the row when hovering child text', async () => {
    const wrapper = mountSidebar({ tree: treeWithFolder })
    const treeStore = useTreeStore()

    const moveSpy = vi.spyOn(treeStore, 'moveNote').mockResolvedValue(undefined)
    const reorderSpy = vi.spyOn(treeStore, 'reorderItem').mockResolvedValue(undefined)

    const rows = wrapper.findAll('.tree-row')
    const folderRow = rows.find((r) => r.text().includes('Projects'))!
    const noteRow = rows.find((r) => r.text().includes('First note'))!

    Object.defineProperty(folderRow.element, 'offsetHeight', { configurable: true, value: 30 })
    folderRow.element.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 100,
      top: 100,
      left: 0,
      right: 240,
      bottom: 130,
      width: 240,
      height: 30,
      toJSON: () => ({}),
    }))

    await noteRow.trigger('dragstart', { dataTransfer: makeDataTransfer() })
    await folderRow.get('.tree-title').trigger('dragover', {
      dataTransfer: makeDataTransfer(),
      offsetY: 1,
      clientY: 115,
    })
    await flushUi()
    await folderRow.trigger('drop', { dataTransfer: makeDataTransfer() })

    expect(moveSpy).toHaveBeenCalledWith('note-1', 'folder-1')
    expect(reorderSpy).not.toHaveBeenCalled()
    moveSpy.mockRestore()
    reorderSpy.mockRestore()
    wrapper.unmount()
  })

  it('reorders root notes when dropped before another root note', async () => {
    const wrapper = mountSidebar({ tree: treeWithFolder })
    const treeStore = useTreeStore()

    const reorderSpy = vi.spyOn(treeStore, 'reorderItem').mockResolvedValue(undefined)

    const rows = wrapper.findAll('.tree-row')
    const firstNote = rows.find((r) => r.text().includes('First note'))!
    const secondNote = rows.find((r) => r.text().includes('Second note'))!

    await secondNote.trigger('dragstart', { dataTransfer: makeDataTransfer() })
    await firstNote.trigger('dragover', {
      dataTransfer: makeDataTransfer(),
      offsetY: 2,
      currentTarget: { offsetHeight: 30 },
    })
    await flushUi()
    await firstNote.trigger('drop', { dataTransfer: makeDataTransfer() })

    expect(reorderSpy).toHaveBeenCalledWith('note-2', 'note-1', 'before', null)
    reorderSpy.mockRestore()
    wrapper.unmount()
  })

  it('moves a note before a note in another parent when dropped in tree mode', async () => {
    const wrapper = mountSidebar({ tree: treeWithNestedNotes })
    const treeStore = useTreeStore()

    const movePositionSpy = vi.spyOn(treeStore, 'moveNoteToPosition').mockResolvedValue(undefined)

    const rows = wrapper.findAll('.tree-row')
    const rootNote = rows.find((r) => r.text().includes('Root note'))!
    const folderNote = rows.find((r) => r.text().includes('Folder note'))!

    await rootNote.trigger('dragstart', { dataTransfer: makeDataTransfer() })
    await folderNote.trigger('dragover', {
      dataTransfer: makeDataTransfer(),
      offsetY: 2,
      currentTarget: { offsetHeight: 30 },
    })
    await flushUi()
    await folderNote.trigger('drop', { dataTransfer: makeDataTransfer() })

    expect(movePositionSpy).toHaveBeenCalledWith('root-note', 'folder-note', 'before', 'folder-1')
    movePositionSpy.mockRestore()
    wrapper.unmount()
  })

  it('moves a folder note before a root folder when dropped on the folder edge', async () => {
    const wrapper = mountSidebar({ tree: treeWithNestedNotes })
    const treeStore = useTreeStore()

    const movePositionSpy = vi.spyOn(treeStore, 'moveNoteToPosition').mockResolvedValue(undefined)

    const rows = wrapper.findAll('.tree-row')
    const folderRow = rows.find((r) => r.text().includes('Projects'))!
    const folderNote = rows.find((r) => r.text().includes('Folder note'))!

    await folderNote.trigger('dragstart', { dataTransfer: makeDataTransfer() })
    await folderRow.trigger('dragover', {
      dataTransfer: makeDataTransfer(),
      offsetY: 1,
      currentTarget: { offsetHeight: 30 },
    })
    await flushUi()
    await folderRow.trigger('drop', { dataTransfer: makeDataTransfer() })

    expect(movePositionSpy).toHaveBeenCalledWith('folder-note', 'folder-1', 'before', null)
    movePositionSpy.mockRestore()
    wrapper.unmount()
  })

  it('moves a folder note to the root when dropped on the tree empty area', async () => {
    const wrapper = mountSidebar({ tree: treeWithNestedNotes })
    const treeStore = useTreeStore()

    const moveSpy = vi.spyOn(treeStore, 'moveNote').mockResolvedValue(undefined)

    const rows = wrapper.findAll('.tree-row')
    const folderNote = rows.find((r) => r.text().includes('Folder note'))!
    const rootDropZone = wrapper.get('.tree-root-drop-zone')

    await folderNote.trigger('dragstart', { dataTransfer: makeDataTransfer() })
    await rootDropZone.trigger('dragover', { dataTransfer: makeDataTransfer() })
    await flushUi()
    await rootDropZone.trigger('drop', { dataTransfer: makeDataTransfer() })

    expect(moveSpy).toHaveBeenCalledWith('folder-note', null)
    moveSpy.mockRestore()
    wrapper.unmount()
  })

  it('reorders tag-preview cards and persists the order', async () => {
    const wrapper = mountSidebar({
      sidebarMode: 'tag-preview',
      notePreviews: [
        { noteId: 'note-1', title: 'First', icon: '📄', folderPath: '', updatedAt: '2026-05-14T10:00:00.000Z', tags: ['a'], previewText: 'x' },
        { noteId: 'note-2', title: 'Second', icon: '📄', folderPath: '', updatedAt: '2026-05-14T11:00:00.000Z', tags: ['b'], previewText: 'y' },
      ],
    })
    const treeStore = useTreeStore()
    const orderSpy = vi.spyOn(treeStore, 'setSidebarNoteOrder').mockResolvedValue(undefined)

    const cards = wrapper.findAll('.tag-preview-card')
    expect(cards.length).toBe(2)
    expect(cards[0].attributes('draggable')).toBe('true')

    await cards[1].trigger('dragstart', { dataTransfer: makeDataTransfer() })
    await cards[0].trigger('dragover', {
      dataTransfer: makeDataTransfer(),
      offsetY: 10,
      currentTarget: { offsetHeight: 80 },
    })
    await flushUi()
    await cards[0].trigger('drop', { dataTransfer: makeDataTransfer() })

    expect(orderSpy).toHaveBeenCalledWith(['note-2', 'note-1'])
    orderSpy.mockRestore()
    wrapper.unmount()
  })
})
