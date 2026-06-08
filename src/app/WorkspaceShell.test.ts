import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import WorkspaceShell from './WorkspaceShell.vue'
import en from '../locales/en.json'
import { useWorkspaceStore } from '../stores/workspace'
import { useTreeStore } from '../stores/tree'
import { useNoteStore } from '../stores/note'
import { useKanbanStore } from '../stores/kanban'
import { dispatchHotkeyCommand } from '../utils/hotkeys'
import { kanbanCommands, noteCommands } from '../tauri/commands'
import { createDefaultWorkspaceSettings } from '../utils/workspace-settings'

vi.mock('../tauri/commands', async () => {
  const actual = await vi.importActual<typeof import('../tauri/commands')>('../tauri/commands')
  return {
    ...actual,
    noteCommands: {
      ...actual.noteCommands,
      loadNote: vi.fn(),
      listNoteSnapshots: vi.fn(),
      saveNote: vi.fn(),
      searchWorkspaceBlocks: vi.fn(),
    },
    kanbanCommands: {
      ...actual.kanbanCommands,
      listBoards: vi.fn(),
    },
  }
})

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const SidebarStub = defineComponent({
  emits: ['tree-action'],
  template: `
    <div class="sidebar-stub">
      <button class="emit-search" @click="$emit('tree-action', { action: 'search', target: { kind: 'note', id: 'note-1', title: 'Seeded title', folderId: null } })">
        Search
      </button>
    </div>
  `,
})

const EditorPaneStub = defineComponent({
  props: {
    note: {
      type: Object,
      default: null,
    },
    containerTitle: {
      type: String,
      default: null,
    },
    containerKind: {
      type: String,
      default: null,
    },
    containerItems: {
      type: Array,
      default: () => [],
    },
    pendingBlockTarget: {
      type: Object,
      default: null,
    },
  },
  emits: ['consumed-pending-target'],
  template: `
    <div
      class="editor-pane-stub"
      :data-note-id="note?.id ?? ''"
      :data-container-title="containerTitle ?? ''"
      :data-container-kind="containerKind ?? ''"
      :data-container-items="containerItems.map(item => item.kind + ':' + item.meta.id).join(',')"
    >
      {{ pendingBlockTarget ? pendingBlockTarget.noteId : "none" }}
    </div>
  `,
})

const SettingsModalStub = defineComponent({
  props: {
    open: {
      type: Boolean,
      default: false,
    },
    initialSection: {
      type: String,
      default: null,
    },
  },
  template: '<div class="settings-modal-stub" :data-open="open" :data-section="initialSection"></div>',
})

const KanbanViewStub = defineComponent({
  props: {
    boardId: {
      type: String,
      required: true,
    },
  },
  template: '<div class="kanban-view-stub" :data-board-id="boardId"></div>',
})

const HistoryModalStub = defineComponent({
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  template: '<div class="history-modal-stub" :data-open="open"></div>',
})

async function flushUi() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

