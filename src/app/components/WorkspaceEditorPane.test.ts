import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { openPath } from '@tauri-apps/plugin-opener'
import WorkspaceEditorPane from './WorkspaceEditorPane.vue'
import { focusBlockSearchTarget } from './editor/blockNavigation'
import en from '../../locales/en.json'
import type { FolderMeta, NoteDocument, NoteMeta, TreeNode } from '../../types/note'
import type { WorkspaceSettings } from '../../types/workspace'
import { noteCommands } from '../../tauri/commands'
import { useWorkspaceStore } from '../../stores/workspace'

const editorCoreMocks = vi.hoisted(() => {
  const clickHandlers = new WeakMap<HTMLDivElement, (event: MouseEvent) => void>()
  type MockCore = {
    editorView: unknown
    pluginHost: unknown
    schema: Record<string, never>
    commandRegistry: Map<string, unknown>
    coreCommands: unknown
    slashItems: unknown[]
    toolbarPluginActions: unknown[]
    pendingImageTargetPos: number | null
    pendingFileTargetPos: number | null
    lastSlashPluginState: { open: boolean; query: string; range: null; activeIndex: number; itemIds: string[] }
    isApplyingExternalState: boolean
    lastSerializedContent: string
    lastSerializedContentRef: NoteDocument['content'] | null
    lastLoadedNoteId: string | null
  }
  type MockCallbacks = {
    onInternalLinkOpen: (noteId: string, anchor: string | null) => void
    onFileOpenRequest: (src: string) => void
    onImageContextMenuRequest: (ctx: {
      position: number
      attrs: Record<string, unknown>
      anchorRect: DOMRect
      anchorPoint?: { top: number; left: number }
      focusCaption: () => void
      view: unknown
    }) => void
    onEmbedUrlRequest: (pos: number, anchorRect: DOMRect) => void
  }
  let latestCore: MockCore | null = null

  const editorSetup = {
    initPluginHost: vi.fn().mockResolvedValue(undefined),
    destroyEditorView: vi.fn(),
    setupEditorForNote: vi.fn(async (_note: NoteDocument, editorRoot: HTMLDivElement) => {
      const previousHandler = clickHandlers.get(editorRoot)
      if (previousHandler) editorRoot.removeEventListener('click', previousHandler)

      const handler = (event: MouseEvent) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const target = event.target
        if (!(target instanceof Element)) return
        const linkEl = target.closest('a[data-note-id]')
        const noteId = linkEl?.getAttribute('data-note-id')?.trim() ?? ''
        if (!noteId) return
        event.preventDefault()
        editorCoreMocks.callbacks?.onInternalLinkOpen(noteId, linkEl?.getAttribute('data-anchor') || null)
      }

      clickHandlers.set(editorRoot, handler)
      editorRoot.addEventListener('click', handler)
    }),
    executeStateCommand: vi.fn(() => false),
    runPluginToolbarAction: vi.fn(),
    runSlashItemFromOverlay: vi.fn(() => false),
    insertEmojiFromSlashPicker: vi.fn(() => false),
    executeCommandById: vi.fn(() => false),
    flushPendingContentUpdate: vi.fn(),
  }

  return {
    callbacks: null as null | MockCallbacks,
    latestCore: null as MockCore | null,
    createEditorCore: vi.fn(() => {
      latestCore = {
      editorView: null,
      pluginHost: null,
      schema: {},
      commandRegistry: new Map(),
      coreCommands: null,
      slashItems: [],
      toolbarPluginActions: [],
      pendingImageTargetPos: null,
      pendingFileTargetPos: null,
      lastSlashPluginState: { open: false, query: '', range: null, activeIndex: 0, itemIds: [] },
      isApplyingExternalState: false,
      lastSerializedContent: '',
      lastSerializedContentRef: null,
      lastLoadedNoteId: null,
      }
      return latestCore
    }),
    getLatestCore: () => latestCore,
    editorSetup,
  }
})

const overlayMocks = vi.hoisted(() => ({
  closeOverlays: vi.fn(),
  updateOverlays: vi.fn(),
  clampOverlayPosition: vi.fn((position) => position),
}))

const graphStoreMocks = vi.hoisted(() => ({
  updateNoteEdges: vi.fn(),
  loadNoteGraph: vi.fn(),
  clear: vi.fn(),
}))

