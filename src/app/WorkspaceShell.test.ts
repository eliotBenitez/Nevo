import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
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
import { updateViewport } from '../composables/useDeviceLayout'
import { useToast } from '../ui/composables/useToast'
import { createNotebook } from '../core/notebook'

const mobileBack = vi.hoisted(() => ({ handlers: [] as Array<() => void | Promise<void>> }))
vi.mock('../composables/useMobileBackButton', () => ({
  useMobileBackButton: (handler: () => void | Promise<void>) => { mobileBack.handlers.push(handler) },
}))

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
  emits: ['tree-action', 'open-trash', 'create-folder', 'create-notebook', 'open-note'],
  template: `
    <div class="sidebar-stub">
      <button class="emit-create-notebook" @click="$emit('create-notebook')">Create notebook</button>
      <button class="emit-search" @click="$emit('tree-action', { action: 'search', target: { kind: 'note', id: 'note-1', title: 'Seeded title', folderId: null } })">
        Search
      </button>
      <button class="emit-delete-note" @click="$emit('tree-action', { action: 'delete', target: { kind: 'note', id: 'note-1', title: 'Alpha note', folderId: null } })">
        Delete note
      </button>
      <button class="emit-delete-background-note" @click="$emit('tree-action', { action: 'delete', target: { kind: 'note', id: 'note-2', title: 'Beta note', folderId: null } })">
        Delete background note
      </button>
      <button class="emit-create-folder" @click="$emit('create-folder')">
        Create folder
      </button>
      <button class="emit-open-trash" @click="$emit('open-trash')">
        Open Trash
      </button>
      <button class="emit-open-note" @click="$emit('open-note', 'note-1')">
        Open note
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

const SettingsViewStub = defineComponent({
  props: {
    section: {
      type: String,
      default: null,
    },
  },
  emits: ['back'],
  template: '<div class="settings-view-stub" :data-section="section"><button class="emit-settings-back" @click="$emit(\'back\')">Back</button></div>',
})

const ArchiveViewStub = defineComponent({
  emits: ['back'],
  template: '<div class="archive-view-stub"><button class="emit-archive-back" @click="$emit(\'back\')">Back</button></div>',
})

const HistoryViewStub = defineComponent({
  props: {
    noteId: {
      type: String,
      required: true,
    },
  },
  emits: ['back', 'open-note'],
  template: '<div class="history-view-stub" :data-note-id="noteId"><button class="emit-history-back" @click="$emit(\'back\')">Back</button><button class="emit-history-copy-open-note" @click="$emit(\'open-note\', \'note-2\')">Open copied note</button><button class="emit-history-open-parent-note" @click="$emit(\'open-note\', noteId)">Open parent note</button></div>',
})

const HistoryNotePickerStub = defineComponent({
  emits: ['back', 'select'],
  template: '<div class="history-note-picker-stub"><button class="emit-history-picker-back" @click="$emit(\'back\')">Back</button><button class="emit-history-picker-select" @click="$emit(\'select\', \'note-2\')">Select note</button></div>',
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

async function flushAnimationFrame() {
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  await flushUi()
}

async function mountShell(options?: {
  initialRoute?: string
  webHistory?: boolean
  manifestOverride?: Partial<ReturnType<typeof useWorkspaceStore>['manifest']>
}) {
  const pinia = createPinia()
  setActivePinia(pinia)
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
  treeStore.deleteNote = vi.fn().mockResolvedValue(undefined)

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

  if (options?.webHistory) window.history.replaceState(null, '', '/')
  const router = createRouter({
    history: options?.webHistory ? createWebHistory() : createMemoryHistory(),
    routes: [
      { path: '/workspace', component: { template: '<div />' } },
      { path: '/workspace/note/:noteId', component: { template: '<div />' } },
      { path: '/workspace/note/:noteId/canvas', component: { template: '<div />' } },
      { path: '/workspace/note/:noteId/history', component: { template: '<div />' } },
      { path: '/workspace/history', component: { template: '<div />' } },
      { path: '/workspace/folder/:folderId', component: { template: '<div />' } },
      { path: '/workspace/graph', component: { template: '<div />' } },
      { path: '/workspace/more', component: { template: '<div />' } },
      { path: '/workspace/board/:boardId', component: { template: '<div />' } },
      { path: '/workspace/plugin/nevo.kanban/:boardId', component: { template: '<div />' } },
      { path: '/workspace/plugin/:pluginId/:viewId?', component: { template: '<div />' } },
      { path: '/workspace/settings/:section?', component: { template: '<div />' } },
      { path: '/workspace/archive', component: { template: '<div />' } },
      { path: '/onboarding', component: { template: '<div />' } },
    ],
  })
  await router.push(options?.initialRoute ?? '/workspace')
  await router.isReady()

  const wrapper = mount(WorkspaceShell, {
    attachTo: document.body,
    global: {
      plugins: [i18n, router, pinia],
      stubs: {
        WorkspaceSidebar: SidebarStub,
        WorkspaceEditorPane: EditorPaneStub,
        WorkspaceSettingsView: SettingsViewStub,
        WorkspaceArchiveView: ArchiveViewStub,
        HistoryView: HistoryViewStub,
        HistoryNotePicker: HistoryNotePickerStub,
        WorkspaceHistoryModal: HistoryModalStub,
        KanbanView: KanbanViewStub,
        GraphView: true,
        WindowControls: true,
      },
    },
  })

  activeWrapper = wrapper
  await flushPromises()
  await flushUi()

  return { wrapper, router, workspaceStore, treeStore, noteStore, kanbanStore }
}

// WorkspaceShell registers its handler first; child components register after it.
const shellBack = async () => { await mobileBack.handlers[0]?.() }

let activeWrapper: VueWrapper | null = null

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileBack.handlers.length = 0
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
    updateViewport()
  })

  afterEach(async () => {
    if (activeWrapper) {
      activeWrapper.unmount()
      activeWrapper = null
    }
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
    updateViewport()
    await flushUi()
  })

  it('creates and opens a notebook directly without the creation dialog', async () => {
    const { wrapper, router, treeStore, workspaceStore } = await mountShell()
    const note = {
      id: 'new-notebook', title: 'Untitled', icon: '📓', folderId: null,
      createdAt: '', updatedAt: '', content: { type: 'doc' as const },
      documentKind: 'notebook' as const, notebook: createNotebook('ruled'),
    }
    vi.mocked(noteCommands.loadNote).mockResolvedValue(note)
    const create = vi.spyOn(treeStore, 'createNotebook').mockImplementation(async () => {
      workspaceStore.manifest!.rootNotes.push(note)
      return note
    })
    await wrapper.get('.emit-create-notebook').trigger('click')
    await flushPromises()
    await flushUi()
    expect(create).toHaveBeenCalledWith(null, 'Untitled', '📓', 'ruled')
    expect(router.currentRoute.value.path).toBe('/workspace/note/new-notebook')
    expect(document.querySelector('#create-notebook-form')).toBeNull()
    create.mockRestore()
  })

  it.each(['/workspace/graph', '/workspace/history'])('returns from %s to the previous in-app screen on system back', async (path) => {
    Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true })
    updateViewport()
    const { wrapper, router } = await mountShell({ initialRoute: '/workspace/more', webHistory: true })

    try {
      await router.push(path)
      await flushAnimationFrame()
      await shellBack()
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/workspace/more'))
    } finally {
      wrapper.unmount()
    }
  })

  it.each(['/workspace/graph', '/workspace/history'])('falls back to home on system back from %s without in-app history', async (path) => {
    Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true })
    updateViewport()
    const { wrapper, router } = await mountShell({ initialRoute: path, webHistory: true })

    try {
      await flushAnimationFrame()
      await shellBack()
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/workspace'))
    } finally {
      wrapper.unmount()
    }
  })

  it('returns from note history to the note chooser', async () => {
    const { wrapper, router } = await mountShell({ initialRoute: '/workspace/note/note-1/history' })

    try {
      await flushAnimationFrame()
      await wrapper.get('.emit-history-back').trigger('click')
      await vi.waitFor(() => {
        expect(router.currentRoute.value.path).toBe('/workspace/history')
      })
      await flushAnimationFrame()
      expect(router.currentRoute.value.path).toBe('/workspace/history')
    } finally {
      wrapper.unmount()
    }
  })

  it('shows the history chooser without loading or opening a note, then routes the selected note to history', async () => {
    const { wrapper, router, noteStore } = await mountShell({ initialRoute: '/workspace' })
    const loadSpy = vi.spyOn(noteStore, 'loadNote')

    dispatchHotkeyCommand('workspace.open-history')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/workspace/history'))
    await flushAnimationFrame()
    expect(wrapper.find('.history-note-picker-stub').exists()).toBe(true)
    expect(loadSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.emit-history-picker-select').exists()).toBe(true)

    await wrapper.get('.emit-history-picker-select').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/workspace/note/note-2/history'))
    await flushAnimationFrame()
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('opens the chooser from an editor without adding an active note tab', async () => {
    const { wrapper, router, noteStore } = await mountShell({ initialRoute: '/workspace/note/note-1' })
    const tabsStore = useTabsStore()
    await flushAnimationFrame()
    const initialTabIds = tabsStore.tabs.map(tab => tab.id)
    const initialActiveTabId = tabsStore.activeTabId
    noteStore.markContentDirty()
    const saveSpy = vi.spyOn(noteStore, 'saveNote').mockImplementation(async () => {
      noteStore.isDirty = false
      noteStore.saveStatus = 'saved'
    })
    const loadSpy = vi.spyOn(noteStore, 'loadNote')

    dispatchHotkeyCommand('workspace.open-history')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/workspace/history'))
    await flushAnimationFrame()

    expect(wrapper.find('.history-note-picker-stub').exists()).toBe(true)
    expect(saveSpy).toHaveBeenCalled()
    expect(loadSpy).not.toHaveBeenCalled()
    expect(tabsStore.tabs.map(tab => tab.id)).toEqual(initialTabIds)
    expect(tabsStore.activeTabId).toBe(initialActiveTabId)
  })

  it('keeps the dirty note open and reports a save error when History is requested', async () => {
    const { wrapper, router, noteStore } = await mountShell({ initialRoute: '/workspace/note/note-2' })
    await flushAnimationFrame()
    const openNote = noteStore.activeNote
    noteStore.markContentDirty()
    vi.spyOn(noteStore, 'saveNote').mockImplementation(async () => {
      noteStore.isDirty = true
      noteStore.saveStatus = 'error'
    })

    dispatchHotkeyCommand('workspace.open-history')
    await flushAnimationFrame()

    expect(router.currentRoute.value.path).toBe('/workspace/note/note-2')
    expect(noteStore.activeNote).toBe(openNote)
    expect(noteStore.isDirty).toBe(true)
    expect(useToast().toastState.items.at(-1)?.message).toContain('Could not save the note')
    wrapper.unmount()
  })

  it('returns a direct History route to the editor when saving the active note fails', async () => {
    const { wrapper, router, noteStore } = await mountShell({ initialRoute: '/workspace/note/note-2' })
    await flushAnimationFrame()
    const openNote = noteStore.activeNote
    noteStore.markContentDirty()
    vi.spyOn(noteStore, 'saveNote').mockImplementation(async () => {
      noteStore.isDirty = true
      noteStore.saveStatus = 'error'
    })

    const toastCount = useToast().toastState.items.length
    await router.push('/workspace/note/note-2/history')
    await vi.waitFor(() => expect(useToast().toastState.items.length).toBeGreaterThan(toastCount))
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/workspace/note/note-2'))

    expect(noteStore.activeNote).toBe(openNote)
    expect(noteStore.isDirty).toBe(true)
    expect(useToast().toastState.items.at(-1)?.message).toContain('Could not save the note')
    wrapper.unmount()
  })

  it('keeps a dirty editor open when a direct History chooser route cannot save', async () => {
    const { wrapper, router, noteStore } = await mountShell({ initialRoute: '/workspace/note/note-2' })
    await flushAnimationFrame()
    const openNote = noteStore.activeNote
    noteStore.markContentDirty()
    vi.spyOn(noteStore, 'saveNote').mockImplementation(async () => {
      noteStore.isDirty = true
      noteStore.saveStatus = 'error'
    })

    const toastCount = useToast().toastState.items.length
    await router.push('/workspace/history')
    await vi.waitFor(() => expect(useToast().toastState.items.length).toBeGreaterThan(toastCount))
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/workspace/note/note-2'))

    expect(noteStore.activeNote).toBe(openNote)
    expect(noteStore.isDirty).toBe(true)
    wrapper.unmount()
  })

  it('leaves history when selecting the same note in the sidebar', async () => {
    localStorage.setItem('nevo.canvas.workspace-1.note-1.view', 'canvas')
    const { wrapper, router } = await mountShell({ initialRoute: '/workspace/note/note-1/history' })

    try {
      await flushAnimationFrame()
      const sidebarButton = document.body.querySelector<HTMLButtonElement>('.emit-open-note')
      expect(sidebarButton).toBeTruthy()
      sidebarButton!.click()
      await vi.waitFor(() => {
        expect(router.currentRoute.value.path).toBe('/workspace/note/note-1')
      })
      await flushAnimationFrame()
      expect(router.currentRoute.value.path).toBe('/workspace/note/note-1')
    } finally {
      localStorage.removeItem('nevo.canvas.workspace-1.note-1.view')
      wrapper.unmount()
    }
  })

  it('opens the copied note from history', async () => {
    const { wrapper, router } = await mountShell({ initialRoute: '/workspace/note/note-1/history' })

    try {
      await flushAnimationFrame()
      await wrapper.get('.emit-history-copy-open-note').trigger('click')
      await vi.waitFor(() => {
        expect(router.currentRoute.value.path).toBe('/workspace/note/note-2')
      })
      await flushAnimationFrame()
    } finally {
      wrapper.unmount()
    }
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

  it('closes the search overlay when the workspace search hotkey is pressed again', async () => {
    const { wrapper } = await mountShell()

    dispatchHotkeyCommand('workspace.search')
    await flushUi()
    expect(document.body.querySelector('.search-overlay__input')).toBeTruthy()

    dispatchHotkeyCommand('workspace.search')
    await flushUi()
    expect(document.body.querySelector('.search-overlay__input')).toBeFalsy()

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
    const panel = dialog?.closest('[role="dialog"]')
    expect(panel?.getAttribute('role')).toBe('dialog')
    expect(panel?.getAttribute('aria-modal')).toBe('true')
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
    const { wrapper, router } = await mountShell()

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
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/workspace/settings/appearance')
    })
    await flushUi()
    const view = wrapper.get('.settings-view-stub')
    expect(view.attributes('data-section')).toBe('appearance')

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
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    updateViewport()

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

  it('hides duplicate compact-header History and Settings actions on mobile runtimes', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    updateViewport()

    const { wrapper, workspaceStore } = await mountShell()
    expect(wrapper.findAll('.titlebar-action-btn')).toHaveLength(2)

    for (const device of [
      { width: 800, runtime: 'android', platform: 'android' },
      { width: 1280, runtime: 'android', platform: 'android' },
      { width: 900, runtime: 'ios', platform: 'ios' },
    ] as const) {
      Object.defineProperty(window, 'innerWidth', { value: device.width, configurable: true })
      updateViewport()
      workspaceStore.appMetadata = {
        ...workspaceStore.appMetadata!,
        runtime: device.runtime,
        platform: device.platform,
        supportsWindowControls: false,
        supportsGlobalShortcuts: false,
        supportsRevealInFileManager: false,
        supportsWindowDragRegions: false,
      }
      await flushUi()

      expect(wrapper.find('.titlebar-actions').exists()).toBe(false)
    }

    workspaceStore.appMetadata = {
      ...workspaceStore.appMetadata!,
      runtime: 'desktop',
      platform: 'linux',
      supportsWindowControls: true,
    }
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    updateViewport()
    await flushUi()
    expect(wrapper.findAll('.titlebar-action-btn')).toHaveLength(2)

    wrapper.unmount()
  })

  it('uses the mobile editor header and opens the note details screen', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    updateViewport()

    const { wrapper, noteStore, router } = await mountShell({
      initialRoute: '/workspace/note/note-1',
    })
    noteStore.activeNote = {
      id: 'note-1',
      title: 'Alpha note',
      icon: '📄',
      folderId: null,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
      properties: {
        type: 'note',
        status: 'active',
        date: null,
        tags: ['alpha'],
      },
      content: { type: 'doc', content: [] },
    }
    window.dispatchEvent(new Event('resize'))
    await flushAnimationFrame()

    expect(wrapper.find('.workspace-titlebar').exists()).toBe(false)
    expect(wrapper.get('.mobile-editor-header__context').text()).toBe('Workspace')

    await wrapper.get('button[aria-label="More"]').trigger('click')
    await flushUi()
    const canvasItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.trim() === 'Canvas')
    canvasItem?.click()
    await flushUi()

    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/workspace/note/note-1/canvas')
    })
    expect(wrapper.get('.mobile-editor-header__canvas-title').text()).toContain('Canvas ·')

    await wrapper.get('button[aria-label="More"]').trigger('click')
    await flushUi()
    const detailsItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.trim() === 'Note details')
    detailsItem?.click()
    await flushUi()

    expect(wrapper.get('.mobile-note-details h1').text()).toBe('Note details')
    expect(wrapper.get('.workspace-editor-pane-shell').attributes('style')).toContain('display: none')
    await wrapper.get('.mobile-note-details__done').trigger('click')
    expect(wrapper.find('.mobile-note-details').exists()).toBe(false)
    expect(wrapper.get('.workspace-editor-pane-shell').attributes('style')).not.toContain('display: none')

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

  it('keeps the current note open when a background tab is closed', async () => {
    const { wrapper, router } = await mountShell({
      initialRoute: '/workspace/note/note-1',
    })
    const tabsStore = useTabsStore()
    tabsStore.openTab('note-1', 'Alpha note', '📄')
    tabsStore.openTab('note-2', 'Beta note', '📝')
    tabsStore.activeTabId = 'note-1'
    await flushUi()

    const closeButtons = wrapper.findAll('.tab-close')
    await closeButtons[1].trigger('click')
    await flushUi()

    expect(tabsStore.tabs.map(tab => tab.noteId)).toEqual(['note-1'])
    expect(tabsStore.activeTabId).toBe('note-1')
    expect(router.currentRoute.value.fullPath).toBe('/workspace/note/note-1')

    wrapper.unmount()
  })

  it('removes a deleted active note from the title bar and opens the adjacent tab', async () => {
    const { wrapper, router, workspaceStore, treeStore } = await mountShell({
      initialRoute: '/workspace/note/note-1',
    })
    const tabsStore = useTabsStore()
    tabsStore.openTab('note-1', 'Alpha note', '📄')
    tabsStore.openTab('note-2', 'Beta note', '📝')
    tabsStore.activeTabId = 'note-1'
    workspaceStore.settings.general.confirmBeforeDelete = false

    await wrapper.get('.emit-delete-note').trigger('click')
    await flushUi()

    expect(treeStore.deleteNote).toHaveBeenCalledWith('note-1')
    expect(tabsStore.tabs.map(tab => tab.noteId)).toEqual(['note-2'])
    expect(tabsStore.activeTabId).toBe('note-2')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/workspace/note/note-2')
    })

    wrapper.unmount()
  })

  it('removes a deleted background note without changing the active tab', async () => {
    const { wrapper, router, workspaceStore } = await mountShell({
      initialRoute: '/workspace/note/note-1',
    })
    const tabsStore = useTabsStore()
    tabsStore.openTab('note-1', 'Alpha note', '📄')
    tabsStore.openTab('note-2', 'Beta note', '📝')
    tabsStore.activeTabId = 'note-1'
    workspaceStore.settings.general.confirmBeforeDelete = false

    await wrapper.get('.emit-delete-background-note').trigger('click')
    await flushUi()

    expect(tabsStore.tabs.map(tab => tab.noteId)).toEqual(['note-1'])
    expect(tabsStore.activeTabId).toBe('note-1')
    expect(router.currentRoute.value.fullPath).toBe('/workspace/note/note-1')

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

  it('navigates to archive screen on open-trash and returns on back emit', async () => {
    const { wrapper, router } = await mountShell({ initialRoute: '/workspace' })

    expect(wrapper.find('.archive-view-stub').exists()).toBe(false)

    // Open trash / archive
    await wrapper.find('.emit-open-trash').trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/workspace/archive')
    })
    await flushUi()
    expect(wrapper.find('.archive-view-stub').exists()).toBe(true)

    // Emit back from archive view returns to previous route
    await wrapper.find('.emit-archive-back').trigger('click')
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/workspace')
    })
    await flushUi()
    expect(wrapper.find('.archive-view-stub').exists()).toBe(false)

    wrapper.unmount()
  })

  it('flushes unsaved note edits when navigating to settings', async () => {
    const { wrapper, router, noteStore } = await mountShell({ initialRoute: '/workspace/note/note-1' })
    noteStore.markContentDirty()
    const saveSpy = vi.spyOn(noteStore, 'saveNote').mockResolvedValue()

    await router.push('/workspace/settings')
    await flushUi()

    expect(saveSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('skips updateLastContext when on a system route', async () => {
    const { wrapper, router, workspaceStore } = await mountShell({ initialRoute: '/workspace/note/note-1' })
    const updateSpy = vi.spyOn(workspaceStore, 'updateLastContext')

    await router.push('/workspace/settings')
    await flushUi()

    expect(updateSpy).not.toHaveBeenCalled()

    await router.push('/workspace/archive')
    await flushUi()

    expect(updateSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

})