async function mountShell(options?: {
  initialRoute?: string
  manifestOverride?: Partial<ReturnType<typeof useWorkspaceStore>['manifest']>
}) {
  setActivePinia(createPinia())
  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()
  const noteStore = useNoteStore()
  const kanbanStore = useKanbanStore()

  workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }
  workspaceStore.manifest = {
    id: 'workspace-1',
    name: 'Workspace',
    glyph: 'N',
    gradient: 'violet',
    schemaVersion: 1,
    createdAt: '2026-05-16T10:00:00.000Z',
    rootOrder: ['note-1'],
    rootNotes: [
      {
        id: 'note-1',
        title: 'Alpha note',
        icon: '📄',
        folderId: null,
        updatedAt: '2026-05-16T10:00:00.000Z',
      },
    ],
    tree: [],
    ...(options?.manifestOverride ?? {}),
  }
  workspaceStore.settings = createDefaultWorkspaceSettings()
  workspaceStore.plugins = []
  workspaceStore.appConfig.locale = 'en'
  workspaceStore.appMetadata = {
    version: '0.1.0',
    engine: 'Tauri 2',
    runtime: 'desktop',
    platform: 'linux',
    appDataDir: '/tmp/app',
    configPath: '/tmp/app/config.json',
    logsPath: '/tmp/app/logs',
    supportsWindowControls: true,
    supportsGlobalShortcuts: true,
    supportsRevealInFileManager: true,
    supportsWindowDragRegions: true,
  }
  workspaceStore.updateLastContext = vi.fn().mockResolvedValue(undefined)

  vi.mocked(noteCommands.listNoteSnapshots).mockResolvedValue([])
  vi.mocked(noteCommands.loadNote).mockResolvedValue({
    id: 'note-2',
    title: 'Block note',
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
    content: { type: 'doc', content: [] },
  })
  vi.mocked(noteCommands.searchWorkspaceBlocks).mockResolvedValue([
    {
      type: 'block',
      id: 'note-2:0',
      noteId: 'note-2',
      noteTitle: 'Block note',
      folderId: null,
      blockIndex: 0,
      snippet: 'alpha block match',
      blockText: 'alpha block match',
    },
  ])
  vi.mocked(kanbanCommands.listBoards).mockResolvedValue([])

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workspace', component: { template: '<div />' } },
      { path: '/workspace/note/:noteId', component: { template: '<div />' } },
      { path: '/workspace/folder/:folderId', component: { template: '<div />' } },
      { path: '/workspace/graph', component: { template: '<div />' } },
      { path: '/workspace/board/:boardId', component: { template: '<div />' } },
      { path: '/onboarding', component: { template: '<div />' } },
    ],
  })
  await router.push(options?.initialRoute ?? '/workspace')
  await router.isReady()

  const wrapper = mount(WorkspaceShell, {
    attachTo: document.body,
    global: {
      plugins: [i18n, router],
      stubs: {
        WorkspaceSidebar: SidebarStub,
        WorkspaceEditorPane: EditorPaneStub,
        WorkspaceSettingsModal: SettingsModalStub,
        WorkspaceHistoryModal: HistoryModalStub,
        KanbanView: KanbanViewStub,
        WindowControls: true,
      },
    },
  })

  await flushUi()

  return { wrapper, router, workspaceStore, treeStore, noteStore, kanbanStore }
}

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the titlebar search for the workspace search hotkey', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    const { wrapper } = await mountShell()

    dispatchHotkeyCommand('workspace.search')
    await flushUi()

    const input = wrapper.get('input')
    expect(document.activeElement).toBe(input.element)
    expect(promptSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('seeds the shared titlebar search from the tree search action', async () => {
    const { wrapper } = await mountShell()

    await wrapper.get('.emit-search').trigger('click')
    await flushUi()

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Seeded title')

    wrapper.unmount()
  })

  it('opens settings to the matched section from titlebar search results', async () => {
    const { wrapper } = await mountShell()

    await wrapper.get('input').setValue('mode')
    await flushUi()

    await vi.waitFor(() => {
      expect(document.body.textContent ?? '').toContain('Mode')
    })

    const resultButton = document.body.querySelector<HTMLButtonElement>('.titlebar-search__result')
    expect(resultButton).toBeTruthy()

    resultButton!.click()
    await flushUi()

    const modal = wrapper.get('.settings-modal-stub')
    expect(modal.attributes('data-open')).toBe('true')
    expect(modal.attributes('data-section')).toBe('appearance')

    wrapper.unmount()
  })

  it('opens the parent note and passes a pending block target for block results', async () => {
    const { wrapper, router } = await mountShell()

    await wrapper.get('input').setValue('alpha')
    await flushUi()

    const resultButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('alpha block match'))
    expect(resultButton).toBeTruthy()

    resultButton!.click()
    await flushUi()
    await flushUi()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/workspace/note/note-2')
    })
    expect(wrapper.get('.editor-pane-stub').text()).toBe('note-2')

    wrapper.unmount()
  })

  it('switches to drawer navigation and suppresses window controls on mobile runtimes', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })

    const { wrapper, workspaceStore } = await mountShell()
    workspaceStore.appMetadata = {
      ...workspaceStore.appMetadata!,
      runtime: 'android',
      platform: 'android',
      supportsWindowControls: false,
      supportsGlobalShortcuts: false,
      supportsRevealInFileManager: false,
      supportsWindowDragRegions: false,
    }
    window.dispatchEvent(new Event('resize'))
    await flushUi()

    expect(wrapper.find('window-controls-stub').exists()).toBe(false)
    expect(wrapper.find('.workspace-drawer-toggle').exists()).toBe(true)
    expect(wrapper.find('.workspace-sidebar-shell--desktop').exists()).toBe(false)
    expect(document.body.querySelectorAll('.sidebar-stub')).toHaveLength(0)

    await wrapper.get('.workspace-drawer-toggle').trigger('click')
    await flushUi()

    expect(document.body.querySelectorAll('.sidebar-stub')).toHaveLength(1)

    wrapper.unmount()
  })

  it('passes root overview data into the editor pane on the workspace route', async () => {
    const { wrapper } = await mountShell({
      manifestOverride: {
        rootOrder: ['folder-1', 'note-1'],
        tree: [
          {
            id: 'folder-1',
            title: 'Projects',
            icon: '📁',
            parentId: null,
            order: 0,
            children: [],
            notes: [],
          },
        ],
      },
    })

    const editor = wrapper.get('.editor-pane-stub')
    expect(editor.attributes('data-container-kind')).toBe('root')
    expect(editor.attributes('data-container-title')).toBe('Workspace')
    expect(editor.attributes('data-container-items')).toBe('folder:folder-1,note:note-1')

    wrapper.unmount()
  })

  it('passes resolved folder overview data into the editor pane on folder routes', async () => {
    const { wrapper } = await mountShell({
      initialRoute: '/workspace/folder/folder-1',
      manifestOverride: {
        tree: [
          {
            id: 'folder-1',
            title: 'Research',
            icon: '📁',
            parentId: null,
            order: 0,
            children: [
              {
                id: 'folder-2',
                title: 'Specs',
                icon: '📁',
                parentId: 'folder-1',
                order: 0,
                children: [],
                notes: [],
              },
            ],
            notes: [
              {
                id: 'note-2',
                title: 'Draft',
                icon: '📄',
                folderId: 'folder-1',
                updatedAt: '2026-05-16T10:00:00.000Z',
              },
            ],
          },
        ],
      },
    })

    const editor = wrapper.get('.editor-pane-stub')
    expect(editor.attributes('data-container-kind')).toBe('folder')
    expect(editor.attributes('data-container-title')).toBe('Research')
    expect(editor.attributes('data-container-items')).toBe('folder:folder-2,note:note-2')

    wrapper.unmount()
  })

  it('renders the board route through the Kanban view instead of the editor pane', async () => {
    const { wrapper } = await mountShell({
      initialRoute: '/workspace/board/board-1',
    })

    expect(wrapper.find('.kanban-view-stub').exists()).toBe(true)
    expect(wrapper.find('.kanban-view-stub').attributes('data-board-id')).toBe('board-1')
    expect(wrapper.find('.editor-pane-stub').exists()).toBe(false)

    wrapper.unmount()
  })

  it('synchronizes active board state across note, board, and workspace routes', async () => {
    const { wrapper, router, kanbanStore } = await mountShell({
      initialRoute: '/workspace/note/note-1',
    })

    expect(kanbanStore.activeBoardId).toBeNull()

    await router.push('/workspace/board/board-2')
    await flushUi()

    expect(kanbanStore.activeBoardId).toBe('board-2')

    await router.push('/workspace')
    await flushUi()

    expect(kanbanStore.activeBoardId).toBeNull()

    wrapper.unmount()
  })

  it('keeps root overview instead of falling back to the generic empty state when root has content', async () => {
    const { wrapper } = await mountShell({
      manifestOverride: {
        rootOrder: ['folder-1'],
        rootNotes: [],
        tree: [
          {
            id: 'folder-1',
            title: 'Docs',
            icon: '📁',
            parentId: null,
            order: 0,
            children: [],
            notes: [],
          },
        ],
      },
    })

    const editor = wrapper.get('.editor-pane-stub')
    expect(editor.attributes('data-container-kind')).toBe('root')
    expect(editor.attributes('data-container-items')).toBe('folder:folder-1')

    wrapper.unmount()
  })

  it('keeps folder overview instead of falling back to the generic empty state when the folder has content', async () => {
    const { wrapper } = await mountShell({
      initialRoute: '/workspace/folder/folder-1',
      manifestOverride: {
        tree: [
          {
            id: 'folder-1',
            title: 'Docs',
            icon: '📁',
            parentId: null,
            order: 0,
            children: [],
            notes: [
              {
                id: 'note-9',
                title: 'Meeting notes',
                icon: '📄',
                folderId: 'folder-1',
                updatedAt: '2026-05-16T10:00:00.000Z',
              },
            ],
          },
        ],
      },
    })

    const editor = wrapper.get('.editor-pane-stub')
    expect(editor.attributes('data-container-kind')).toBe('folder')
    expect(editor.attributes('data-container-items')).toBe('note:note-9')

    wrapper.unmount()
  })
})