const treeStoreMocks = vi.hoisted(() => ({
  noteById: new Map<string, NoteMeta>(),
}))

const collabStoreMocks = vi.hoisted(() => ({
  startHosting: vi.fn(),
  startCloudSession: vi.fn(),
  joinSession: vi.fn(),
  joinCloudSession: vi.fn(),
  leaveSession: vi.fn(),
  mode: null as string | null,
  connectionStatus: 'idle' as const,
  sessionNoteId: null as string | null,
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (src: string) => `asset://${src}`,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
}))

vi.mock('../../tauri/commands', () => ({
  workspaceCommands: {
    cleanupOrphanedAssets: vi.fn(),
  },
  noteCommands: {
    importImageAsset: vi.fn(),
    deleteUnreferencedAsset: vi.fn(),
    getMediaServerInfo: vi.fn(async () => ({ port: 1429, token: 'test-token' })),
  },
}))

vi.mock('../../stores/graph', () => ({
  useGraphStore: () => graphStoreMocks,
}))

vi.mock('../../stores/tree', () => ({
  useTreeStore: () => treeStoreMocks,
}))

vi.mock('../../stores/collab', () => ({
  useCollabStore: () => collabStoreMocks,
}))

vi.mock('../composables/editor/useEditorCore', () => ({
  createEditorCore: editorCoreMocks.createEditorCore,
  useEditorCore: (_core: unknown, callbacks: typeof editorCoreMocks.callbacks) => {
    editorCoreMocks.callbacks = callbacks
    return editorCoreMocks.editorSetup
  },
}))

vi.mock('../composables/editor/useEditorOverlays', () => ({
  useEditorOverlays: () => ({
    slashOverlay: { open: false, query: '', activeIndex: 0, items: [], position: { top: 0, left: 0 } },
    toolbarOverlay: { visible: false, position: { top: 0, left: 0 } },
    tableMenuOverlay: { visible: false, context: null, position: { top: 0, left: 0 } },
    linkPopover: { open: false, href: '', editing: false, error: '', position: { top: 0, left: 0 } },
    highlightPicker: { open: false, position: { top: 0, left: 0 } },
    textColorPicker: { open: false, position: { top: 0, left: 0 } },
    mathPopover: { open: false, latex: '', isInline: true, position: { top: 0, left: 0 }, nodePos: null },
    mermaidPopover: { open: false, code: '', position: { top: 0, left: 0 }, nodePos: null },
    markmapPopover: { open: false, markdown: '', position: { top: 0, left: 0 }, nodePos: null },
    vegaPopover: { open: false, spec: '', position: { top: 0, left: 0 }, nodePos: null },
    pluginNodePopover: { open: false, nodeName: null, title: '', fields: [], values: {}, removable: true, position: { top: 0, left: 0 }, nodePos: null },
    linkPickerOverlay: { open: false, query: '', activeIndex: 0, position: { top: 0, left: 0 } },
    activeMarkNames: new Set<string>(),
    closeOverlays: overlayMocks.closeOverlays,
    updateOverlays: overlayMocks.updateOverlays,
    clampOverlayPosition: overlayMocks.clampOverlayPosition,
  }),
}))

