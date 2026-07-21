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
import { useTabsStore } from '../stores/tabs'
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
      listSidebarNotePreviews: vi.fn(),
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
  emits: ['tree-action', 'open-trash', 'create-folder'],
  template: `
    <div class="sidebar-stub">
      <button class="emit-search" @click="$emit('tree-action', { action: 'search', target: { kind: 'note', id: 'note-1', title: 'Seeded title', folderId: null } })">
        Search
      </button>
      <button class="emit-create-folder" @click="$emit('create-folder')">
        Create folder
      </button>
      <button class="emit-open-trash" @click="$emit('open-trash')">
        Open Trash
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
  emits: ['consumed-pending-target', 'plugin-contributions'],
  mounted() {
    this.$emit('plugin-contributions', {
      workspaceViews: [{
        id: 'plugin.frame.dashboard',
        pluginId: 'plugin.frame',
        title: 'Plugin dashboard',
        route: '/workspace/plugin/plugin.frame/dashboard',
        frame: {
          type: 'sandboxed-plugin-iframe',
          pluginId: 'plugin.frame',
          source: 'nevoplugin://0123456789abcdef0123456789abcdef/dashboard.html',
          sandbox: 'allow-scripts',
        },
      }],
      sidebarItems: [],
      modals: [],
    })
  },
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
    <section class="legacy-empty-state-stub">Legacy empty state</section>
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
  workspaceStore.plugins = [
    {
      id: 'nevo.kanban',
      name: 'Kanban Boards',
      version: '1.0.0',
      description: 'Kanban',
      enabled: true,
      kind: 'system',
      source: 'bundled',
      entryPoint: 'index.js',
      apiVersion: '1.0.0',
      editorCapabilities: [],
      uiCapabilities: ['workspace.view.register'],
      workspaceCapabilities: ['kanban.read', 'kanban.write'],
    },
    {
      id: 'nevo.templates',
      name: 'Templates',
      version: '1.0.0',
      description: 'Templates',
      enabled: true,
      kind: 'system',
      source: 'bundled',
      entryPoint: 'index.js',
      apiVersion: '1.0.0',
      editorCapabilities: [],
      uiCapabilities: ['workspace.view.register'],
      workspaceCapabilities: ['template.read', 'template.write'],
    },
  ]
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
  treeStore.createFolder = vi.fn().mockResolvedValue({
    id: 'folder-created',
    title: 'Project docs',
    icon: '📁',
    parentId: null,
    order: 0,
    notes: [],
    children: [],
  })

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
  vi.mocked(noteCommands.listSidebarNotePreviews).mockResolvedValue([])
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
      { path: '/workspace/plugin/nevo.kanban/:boardId', component: { template: '<div />' } },
      { path: '/workspace/plugin/:pluginId/:viewId?', component: { template: '<div />' } },
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

  it('opens the search overlay for the workspace search hotkey', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    const { wrapper } = await mountShell()

    dispatchHotkeyCommand('workspace.search')
    await flushUi()

    const input = document.body.querySelector<HTMLInputElement>('.search-overlay__input')
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)
    expect(promptSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('delegates Home search to the centered search overlay', async () => {
    const { wrapper } = await mountShell()

    await wrapper.get('.workspace-home__search').trigger('click')
    await flushUi()

    const input = document.body.querySelector<HTMLInputElement>('.search-overlay__input')
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)
    wrapper.unmount()
  })

  it('mounts sandboxed plugin workspace views while keeping the plugin host alive', async () => {
    const { wrapper } = await mountShell({
      initialRoute: '/workspace/plugin/plugin.frame/dashboard',
    })
    await flushUi()

    const frame = wrapper.get('.sandbox-plugin-view iframe')
    expect(frame.attributes('src')).toBe(
      'nevoplugin://0123456789abcdef0123456789abcdef/dashboard.html',
    )
    expect(frame.attributes('sandbox')).toBe('allow-scripts')
    expect(wrapper.get('.editor-pane-stub').isVisible()).toBe(false)

    wrapper.unmount()
  })

  it('triggers createNote when workspace.new-note hotkey command is dispatched', async () => {
    const { treeStore, wrapper } = await mountShell()
    const createNoteSpy = vi.spyOn(treeStore, 'createNote').mockResolvedValue({
      id: 'new-note-id',
      title: 'Untitled',
      icon: '📄',
      folderId: null,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
      content: { type: 'doc', content: [] },
    })

    dispatchHotkeyCommand('workspace.new-note')
    await flushUi()

    expect(createNoteSpy).toHaveBeenCalled()
    wrapper.unmount()
  })


  it('creates folders through a modal instead of window.prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    const { wrapper, treeStore } = await mountShell()

    const createFolderTrigger = wrapper.get('.emit-create-folder')
    const createFolderTriggerElement = createFolderTrigger.element as HTMLButtonElement
    createFolderTriggerElement.focus()
    await createFolderTrigger.trigger('click')
    await flushUi()

    expect(promptSpy).not.toHaveBeenCalled()
    expect(document.body.textContent ?? '').toContain('Create folder')

    const dialog = document.body.querySelector<HTMLFormElement>('.rename-modal')
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.querySelector('label')?.textContent).toBe('Folder name')

    const input = document.body.querySelector<HTMLInputElement>('.rename-modal__input')
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)

    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushUi()

    expect(document.body.querySelector('.rename-modal')).toBeNull()
    expect(document.activeElement).toBe(createFolderTriggerElement)

    await createFolderTrigger.trigger('click')
    await flushUi()

    const reopenedInput = document.body.querySelector<HTMLInputElement>('.rename-modal__input')
    expect(reopenedInput).toBeTruthy()

    reopenedInput!.value = 'Project docs'
    reopenedInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushUi()

    document.body.querySelector<HTMLFormElement>('.rename-modal')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushUi()

    expect(treeStore.createFolder).toHaveBeenCalledWith(null, 'Project docs', '📁')
    expect(document.body.querySelector('.rename-modal')).toBeNull()

    wrapper.unmount()
  })

  it('seeds the shared search overlay from the tree search action', async () => {
    const { wrapper } = await mountShell()

    await wrapper.get('.emit-search').trigger('click')
    await flushUi()

    const input = document.body.querySelector<HTMLInputElement>('.search-overlay__input')
    expect(input?.value).toBe('Seeded title')

    wrapper.unmount()
  })

  it('opens settings to the matched section from search overlay results', async () => {
    const { wrapper } = await mountShell()

    dispatchHotkeyCommand('workspace.search')
    await flushUi()

    const input = document.body.querySelector<HTMLInputElement>('.search-overlay__input')
    input!.value = 'mode'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushUi()

    await vi.waitFor(() => {
      expect(document.body.textContent ?? '').toContain('Mode')
    })

    const resultButton = document.body.querySelector<HTMLButtonElement>('.search-overlay__result')
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

    dispatchHotkeyCommand('workspace.search')
    await flushUi()

    const input = document.body.querySelector<HTMLInputElement>('.search-overlay__input')
    input!.value = 'alpha'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
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

  it('renders Home on the workspace route while keeping the editor plugin runtime mounted', async () => {
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
    expect(wrapper.find('.workspace-home').exists()).toBe(true)
    expect(editor.isVisible()).toBe(false)
    expect(wrapper.get('.legacy-empty-state-stub').isVisible()).toBe(false)

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

  it('preserves open tabs when navigating Home and returns Home after closing the last tab', async () => {
    const { wrapper, router } = await mountShell({
      initialRoute: '/workspace/note/note-1',
    })
    const tabsStore = useTabsStore()
    tabsStore.openTab('note-1', 'Alpha note', '📄')
    tabsStore.openTab('note-2', 'Beta note', '📝')
    await flushUi()

    await router.push('/workspace')
    await flushUi()

    expect(tabsStore.tabs.map(tab => tab.noteId)).toEqual(['note-1', 'note-2'])
    expect(wrapper.get('.editor-pane-stub').isVisible()).toBe(false)

    const closeButtons = wrapper.findAll('.tab-close')
    await closeButtons[1].trigger('click')
    await flushUi()
    await wrapper.get('.tab-close').trigger('click')
    await flushUi()

    expect(tabsStore.tabs).toEqual([])
    expect(router.currentRoute.value.fullPath).toBe('/workspace')

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

  it('opens and closes the trash modal via Escape key', async () => {
    const { wrapper } = await mountShell()

    expect(document.body.querySelector('.trash-modal')).toBeNull()

    // Open trash
    await wrapper.find('.emit-open-trash').trigger('click')
    await flushUi()

    expect(document.body.querySelector('.trash-modal')).not.toBeNull()

    // Press Escape on window
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    window.dispatchEvent(event)
    await flushUi()

    expect(document.body.querySelector('.trash-modal')).toBeNull()

    wrapper.unmount()
  })
})