vi.mock('../composables/editor/useMathEditor', () => ({
  useMathEditor: () => ({
    openMathPopoverForNode: vi.fn(),
    closeMathPopover: vi.fn(),
    repositionMathPopover: vi.fn(),
    insertInlineMathAndEdit: vi.fn(() => false),
    insertBlockMathAndEdit: vi.fn(() => false),
    openSelectedMathPopover: vi.fn(),
    applyMathFromPopover: vi.fn(),
    removeMathFromPopover: vi.fn(),
    onMathInputKeyDown: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useLinkEditor', () => ({
  useLinkEditor: () => ({
    openLinkPopover: vi.fn(),
    closeLinkPopover: vi.fn(),
    applyLinkFromPopover: vi.fn(),
    removeLinkFromPopover: vi.fn(),
    onLinkInputKeyDown: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useMermaidEditor', () => ({
  useMermaidEditor: () => ({
    openMermaidPopoverForNode: vi.fn(),
    closeMermaidPopover: vi.fn(),
    repositionMermaidPopover: vi.fn(),
    openSelectedMermaidPopover: vi.fn(),
    applyMermaidFromPopover: vi.fn(),
    removeMermaidFromPopover: vi.fn(),
    onMermaidInputKeyDown: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useVegaEditor', () => ({
  useVegaEditor: () => ({
    openVegaPopoverForNode: vi.fn(),
    closeVegaPopover: vi.fn(),
    repositionVegaPopover: vi.fn(),
    applyVegaFromPopover: vi.fn(),
    removeVegaFromPopover: vi.fn(),
    onVegaInputKeyDown: vi.fn(),
  }),
}))

vi.mock('../composables/editor/useImageUpload', () => ({
  useImageUpload: () => ({
    onEditorDragOver: vi.fn(),
    onEditorDrop: vi.fn(),
    onImageInputChange: vi.fn(),
    requestImagePicker: vi.fn(),
    pickAndInsertImage: vi.fn(),
  }),
}))

vi.mock('./editor/blockNavigation', () => ({
  focusBlockSearchTarget: vi.fn(() => false),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const paneStubs = {
  DocAppearance: true,
  EditorOverlayContainer: true,
  EditorSlashMenu: true,
  EditorFloatingToolbar: true,
  EditorColorPicker: true,
  EditorTableMenu: true,
  EditorLinkPopover: true,
  EditorMathPopover: true,
  EditorLinkPicker: true,
  EditorCollabPanel: true,
  LocalGraphPanel: {
    template: '<div class="local-graph-panel-stub" />',
  },
  NoteBreadcrumb: {
    props: ['note'],
    template: '<div class="note-breadcrumb-stub"><slot name="actions" /></div>',
  },
  CollabAvatars: true,
  NvNoteIcon: true,
  Download: true,
  Network: true,
  Teleport: true,
}

const defaultSettings: WorkspaceSettings = {
  general: {
    defaultStartupView: 'editor',
    restoreLastContext: true,
    recentItemsBehavior: 'remember',
    confirmBeforeDelete: true,
    lastContext: { kind: 'workspace', folderId: null, noteId: null },
  },
  appearance: {
    accentPreset: 'violet',
    backgroundScene: 'aurora',
    surfaceStyle: 'glass',
    contrastMode: 'balanced',
    sidebarStyle: 'floating',
    editorFontFamily: 'ui',
    editorFontSize: 16,
    editorLineWidth: 'medium',
    customCssEnabled: false,
    customCssFileName: 'custom.css',
  },
  editor: {
    spellCheck: true,
    markdownShortcuts: true,
    slashCommands: true,
    smoothScrolling: false,
    caretAnimation: 'steady',
    tabKeyBehavior: 'indent',
    autosavePolicy: 'immediate',
    focusMode: 'off',
    typewriterScrolling: false,
    activeBlockEmphasis: false,
    pasteBehavior: 'smart',
    slashMenuHints: true,
    editorStatsVisibility: 'off',
    typewriterPosition: 'lower',
  },
  workspace: {
    defaultLandingView: 'editor',
    showGraphLabels: true,
    folderCreateBehavior: 'current-folder',
    rootNotesVisible: true,
    defaultSort: 'updated-desc',
    description: '',
    workspaceType: 'general',
    status: 'active',
    tags: [],
    openLastVisitedSystemView: true,
    rememberExpandedFolders: true,
    sidebarDefaultState: 'expanded',
    newNotePlacement: 'current-folder',
    newFolderPlacement: 'current-folder',
    defaultChildSort: 'manual',
    showEmptyFolders: true,
    defaultNoteIcon: '📄',
    defaultNoteTitlePattern: 'untitled',
    defaultFolderIcon: '📁',
    newNoteTemplate: 'blank',
    newWorkspaceHomeNote: true,
    autoCreateStarterStructure: 'light',
    sidebarSortMode: 'manual',
    graphEntryMode: 'global',
    graphScopeDefault: 'workspace',
    searchStartScope: 'workspace',
    historyDefaultRange: '30d',
    showBacklinksByDefault: true,
  },
  ai: {
    enabled: false,
    privacyMode: true,
    defaultProvider: 'local',
    defaultModel: 'test-model',
    slashCommands: false,
    contextualSuggestions: false,
    streamingOutput: false,
    maxTokensPerRequest: 1024,
    cloudDailyBudgetUsd: 0,
  },
  plugins: {
    autoReloadOnLaunch: false,
    installSource: 'folder-only',
  },
  features: {
    kanban: true,
  },
  hotkeys: {
    bindings: [],
  },
  files: {
    attachmentImportBehavior: 'copy-into-workspace',
    snapshotRetentionCount: 10,
  },
  advanced: {
    schemaVersion: 1,
    experimentalGraphTools: false,
    developerLogging: false,
  },
}

function createNote(): NoteDocument {
  return {
    id: 'note-1',
    title: 'Scrollable note',
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-17T10:00:00.000Z',
    updatedAt: '2026-05-17T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Body copy' }],
        },
      ],
    },
  }
}

function createNoteMeta(id: string, title: string, folderId: string | null = null): NoteMeta {
  return {
    id,
    title,
    icon: '📄',
    folderId,
    updatedAt: '2026-05-17T10:00:00.000Z',
  }
}

function registerExistingNote(id: string, title = 'Linked note') {
  treeStoreMocks.noteById.set(id, createNoteMeta(id, title))
}

function createFolderMeta(id: string, title: string, parentId: string | null = null): FolderMeta {
  return {
    id,
    title,
    icon: '📁',
    parentId,
    order: 0,
    children: [],
    notes: [],
  }
}

function setScrollDimensions(element: Element, clientHeight: number, scrollHeight: number) {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  })
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  })
}

function setTrackHeight(element: Element, clientHeight: number) {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  })
}

async function flushPane() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

async function openOverflowMenu(wrapper: VueWrapper) {
  await wrapper.get('button[aria-label="More options"]').trigger('click')
  await flushPane()
}

function getMenuButton(label: string) {
  return Array
    .from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
    .find((button) => button.textContent?.includes(label))
}

async function activateMenuButton(label: string) {
  const button = getMenuButton(label)
  expect(button).toBeTruthy()
  button!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button!.click()
  await flushPane()
}

function createFakeImageView() {
  const imageType = { name: 'image_block' }
  const node = { type: imageType, nodeSize: 1 }
  const tr = {
    setNodeAttribute: vi.fn(() => tr),
    delete: vi.fn(() => tr),
    scrollIntoView: vi.fn(() => tr),
  }
  const view = {
    state: {
      schema: { nodes: { image_block: imageType } },
      doc: { nodeAt: vi.fn(() => node) },
      get tr() { return tr },
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  }
  return { view: view as unknown as EditorView, tr, node }
}

async function openImageMenu(view: EditorView, anchorPoint?: { top: number; left: number }) {
  editorCoreMocks.callbacks?.onImageContextMenuRequest({
    position: 7,
    attrs: { src: '.nevo/assets/image.png' },
    anchorRect: { bottom: 22, left: 11 } as DOMRect,
    anchorPoint,
    focusCaption: vi.fn(),
    view,
  })
  await flushPane()
}

function appendInternalLink(wrapper: VueWrapper, noteId: string, anchor?: string | null) {
  const editorRoot = wrapper.get('.doc-editor').element as HTMLDivElement
  const link = document.createElement('a')
  link.setAttribute('data-note-id', noteId)
  if (anchor) link.setAttribute('data-anchor', anchor)
  link.textContent = 'Linked note'
  editorRoot.replaceChildren(link)
  return link
}

function mountPane(note: NoteDocument = createNote()) {
  const wrapper = mount(WorkspaceEditorPane, {
    attachTo: document.body,
    global: {
      plugins: [i18n, createPinia()],
      stubs: paneStubs,
    },
    props: {
      note,
      workspacePath: '/workspace',
      pluginManifests: [],
      settings: defaultSettings,
      saveStatus: 'saved',
      containerTitle: null,
      containerKind: null,
      containerItems: [],
      pendingBlockTarget: null,
    },
  })

  wrappers.push(wrapper)
  return wrapper
}

const wrappers: VueWrapper[] = []

describe('WorkspaceEditorPane scrollbar overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    treeStoreMocks.noteById.clear()
    registerExistingNote('note-1', 'Scrollable note')
    editorCoreMocks.callbacks = null
  })

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount()
    }
    document.body.innerHTML = ''
  })

  it('exposes an accessible name for the note icon button and hides the mouse-only thumb from keyboard focus', async () => {
    const wrapper = mountPane()
    const body = wrapper.get('.doc-body').element

    setScrollDimensions(body, 200, 400)
    await flushPane()

    const iconButton = wrapper.get('.doc-title-emoji')
    const thumb = wrapper.get('.editor-scrollbar__thumb')

    expect(iconButton.attributes('aria-label')).toBe('Change icon for Scrollable note')
    expect(thumb.attributes('aria-hidden')).toBe('true')
    expect(thumb.attributes('tabindex')).toBeUndefined()
  })

  it('renders the overflow trigger in the breadcrumb row and removes the old header controls', () => {
    const wrapper = mountPane()

    expect(wrapper.get('.note-breadcrumb-stub .breadcrumb-action-btn').attributes('aria-label')).toBe('More options')
    expect(wrapper.find('.doc-head').exists()).toBe(false)
    expect(wrapper.find('collab-avatars-stub').exists()).toBe(false)
    expect(wrapper.find('editor-collab-panel-stub').exists()).toBe(false)
  })

  it('uploads cover images through the workspace backend and renders resolved local cover URLs', async () => {
    vi.mocked(noteCommands.importImageAsset).mockResolvedValue({
      src: '.nevo/assets/cover.jpg',
      hash: 'hash',
      deduplicated: false,
      bytes: 3,
    })

    const wrapper = mountPane({ ...createNote(), cover: 'image:.nevo/assets/cover.jpg' })
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }
    await flushPane()

    const appearance = wrapper.findComponent({ name: 'DocAppearance' })
    expect(appearance.props('noteCoverStyle')).toEqual({
      backgroundImage: 'url("asset:///workspace/.nevo/assets/cover.jpg")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    })

    const input = wrapper.findAll<HTMLInputElement>('input[type="file"]')[1].element
    const file = new File(['abc'], 'cover.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    })

    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPane()

    expect(noteCommands.importImageAsset).toHaveBeenCalledWith('/workspace', 'cover.jpg', [97, 98, 99])
    expect(wrapper.emitted('update:cover')).toContainEqual(['image:.nevo/assets/cover.jpg'])
    expect(input.value).toBe('')
  })

  it('deletes a removed local cover asset after the note is saved', async () => {
    vi.mocked(noteCommands.deleteUnreferencedAsset).mockResolvedValue(true)

    const wrapper = mountPane({ ...createNote(), cover: 'image:.nevo/assets/old-cover.jpg' })
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }
    await flushPane()

    wrapper.findComponent({ name: 'DocAppearance' }).vm.$emit('removeCover')
    await flushPane()

    expect(wrapper.emitted('update:cover')).toContainEqual([null])
    expect(noteCommands.deleteUnreferencedAsset).not.toHaveBeenCalled()

    await wrapper.setProps({ saveStatus: 'unsaved' })
    await flushPane()
    await wrapper.setProps({ saveStatus: 'saved' })
    await flushPane()

    expect(noteCommands.deleteUnreferencedAsset).toHaveBeenCalledWith('/workspace', '.nevo/assets/old-cover.jpg')
  })

  it('opens an attached file through the OS opener', async () => {
    mountPane()
    await flushPane()

    editorCoreMocks.callbacks?.onFileOpenRequest('.nevo/assets/doc.pdf')
    await flushPane()

    expect(openPath).toHaveBeenCalledWith('/workspace/.nevo/assets/doc.pdf')
  })

  it('keeps the embed URL popover open through the slash menu opening click', async () => {
    const wrapper = mountPane()
    await flushPane()

    editorCoreMocks.callbacks?.onEmbedUrlRequest(1, {
      top: 10,
      bottom: 20,
      left: 30,
      right: 40,
      width: 10,
      height: 10,
    } as DOMRect)
    await flushPane()

    const overlay = wrapper.findComponent({ name: 'EditorOverlayContainer' })
    expect(overlay.props('embedUrlPopover')).toMatchObject({ open: true, nodePos: 1 })

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPane()

    expect(overlay.props('embedUrlPopover')).toMatchObject({ open: true, nodePos: 1 })
  })

  it('keeps the embed URL popover open when the same note content syncs back', async () => {
    const wrapper = mountPane()
    await flushPane()

    const syncedContent: NoteDocument['content'] = {
      type: 'doc',
      content: [
        {
          type: 'embed_block',
          attrs: {
            url: '',
            embedType: '',
            embedHtml: '',
            title: '',
            thumbnailUrl: '',
          },
        },
      ],
    }
    const core = editorCoreMocks.getLatestCore()
    expect(core).toBeTruthy()
    if (!core) return
    core.editorView = { dom: document.createElement('div') }
    core.lastLoadedNoteId = 'note-1'
    core.lastSerializedContent = JSON.stringify(syncedContent)
    core.lastSerializedContentRef = null

    editorCoreMocks.callbacks?.onEmbedUrlRequest(1, {
      top: 10,
      bottom: 20,
      left: 30,
      right: 40,
      width: 10,
      height: 10,
    } as DOMRect)
    await flushPane()

    await wrapper.setProps({
      note: {
        ...createNote(),
        content: JSON.parse(JSON.stringify(syncedContent)),
      },
    })
    await flushPane()

    const overlay = wrapper.findComponent({ name: 'EditorOverlayContainer' })
    expect(overlay.props('embedUrlPopover')).toMatchObject({ open: true, nodePos: 1 })
  })

  it('opens the breadcrumb overflow menu when the trigger is clicked', async () => {
    const wrapper = mountPane()

    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    await openOverflowMenu(wrapper)

    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
    expect(getMenuButton('Export note')).toBeTruthy()
    expect(getMenuButton('Graph')).toBeTruthy()
  })

  it('opens an export format submenu from the overflow menu', async () => {
    const wrapper = mountPane()

    await openOverflowMenu(wrapper)
    await activateMenuButton('Export note')

    expect(getMenuButton('Markdown (.md)')).toBeTruthy()
    expect(getMenuButton('HTML (.html)')).toBeTruthy()
    expect(getMenuButton('Typst archive (.zip)')).toBeTruthy()
    expect(getMenuButton('PDF')).toBeTruthy()
  })

  it('emits request-export with the selected format from the overflow menu', async () => {
    const wrapper = mountPane()

    await openOverflowMenu(wrapper)
    await activateMenuButton('Export note')
    await activateMenuButton('Typst archive (.zip)')

    expect(wrapper.emitted('request-export')).toEqual([['typst']])
  })

  it('toggles the local graph panel from the overflow menu', async () => {
    const wrapper = mountPane()

    expect(wrapper.find('.local-graph-panel-stub').exists()).toBe(false)

    await openOverflowMenu(wrapper)
    getMenuButton('Graph')?.click()
    await flushPane()

    expect(wrapper.find('.local-graph-panel-stub').exists()).toBe(true)

    await openOverflowMenu(wrapper)
    getMenuButton('Graph')?.click()
    await flushPane()

    expect(wrapper.find('.local-graph-panel-stub').exists()).toBe(false)
  })

  it('applies a pending block target once and emits that it was consumed', async () => {
    vi.mocked(focusBlockSearchTarget).mockReturnValue(true)

    const wrapper = mount(WorkspaceEditorPane, {
      attachTo: document.body,
      global: {
        plugins: [i18n, createPinia()],
        stubs: paneStubs,
      },
      props: {
        note: createNote(),
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: defaultSettings,
        saveStatus: 'saved',
        containerTitle: null,
        containerKind: null,
        containerItems: [],
        pendingBlockTarget: {
          noteId: 'note-1',
          blockIndex: 0,
          query: 'Body',
          snippet: 'Body copy',
        },
      },
    })

    wrappers.push(wrapper)
    await flushPane()

    expect(focusBlockSearchTarget).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('consumed-pending-target')).toHaveLength(1)
  })

  it('omits the overlay when the document does not overflow', async () => {
    const wrapper = mountPane()
    const body = wrapper.get('.doc-body').element

    setScrollDimensions(body, 240, 240)
    await flushPane()

    expect((wrapper.get('.editor-scrollbar').element as HTMLElement).style.display).toBe('none')
  })

  it('shows the overlay on scroll and updates the thumb metrics', async () => {
    const wrapper = mountPane()
    const body = wrapper.get('.doc-body').element as HTMLElement

    setScrollDimensions(body, 200, 400)
    await flushPane()
    setTrackHeight(wrapper.get('.editor-scrollbar__track').element, 200)

    const scrollbar = wrapper.find('.editor-scrollbar')
    const scrollbarEl = scrollbar.element as HTMLElement
    expect(scrollbar.exists()).toBe(true)
    expect(scrollbar.classes()).not.toContain('editor-scrollbar--visible')
    expect(scrollbarEl.style.pointerEvents).toBe('none')

    body.scrollTop = 100
    await wrapper.get('.doc-body').trigger('scroll')
    await nextTick()

    const thumb = wrapper.get('.editor-scrollbar__thumb')
    const thumbEl = thumb.element as HTMLElement

    expect(wrapper.get('.editor-scrollbar').classes()).toContain('editor-scrollbar--visible')
    expect((wrapper.get('.editor-scrollbar').element as HTMLElement).style.pointerEvents).toBe('auto')
    expect(thumbEl.style.height).toBe('100px')
    expect(thumbEl.style.transform).toBe('translateY(50px)')
  })

  it('updates scrollTop while dragging the scrollbar thumb', async () => {
    const wrapper = mountPane()
    const body = wrapper.get('.doc-body').element as HTMLElement

    setScrollDimensions(body, 200, 400)
    await flushPane()
    setTrackHeight(wrapper.get('.editor-scrollbar__track').element, 200)

    await wrapper.get('.editor-scrollbar__thumb').trigger('mousedown', {
      button: 0,
      clientY: 20,
    })

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientY: 70,
    }))
    await nextTick()

    expect(body.scrollTop).toBe(100)

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })

  it('emits open-note when an internal editor link is clicked', async () => {
    registerExistingNote('note-2', 'Linked note')

    const wrapper = mountPane()
    await flushPane()

    const link = appendInternalLink(wrapper, 'note-2', 'heading-1')
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await nextTick()

    expect(wrapper.emitted('open-note')).toEqual([['note-2']])
  })

  it('does not emit open-note for an internal editor link when the note is missing', async () => {
    const wrapper = mountPane()
    await flushPane()

    const link = appendInternalLink(wrapper, 'missing-note')
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await nextTick()

    expect(wrapper.emitted('open-note')).toBeUndefined()
  })

  it('does not emit open-note for modified internal editor clicks', async () => {
    registerExistingNote('note-2', 'Linked note')

    const wrapper = mountPane()
    await flushPane()

    const link = appendInternalLink(wrapper, 'note-2')
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }))
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }))
    await nextTick()

    expect(wrapper.emitted('open-note')).toBeUndefined()
  })

  it('renders root overview when no active note and root has items', async () => {
    const rootFolder = createFolderMeta('folder-1', 'Projects')
    const rootNote = createNoteMeta('note-2', 'Roadmap')
    const items: TreeNode[] = [
      { kind: 'folder', meta: rootFolder },
      { kind: 'note', meta: rootNote },
    ]

    const wrapper = mount(WorkspaceEditorPane, {
      attachTo: document.body,
      global: {
        plugins: [i18n, createPinia()],
        stubs: paneStubs,
      },
      props: {
        note: null,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: defaultSettings,
        saveStatus: 'saved',
        containerTitle: 'Workspace',
        containerKind: 'root',
        containerItems: items,
        pendingBlockTarget: null,
      },
    })

    wrappers.push(wrapper)
    await flushPane()

    expect(wrapper.get('.container-overview__title').text()).toBe('Workspace')
    expect(wrapper.findAll('.container-overview__item')).toHaveLength(2)
    expect(wrapper.text()).toContain('Projects')
    expect(wrapper.text()).toContain('Roadmap')
    expect(wrapper.find('.editor-empty').exists()).toBe(false)
  })

  it('renders folder overview when folder route is active and folder has items', async () => {
    const childFolder = createFolderMeta('folder-2', 'Specs', 'folder-1')
    const childNote = createNoteMeta('note-2', 'Draft', 'folder-1')

    const wrapper = mount(WorkspaceEditorPane, {
      attachTo: document.body,
      global: {
        plugins: [i18n, createPinia()],
        stubs: paneStubs,
      },
      props: {
        note: null,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: defaultSettings,
        saveStatus: 'saved',
        containerTitle: 'Research',
        containerKind: 'folder',
        containerItems: [
          { kind: 'folder', meta: childFolder },
          { kind: 'note', meta: childNote },
        ],
        pendingBlockTarget: null,
      },
    })

    wrappers.push(wrapper)
    await flushPane()

    expect(wrapper.get('.container-overview__title').text()).toBe('Research')
    expect(wrapper.text()).toContain('Specs')
    expect(wrapper.text()).toContain('Draft')
  })

  it('renders folder empty state when folder has no direct items', async () => {
    const wrapper = mount(WorkspaceEditorPane, {
      attachTo: document.body,
      global: {
        plugins: [i18n, createPinia()],
        stubs: paneStubs,
      },
      props: {
        note: null,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: defaultSettings,
        saveStatus: 'saved',
        containerTitle: 'Archive',
        containerKind: 'folder',
        containerItems: [],
        pendingBlockTarget: null,
      },
    })

    wrappers.push(wrapper)
    await flushPane()

    expect(wrapper.get('.editor-empty').text()).toContain('Folder: Archive')
    expect(wrapper.get('.editor-empty').text()).toContain('This folder has no notes yet')
  })

  it('emits open-note when a note overview item is clicked', async () => {
    const wrapper = mount(WorkspaceEditorPane, {
      attachTo: document.body,
      global: {
        plugins: [i18n, createPinia()],
        stubs: paneStubs,
      },
      props: {
        note: null,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: defaultSettings,
        saveStatus: 'saved',
        containerTitle: 'Workspace',
        containerKind: 'root',
        containerItems: [{ kind: 'note', meta: createNoteMeta('note-9', 'Inbox') }],
        pendingBlockTarget: null,
      },
    })

    wrappers.push(wrapper)
    await flushPane()

    await wrapper.get('.container-overview__item--note').trigger('click')

    expect(wrapper.emitted('open-note')).toEqual([['note-9']])
  })

  it('emits open-folder when a folder overview item is clicked', async () => {
    const wrapper = mount(WorkspaceEditorPane, {
      attachTo: document.body,
      global: {
        plugins: [i18n, createPinia()],
        stubs: paneStubs,
      },
      props: {
        note: null,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: defaultSettings,
        saveStatus: 'saved',
        containerTitle: 'Workspace',
        containerKind: 'root',
        containerItems: [{ kind: 'folder', meta: createFolderMeta('folder-9', 'Docs') }],
        pendingBlockTarget: null,
      },
    })

    wrappers.push(wrapper)
    await flushPane()

    await wrapper.get('.container-overview__item--folder').trigger('click')

    expect(wrapper.emitted('open-folder')).toEqual([['folder-9']])
  })

  it('applies image size changes from the context menu', async () => {
    mountPane()
    const { view, tr } = createFakeImageView()

    await openImageMenu(view)
    await activateMenuButton('Width')
    await activateMenuButton('Small')

    expect(tr.setNodeAttribute).toHaveBeenCalledWith(7, 'sizePreset', 'small')
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalled()
  })

  it('applies image alignment changes from the context menu', async () => {
    mountPane()
    const { view, tr } = createFakeImageView()

    await openImageMenu(view, { top: 80, left: 120 })
    await activateMenuButton('Right')

    expect(tr.setNodeAttribute).toHaveBeenCalledWith(7, 'align', 'right')
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalled()
  })

  it('deletes image blocks from the context menu and closes the menu', async () => {
    mountPane()
    const { view, tr } = createFakeImageView()

    await openImageMenu(view)
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()

    await activateMenuButton('Delete')

    expect(tr.delete).toHaveBeenCalledWith(7, 8)
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalled()
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('keeps the create-note CTA in the empty folder state', async () => {
    const wrapper = mount(WorkspaceEditorPane, {
      attachTo: document.body,
      global: {
        plugins: [i18n, createPinia()],
        stubs: paneStubs,
      },
      props: {
        note: null,
        workspacePath: '/workspace',
        pluginManifests: [],
        settings: defaultSettings,
        saveStatus: 'saved',
        containerTitle: 'Empty',
        containerKind: 'folder',
        containerItems: [],
        pendingBlockTarget: null,
      },
    })

    wrappers.push(wrapper)
    await flushPane()

    await wrapper.get('.editor-empty .nv-btn--primary').trigger('click')

    expect(wrapper.emitted('create-note')).toHaveLength(1)
  })
})
