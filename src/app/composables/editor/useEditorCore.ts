import { EditorView } from 'prosemirror-view'
import { AllSelection, NodeSelection, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'
import { Slice, type Node } from 'prosemirror-model'
import { cellAround, CellSelection } from 'prosemirror-tables'
import type { NevoCoreCommands } from '../../../editor-core/commands'
import type { PluginManifest, WorkspaceSettings } from '../../../types/workspace'
import type {
  NevoEditorPluginManifest,
  NevoSlashItem,
  NevoSlashMenuState,
  NevoToolbarAction,
} from '../../../types/editor-plugin'
import type { NoteDocument } from '../../../types/note'
import {
  EditorPluginHost,
  createNevoEditorState,
  createSchemaWithPluginExtensions,
  executeSlashItem,
  getSlashMenuState,
  getLinkPickerState,
  nevoSlashPluginKey,
  brokenLinkPluginKey,
  parseNoteContentToDoc,
  parseNoteContentToDocSafe,
  serializeDocToNoteContent,
  setActivePluginSerialization,
} from '../../../editor-core'
import { registerEditorPersistence } from '../../../core/document-session/editorSessionRegistry'
import type { VoiceRecordingEditorBindings } from './useVoiceRecording'
import { useToast } from '../../../ui/composables/useToast'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useOnboardingStore } from '../../../stores/onboarding'
import { createPasteHandler } from './usePasteHandling'
import { buildPluginRuntime } from './pluginRuntime'
import { appLogger } from '../../../utils/logger'
import { runGuardedCommand } from './prosemirrorErrors'
import { i18n } from '../../../i18n'
import { getSlashSearchTerms } from './slashSearchTerms'
import { useAiCompletion } from '../../../composables/useAiCompletion'
import { buildAiSlashItems } from './aiSlashItems'
import { createDatabaseRepository } from '../../../features/database/databaseRepository'
import { createDatabaseCleanup, collectRemovedAssetSrcs } from './documentCleanup'
import { createIdleTaskScheduler } from './idleTaskScheduler'
import { resolveBlockRef } from '../../../core/blockRef/resolveBlockRef'
import { slashGridColumns } from '../../../utils/slashMenuLayout'
import {
  clearActiveEditor,
  notifyActiveEditorTransaction,
  registerActiveEditor,
} from './activeEditorRegistry'

function resolveEditorLanguage(): string {
  return document.documentElement.lang || 'ru'
}

/** Surfaces a degraded `note.content` parse to the user (a lasting —
 *  `duration: 0` — toast) and to the log. Not damaged — the note's own
 *  content just holds a node type this schema can't parse. Never persist
 *  over it: contentPersistenceDisabled (set by the caller) blocks the
 *  plain-text stand-in shown on screen from ever being saved back over the
 *  original. */
function reportDegradedContentNotice(noteId: string, workspacePath: string | null): void {
  void appLogger.warn({
    source: 'frontend.editor',
    event: 'note_content_degraded',
    message: 'note.content uses a node type this schema cannot parse; opening as plain text without persistence',
    workspacePath: workspacePath ?? undefined,
    payload: { noteId },
  })
  useToast().showToast({
    variant: 'error',
    duration: 0,
    title: i18n.global.t('editor.yjsRecovery.degradedTitle'),
    message: i18n.global.t('editor.yjsRecovery.degradedMessage'),
  })
}

export interface EditorCore {
  editorView: EditorView | null
  pluginHost: EditorPluginHost | null
  schema: ReturnType<typeof createSchemaWithPluginExtensions>
  commandRegistry: Map<string, Command>
  coreCommands: NevoCoreCommands | null
  slashItems: NevoSlashItem[]
  toolbarPluginActions: NevoToolbarAction[]
  pendingImageTargetPos: number | null
  pendingFileTargetPos: number | null
  pendingMediaTargetPos: number | null
  pendingMediaKind: 'audio' | 'video' | null
  lastSlashPluginState: NevoSlashMenuState
  isApplyingExternalState: boolean
  /** True while the currently loaded note's content had to be parsed in
   *  degraded (plain-text fallback) form — see `parseNoteContentToDocSafe`.
   *  Blocks `flushPendingContentUpdate` from writing back over the note's
   *  real (unparseable-by-this-build) content. */
  contentPersistenceDisabled: boolean
  lastSerializedContent: string
  lastSerializedContentRef: NoteDocument['content'] | null
  /** Defers serializing the editor doc: lastSerializedContent is computed on first
   *  read instead of eagerly on every note open. */
  setLastSerializedFromDoc: (doc: Node) => void
  lastLoadedNoteId: string | null
  workspacePath: string | null
  systemPlugins: {
    templates: boolean
    vega: boolean
    markmap: boolean
  }
  /** Force broken-link decorations to be recomputed against the latest note
   *  existence state. No-op when the editor view is not ready. */
  refreshBrokenLinks: () => void
}

export interface EditorCoreCallbacks {
  onOverlaysUpdate: () => void
  onCloseOverlays: () => void
  onContentUpdate: (content: NoteDocument['content']) => void
  onDocDirty?: () => void
  onDocChanged?: (doc: Node) => void
  onInternalLinkOpen: (noteId: string, anchor: string | null) => void
  /** Existence check used to mark `internal_link` marks pointing at missing
   *  notes as broken. When omitted, no broken-link decoration is applied. */
  internalLinkExists?: (noteId: string) => boolean
  /** Resolves a wiki-link title to a note id for Markdown paste/import.
   *  When omitted, pasted `[[Title]]` links become broken links. */
  resolveWikiLink?: (title: string) => string | null
  onLinkPickerEnter?: () => boolean
  onContextMenuRequest?: (view: EditorView, event: MouseEvent) => boolean
  onImagePickerRequest: (pos: number) => void
  /** Synchronously inspect a paste event for image files. Returns true when at
   *  least one image was found (and import was kicked off asynchronously), so
   *  handlePaste can block the default text/markdown insertion. */
  onImagePaste?: (event: ClipboardEvent) => boolean
  resolveAssetSrc?: (relativeSrc: string) => string
  resolveMediaSrc?: (relativeSrc: string) => string | null
  onImageContextMenuRequest: (ctx: {
    position: number
    attrs: Record<string, unknown>
    anchorRect: DOMRect
    anchorPoint?: { top: number; left: number }
    focusCaption: () => void
    view: EditorView
  }) => void
  onFilePickerRequest: (pos: number) => void
  onFileOpenRequest: (src: string) => void
  onMediaPickerRequest: (pos: number, kind: 'audio' | 'video') => void
  onNoteEmbedPickRequest: (pos: number, anchorRect: DOMRect) => void
  onEmbedUrlRequest: (pos: number, anchorRect: DOMRect) => void
  onNoteEmbedContentLoad?: (ctx: { noteId: string; setHtml: (html: string) => void; setLoading: (v: boolean) => void }) => void
  onNoteEmbedOpen: (noteId: string) => void
  onOpenBlockRefSource?: (noteId: string) => void
  /** Best-effort live re-resolve signal for `block_embed` — see
   *  `node-views/utils.ts` `CoreNodeViewOptions.onSubscribeNoteSaved`. Omitted
   *  by hosts that have no natural "note X was just saved" signal to offer
   *  (e.g. `EditorSurface.vue`); the node view still resolves once on mount. */
  onSubscribeNoteSaved?: (noteId: string, callback: () => void) => () => void
  onMathEditRequest: (pos: number, rect?: DOMRect) => void
  onFormulaEditRequest: (cellPos: number, formula: string, rect?: DOMRect) => void
  onMathInlineInsert: () => boolean
  onMathBlockInsert: () => boolean
  onSlashMathItemRan: () => void
  onSlashEmojiPickRequest: () => void
  onMermaidEditRequest: (pos: number, rect?: DOMRect) => void
  onQueryEditRequest: (pos: number, rect?: DOMRect) => void
  onMarkmapEditRequest: (pos: number, rect?: DOMRect) => void
  onVegaEditRequest: (pos: number, rect?: DOMRect) => void
  /** Open the full-canvas draw editor for a draw_block (drawId). */
  onDrawOpen?: (drawId: string) => void
  onPluginNodeEditRequest: (pos: number, nodeName: string, rect?: DOMRect) => void
  onCalloutIconPickRequest: (pos: number, rect: DOMRect, icon: string) => void
  onTemplateInsertRequest?: () => void
  /** Bindings for the `voice-recording` slash item; omitted by hosts/platforms
   *  where `isVoiceRecordingSupported()` is false (see Step 2 in the hosts). */
  voiceRecording?: VoiceRecordingEditorBindings
  onAfterTransaction?: (view: EditorView) => void
  onAssetSrcsRemoved?: (srcs: string[]) => void
  onAiAskRequest?: (onSubmit: (instruction: string) => void) => void
}

export function createEditorCore(): EditorCore {
  // lastSerializedContent is derived lazily from the editor doc. Serializing a
  // large document on every note open is wasted work because the reference check
  // (lastSerializedContentRef) already short-circuits the common case; the string
  // is only needed for the rare structural-equality fallback comparison.
  let serializedCache: string | null = ''
  let serializedDoc: Node | null = null
  const core: EditorCore = {
    editorView: null,
    pluginHost: null,
    schema: createSchemaWithPluginExtensions(),
    commandRegistry: new Map(),
    coreCommands: null,
    slashItems: [],
    toolbarPluginActions: [],
    pendingImageTargetPos: null,
    pendingFileTargetPos: null,
    pendingMediaTargetPos: null,
    pendingMediaKind: null,
    lastSlashPluginState: { open: false, query: '', range: null, activeIndex: 0, itemIds: [] },
    isApplyingExternalState: false,
    contentPersistenceDisabled: false,
    get lastSerializedContent() {
      if (serializedCache === null) {
        serializedCache = serializedDoc ? JSON.stringify(serializeDocToNoteContent(serializedDoc)) : ''
      }
      return serializedCache
    },
    set lastSerializedContent(value: string) {
      serializedCache = value
      serializedDoc = null
    },
    setLastSerializedFromDoc(doc: Node) {
      serializedDoc = doc
      serializedCache = null
    },
    lastSerializedContentRef: null,
    lastLoadedNoteId: null,
    workspacePath: null,
    systemPlugins: {
      templates: false,
      vega: false,
      markmap: false,
    },
    refreshBrokenLinks() {
      const view = core.editorView
      if (!view) return
      view.dispatch(view.state.tr.setMeta(brokenLinkPluginKey, true))
    },
  }
  return core
}

function toEditorPluginManifest(manifest: PluginManifest): NevoEditorPluginManifest {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    enabled: manifest.enabled,
    entryPoint: manifest.entryPoint,
    apiVersion: manifest.apiVersion,
    executionMode: manifest.executionMode ?? 'trusted-webview',
    dataVersion: manifest.dataVersion,
    kind: manifest.kind,
    source: manifest.source,
    capabilities: manifest.capabilities,
    editorCapabilities: manifest.editorCapabilities,
    uiCapabilities: manifest.uiCapabilities ?? [],
    workspaceCapabilities: manifest.workspaceCapabilities ?? [],
    network: manifest.network,
    nevoVersionRange: manifest.nevoVersionRange,
    priority: manifest.priority,
  }
}

function sortToolbarActions(actions: NevoToolbarAction[]): NevoToolbarAction[] {
  return actions.slice().sort((a, b) => {
    const byOrder = (a.order ?? 0) - (b.order ?? 0)
    if (byOrder !== 0) return byOrder
    return a.title.localeCompare(b.title)
  })
}

function applyCaretAnimation(dom: HTMLElement, mode: string): void {
  dom.classList.remove('caret--steady', 'caret--blink')
  if (mode === 'steady') dom.classList.add('caret--steady')
  else if (mode === 'blink') dom.classList.add('caret--blink')
}

const CONTENT_SERIALIZE_DELAY_MS = 250

function shouldRefreshOverlays(prevState: EditorState, nextState: EditorState, transaction: Transaction): boolean {
  if (transaction.selectionSet) return true

  const prevSlash = getSlashMenuState(prevState)
  const nextSlash = getSlashMenuState(nextState)
  if (
    prevSlash.open !== nextSlash.open
    || prevSlash.query !== nextSlash.query
    || prevSlash.activeIndex !== nextSlash.activeIndex
    || prevSlash.range?.from !== nextSlash.range?.from
    || prevSlash.range?.to !== nextSlash.range?.to
  ) return true

  const prevLinkPicker = getLinkPickerState(prevState)
  const nextLinkPicker = getLinkPickerState(nextState)
  if (
    prevLinkPicker.open !== nextLinkPicker.open
    || prevLinkPicker.query !== nextLinkPicker.query
    || prevLinkPicker.activeIndex !== nextLinkPicker.activeIndex
    || prevLinkPicker.range?.from !== nextLinkPicker.range?.from
    || prevLinkPicker.range?.to !== nextLinkPicker.range?.to
  ) return true

  return false
}

export function useEditorCore(core: EditorCore, callbacks: EditorCoreCallbacks) {
  // Captured synchronously (Pinia active during component setup) for use in
  // the async note-setup path.
  const workspaceStore = useWorkspaceStore()
  const onboardingStore = useOnboardingStore()
  const ai = useAiCompletion()

  let pendingContentDoc: Node | null = null
  // v2 database blocks removed from the doc are queued here for a deferred
  // delete (run on disk save), cancelled whenever the id reappears in the live
  // doc — so undo or a cut/paste that restores the block never wipes its records.
  const databaseCleanup = createDatabaseCleanup()

  function flushDatabaseCleanup() {
    databaseCleanup.flush(core.editorView ? core.editorView.state.doc : null, core.workspacePath)
  }

  // Lets code outside the editor (e.g. a snapshot restore in the note store)
  // suspend this note's disk persistence without importing editor internals —
  // see src/core/document-session/editorSessionRegistry.ts.
  let unregisterEditorPersistence: (() => void) | null = null
  const unregisterPersistenceSession = () => {
    unregisterEditorPersistence?.()
    unregisterEditorPersistence = null
  }

  function flushPendingContentUpdate(): NoteDocument['content'] | null {
    contentUpdateTask.cancel()
    if (!pendingContentDoc) return null

    const content = serializeDocToNoteContent(pendingContentDoc)
    pendingContentDoc = null
    const serialized = JSON.stringify(content)
    core.lastSerializedContent = serialized
    core.lastSerializedContentRef = content
    // Never write back over a note whose content had to be parsed in
    // degraded (plain-text fallback) form — see contentPersistenceDisabled.
    if (!core.contentPersistenceDisabled) {
      callbacks.onContentUpdate(content)
    }
    return content
  }

  const contentUpdateTask = createIdleTaskScheduler(
    () => flushPendingContentUpdate(),
    {
      delayMs: CONTENT_SERIALIZE_DELAY_MS,
      idleTimeoutMs: 1_000,
    },
  )

  function scheduleContentUpdate(doc: Node) {
    pendingContentDoc = doc
    callbacks.onDocDirty?.()
    callbacks.onDocChanged?.(doc)
    contentUpdateTask.schedule()
  }

  function getSlashItemById(id: string): NevoSlashItem | null {
    return core.slashItems.find((item) => item.id === id) ?? null
  }

  function getSlashItemFromState(slashState: NevoSlashMenuState): NevoSlashItem | null {
    if (!slashState.open || slashState.itemIds.length === 0) return null
    const index = Math.max(0, Math.min(slashState.activeIndex, slashState.itemIds.length - 1))
    const activeItemId = slashState.itemIds[index]
    if (!activeItemId) return null
    return getSlashItemById(activeItemId)
  }

  function isMarkActive(markName: string): boolean {
    if (!core.editorView) return false
    const markType = core.editorView.state.schema.marks[markName]
    if (!markType) return false
    const { selection, storedMarks } = core.editorView.state
    if (selection.empty) {
      const activeMarks = storedMarks ?? selection.$from.marks()
      return markType.isInSet(activeMarks) !== null
    }
    return core.editorView.state.doc.rangeHasMark(selection.from, selection.to, markType)
  }

  function executeStateCommand(command: Command): boolean {
    const view = core.editorView
    if (!view) return false
    let applied = false
    runGuardedCommand(() => {
      applied = command(view.state, view.dispatch.bind(view))
    }, {
      event: 'command_transform_error',
      message: 'Editor command failed during document transform',
      workspacePath: core.workspacePath,
    })
    if (applied) {
      view.focus()
      callbacks.onOverlaysUpdate()
    }
    return applied
  }

  function executeCommandById(commandId: string): boolean {
    if (commandId === 'core.math.inline.insert') return callbacks.onMathInlineInsert()
    if (commandId === 'core.math.block.insert') return callbacks.onMathBlockInsert()
    const command = core.commandRegistry.get(commandId)
    if (!command) return false
    return executeStateCommand(command)
  }

  function getSelectedEmbedBlock(): { pos: number; node: Node } | null {
    const view = core.editorView
    if (!view) return null
    const embedBlock = view.state.schema.nodes.embed_block
    if (!embedBlock) return null
    const { selection } = view.state
    if (selection instanceof NodeSelection && selection.node.type === embedBlock) {
      return { pos: selection.from, node: selection.node }
    }
    return null
  }

  function getAnchorRectForNode(view: EditorView, pos: number): DOMRect {
    const nodeDom = view.nodeDOM(pos)
    if (nodeDom instanceof HTMLElement) return nodeDom.getBoundingClientRect()
    const coords = view.coordsAtPos(pos)
    return new DOMRect(coords.left, coords.top, coords.right - coords.left, coords.bottom - coords.top)
  }

  function requestEmbedUrlForSelectedBlock(): boolean {
    const view = core.editorView
    if (!view) return false
    const target = getSelectedEmbedBlock()
    if (!target) return false
    callbacks.onEmbedUrlRequest(target.pos, getAnchorRectForNode(view, target.pos))
    return true
  }

  function runPluginToolbarAction(action: NevoToolbarAction) {
    const view = core.editorView
    if (!view) return
    const ok = runGuardedCommand(() => {
      action.run({
        view,
        state: view.state,
        dispatch: view.dispatch.bind(view),
      })
    }, {
      event: 'plugin_toolbar_transform_error',
      message: 'Plugin toolbar action failed during document transform',
      workspacePath: core.workspacePath,
      payload: { actionId: action.id },
    })
    if (!ok) return
    view.focus()
    callbacks.onOverlaysUpdate()
  }

  function runSlashItemFromOverlay(item: NevoSlashItem, _slashState: NevoSlashMenuState = core.lastSlashPluginState): boolean {
    const view = core.editorView
    if (!view) return false
    const currentSlashState = getSlashMenuState(view.state)
    if (!currentSlashState.open || !currentSlashState.range) return false
    if (!currentSlashState.itemIds.includes(item.id)) return false

    if (item.id === 'emoji') {
      callbacks.onSlashEmojiPickRequest()
      return true
    }

    let applied = false
    runGuardedCommand(() => {
      applied = executeSlashItem(view, item, currentSlashState)
    }, {
      event: 'slash_transform_error',
      message: 'Slash command failed during document transform',
      workspacePath: core.workspacePath,
      payload: { itemId: item.id },
    })
    if (!applied) return false
    void onboardingStore.markFirstStep('insertBlock')
    if (item.id === 'math-inline' || item.id === 'math') {
      callbacks.onSlashMathItemRan()
    }
    if (item.id === 'embed') {
      requestEmbedUrlForSelectedBlock()
    }
    view.focus()
    callbacks.onOverlaysUpdate()
    return true
  }

  function insertEmojiFromSlashPicker(emoji: string): boolean {
    if (!core.editorView || !emoji) return false

    const slashState = getSlashMenuState(core.editorView.state)
    const range = slashState.range ?? core.lastSlashPluginState.range
    if (!range) return false

    const tr = core.editorView.state.tr
      .insertText(emoji, range.from, range.to)
      .setMeta(nevoSlashPluginKey, { type: 'close' })
      .scrollIntoView()

    core.editorView.dispatch(tr)
    core.editorView.focus()
    callbacks.onOverlaysUpdate()
    return true
  }

  async function initPluginHost(workspacePath: string | null, pluginManifests: PluginManifest[]) {
    core.workspacePath = workspacePath
    core.systemPlugins = {
      templates: pluginManifests.find(plugin => plugin.id === 'nevo.templates')?.enabled === true,
      vega: pluginManifests.find(plugin => plugin.id === 'nevo.vega')?.enabled === true,
      markmap: pluginManifests.find(plugin => plugin.id === 'nevo.markmap')?.enabled === true,
    }
    const previousPluginHost = core.pluginHost
    core.pluginHost = null
    if (previousPluginHost) {
      await previousPluginHost.deactivateAll()
      await previousPluginHost.dispose()
    }
    core.toolbarPluginActions = []
    setActivePluginSerialization(null)

    const pluginPath = workspacePath

    if (!pluginPath) {
      core.schema = createSchemaWithPluginExtensions()
      return
    }

    const manifests = pluginManifests.map(toEditorPluginManifest)
    const host = new EditorPluginHost({
      workspacePath: pluginPath,
      manifests,
      nevoVersion: '1.0.0',
      runtime: buildPluginRuntime(pluginPath, workspaceStore),
    })
    host.setNodeEditRequestHandler((_view, position, nodeName, anchorRect) =>
      callbacks.onPluginNodeEditRequest(position, nodeName, anchorRect),
    )
    await host.initialize()
    core.pluginHost = host
    core.schema = createSchemaWithPluginExtensions(host)
    core.toolbarPluginActions = sortToolbarActions(Array.from(host.registries.toolbarActions.values()))
    setActivePluginSerialization(host.registries)

    if (host.errors.length > 0) {
      await appLogger.warn({
        source: 'frontend.plugin-host',
        event: 'initialize',
        message: 'Plugin host reported initialization errors',
        workspacePath,
        payload: { errors: host.errors },
      })
    }
  }

  function destroyEditorView() {
    callbacks.voiceRecording?.onEditorDestroy()
    flushPendingContentUpdate()
    unregisterPersistenceSession()
    if (core.editorView) clearActiveEditor(core.editorView)
    core.editorView?.destroy()
    core.editorView = null
    core.commandRegistry = new Map()
    core.coreCommands = null
    core.slashItems = []
    core.pendingImageTargetPos = null
    core.pendingFileTargetPos = null
    core.pendingMediaTargetPos = null
    core.pendingMediaKind = null
    callbacks.onCloseOverlays()
    core.lastSerializedContent = ''
    core.lastSerializedContentRef = null
    core.lastLoadedNoteId = null
  }

  function handleSelectAll(view: EditorView, event: KeyboardEvent): boolean {
    const { state } = view
    const { selection } = state

    if (selection instanceof NodeSelection || selection.$from.depth < 1) {
      event.preventDefault()
      view.dispatch(state.tr.setSelection(new AllSelection(state.doc)))
      return true
    }

    const { $from } = selection
    let depth = 1
    for (let d = $from.depth; d >= 1; d--) {
      if ($from.node(d).type === state.schema.nodes.list_item) {
        depth = d
        break
      }
    }

    const blockStart = $from.start(depth)
    const blockEnd = $from.end(depth)

    event.preventDefault()
    if (selection.from <= blockStart && selection.to >= blockEnd) {
      view.dispatch(state.tr.setSelection(new AllSelection(state.doc)))
    } else {
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, blockStart, blockEnd)))
    }
    return true
  }

  function handleInternalLinkClick(view: EditorView, event: MouseEvent): boolean {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
    const target = event.target
    if (!(target instanceof Element)) return false

    const linkEl = target.closest('a[data-note-id]')
    if (!linkEl || !view.dom.contains(linkEl)) return false

    const noteId = linkEl.getAttribute('data-note-id')?.trim() ?? ''
    if (!noteId) return false

    event.preventDefault()
    callbacks.onInternalLinkOpen(noteId, linkEl.getAttribute('data-anchor') || null)
    return true
  }

  /**
   * Right-click inside a table cell: suppress the browser context menu and
   * place a single-cell CellSelection on the clicked cell. The table
   * formatting menu (driven by getTableMenuContext) only renders for a
   * CellSelection, so this is what makes the popup appear on right-click.
   */
  function handleTableContextMenu(view: EditorView, event: MouseEvent): boolean {
    const coords = { left: event.clientX, top: event.clientY }
    const posAtCoords = view.posAtCoords(coords)
    if (!posAtCoords) return false

    const $cell = cellAround(view.state.doc.resolve(posAtCoords.pos))
    if (!$cell) return false

    event.preventDefault()
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, $cell.pos)))
    return true
  }

  async function setupEditorForContent(
    content: NoteDocument['content'],
    documentId: string,
    editorRoot: HTMLDivElement,
    settings: WorkspaceSettings,
    options: {
      enableTemplates?: boolean
      /** Already-parsed doc for `content` (see `setupEditorForNote`), so the
       *  note-open path does not parse `note.content` a second time. */
      preParsedDoc?: ReturnType<typeof parseNoteContentToDocSafe>['doc']
    } = {},
  ) {
    // The backend owns the row store (SQLite locally).
    const databaseRepository = workspaceStore.backend?.databaseRepository()
      ?? createDatabaseRepository(core.workspacePath)
    databaseCleanup.setRepository(databaseRepository)
    const aiSlashItems = (settings.ai.enabled && settings.ai.slashCommands && settings.editor.slashCommands)
      ? buildAiSlashItems({
          ai,
          t: i18n.global.t,
          onError: (msg) => {
            void appLogger.error({
              source: 'frontend.editor',
              event: 'ai_slash_error',
              message: msg,
              workspacePath: core.workspacePath,
            })
          },
          requestAiAsk: (submit) => callbacks.onAiAskRequest?.(submit),
        })
      : []

    const setup = createNevoEditorState({
      schema: core.schema,
      content,
      enableSlashCommands: settings.editor.slashCommands,
      // Read live from the store so switching list/tiles needs no editor rebuild.
      getSlashGridColumns: () => slashGridColumns(workspaceStore.settings?.editor?.slashMenuLayout),
      getSlashSearchTerms,
      enableMarkdownShortcuts: settings.editor.markdownShortcuts,
      tabBehavior: settings.editor.tabKeyBehavior,
      onTemplateInsertRequest: options.enableTemplates !== false && core.systemPlugins.templates
        ? callbacks.onTemplateInsertRequest
        : undefined,
      onVoiceRecordingRequest: callbacks.voiceRecording?.request,
      voiceRecordingPlaceholder: callbacks.voiceRecording
        ? { ...callbacks.voiceRecording.placeholder, t: (key: string) => i18n.global.t(key) }
        : undefined,
      enableVega: core.systemPlugins.vega,
      enableMarkmap: core.systemPlugins.markmap,
      enableDraw: settings.features?.draw !== false,
      pluginHost: core.pluginHost ?? undefined,
      preParsedDoc: options.preParsedDoc,
      nodeViewOptions: {
        databaseRepository,
        onRequestCalloutIconPick: ({ position, node, anchorRect }) => {
          callbacks.onCalloutIconPickRequest(position, anchorRect, typeof node.attrs.icon === 'string' ? node.attrs.icon : '💡')
        },
        resolveAssetSrc: callbacks.resolveAssetSrc,
        resolveMediaSrc: callbacks.resolveMediaSrc,
        onRequestImageAsset: ({ position }) => callbacks.onImagePickerRequest(position),
        onRequestImageContextMenu: (ctx) => callbacks.onImageContextMenuRequest(ctx),
        onRequestFileAsset: ({ position }) => callbacks.onFilePickerRequest(position),
        onOpenFileAsset: ({ src }) => callbacks.onFileOpenRequest(src),
        onRequestMathEdit: ({ position, anchorRect }) => callbacks.onMathEditRequest(position, anchorRect),
        onRequestFormulaEdit: ({ cellPos, formula, anchorRect }) => callbacks.onFormulaEditRequest(cellPos, formula, anchorRect),
        onRequestMermaidEdit: ({ position, anchorRect }) => callbacks.onMermaidEditRequest(position, anchorRect),
        onRequestQueryEdit: ({ position, anchorRect }) => callbacks.onQueryEditRequest(position, anchorRect),
        onQueryNotes: workspaceStore.backend ? (request) => workspaceStore.backend!.queryNotes(request) : undefined,
        onRequestMarkmapEdit: ({ position, anchorRect }) => callbacks.onMarkmapEditRequest(position, anchorRect),
        onRequestVegaEdit: ({ position, anchorRect }) => callbacks.onVegaEditRequest(position, anchorRect),
        onRequestDrawOpen: ({ node }) => callbacks.onDrawOpen?.(node.attrs.drawId),
        onRequestMediaAsset: ({ position, kind }) => callbacks.onMediaPickerRequest(position, kind),
        onRequestNoteEmbedPick: ({ position, anchorRect }) => callbacks.onNoteEmbedPickRequest(position, anchorRect),
        onRequestEmbedUrl: ({ position, anchorRect }) => callbacks.onEmbedUrlRequest(position, anchorRect),
        onNoteEmbedContentLoad: (ctx) => callbacks.onNoteEmbedContentLoad?.(ctx),
        onNoteEmbedOpen: (noteId) => callbacks.onNoteEmbedOpen(noteId),
        onResolveBlockRef: (target) => {
          const backend = workspaceStore.backend
          if (!backend) return Promise.resolve({ status: 'note-missing' } as const)
          return resolveBlockRef(backend, target)
        },
        onOpenBlockRefSource: (noteId) => callbacks.onOpenBlockRefSource?.(noteId),
        onSubscribeNoteSaved: callbacks.onSubscribeNoteSaved,
        t: (key: string) => i18n.global.t(key),
      },
      aiSlashItems,
      internalLinkExists: callbacks.internalLinkExists,
    })

    core.commandRegistry = setup.commands
    core.coreCommands = setup.coreCommands
    core.slashItems = setup.slashItems
    core.setLastSerializedFromDoc(setup.state.doc)
    core.lastSerializedContentRef = content
    core.lastLoadedNoteId = documentId

    if (!core.editorView) {
      core.editorView = new EditorView(editorRoot, {
        state: setup.state,
        nodeViews: setup.nodeViews,
        dispatchTransaction(transaction) {
          const view: EditorView = core.editorView ?? (this as unknown as EditorView)
          if (!view || view.isDestroyed) return
          const prevState = view.state
          let nextState: EditorState
          try {
            nextState = prevState.apply(transaction)
          } catch (error) {
            void appLogger.warn({
              source: 'frontend.editor',
              event: 'transaction_apply_error',
              message: 'Editor transaction failed to apply',
              workspacePath: core.workspacePath,
              error,
            })
            return
          }
          try {
            view.updateState(nextState)
          } catch (error) {
            void appLogger.warn({
              source: 'frontend.editor',
              event: 'editor_update_state_error',
              message: 'Editor state update failed',
              workspacePath: core.workspacePath,
              error,
            })
            return
          }
          core.pluginHost?.notifyTransactionApplied(nextState, transaction)
          notifyActiveEditorTransaction()
          if (shouldRefreshOverlays(prevState, nextState, transaction)) {
            callbacks.onOverlaysUpdate()
          }
          if (transaction.docChanged && !core.isApplyingExternalState) {
            if (callbacks.onAssetSrcsRemoved) {
              const removed = collectRemovedAssetSrcs(prevState.doc, transaction)
              if (removed.length > 0) callbacks.onAssetSrcsRemoved(removed)
            }
            databaseCleanup.recordRemoved(prevState.doc, transaction, nextState.doc)
            scheduleContentUpdate(nextState.doc)
          }
          // Metadata-only transactions (no doc change, no selection change) do
          // not affect document stats or typewriter scrolling. Skipping the
          // hook also avoids forced cursor geometry on every pointermove in
          // very large notes.
          if (transaction.docChanged || transaction.selectionSet) {
            callbacks.onAfterTransaction?.(view)
          }
        },
        handleKeyDown(_view, event) {
          const slashState = getSlashMenuState(_view.state)
          if (slashState.open && event.key === 'Enter') {
            const activeItem = getSlashItemFromState(slashState)
            if (activeItem) {
              event.preventDefault()
              return runSlashItemFromOverlay(activeItem, slashState)
            }
          }
          const linkPickerState = getLinkPickerState(_view.state)
          if (linkPickerState.open && event.key === 'Enter') {
            const handled = callbacks.onLinkPickerEnter?.()
            if (handled) {
              event.preventDefault()
              return true
            }
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'm') {
            event.preventDefault()
            return callbacks.onMathInlineInsert()
          }
          if ((event.ctrlKey || event.metaKey) && event.code === 'KeyA') {
            return handleSelectAll(_view, event)
          }
          return false
        },
        attributes: {
          class: 'nv-prosemirror',
          spellcheck: settings.editor.spellCheck ? 'true' : 'false',
          lang: resolveEditorLanguage(),
        },
        handleDOMEvents: {
          click(view, event) {
            return handleInternalLinkClick(view, event)
          },
          contextmenu(view, event) {
            console.log('contextmenu event fired in ProseMirror!', { shiftKey: event.shiftKey, defaultPrevented: event.defaultPrevented, callbacksHasContextMenuRequest: !!callbacks.onContextMenuRequest })
            if (event.shiftKey) return false
            if (event.defaultPrevented) return false
            
            handleTableContextMenu(view, event)
            
            if (callbacks.onContextMenuRequest) {
               console.log('Calling callbacks.onContextMenuRequest')
               const result = callbacks.onContextMenuRequest(view, event)
               console.log('callbacks.onContextMenuRequest returned', result)
               return result
            }
            return false
          },
        },
        handlePaste: createPasteHandler({
          getPasteBehavior: () => settings.editor.pasteBehavior,
          onImagePaste: callbacks.onImagePaste,
          resolveWikiLink: callbacks.resolveWikiLink,
        }),
      })
      applyCaretAnimation(core.editorView.dom as HTMLElement, settings.editor.caretAnimation)
      registerActiveEditor(core.editorView, documentId)
      callbacks.onOverlaysUpdate()
      return
    }

    core.isApplyingExternalState = true
    try {
      core.editorView.updateState(setup.state)
    } catch (error) {
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'editor_update_state_error',
        message: 'Editor state update failed during note switch',
        workspacePath: core.workspacePath,
        error,
      })
    }
    core.isApplyingExternalState = false
    applyCaretAnimation(core.editorView.dom as HTMLElement, settings.editor.caretAnimation)
    // Re-register on note switch: the view is reused, but it now holds a
    // different document, and the revision counter must restart.
    registerActiveEditor(core.editorView, documentId)
    callbacks.onOverlaysUpdate()
  }

  async function setupEditorForDocument(
    content: NoteDocument['content'],
    documentId: string,
    editorRoot: HTMLDivElement,
    settings: WorkspaceSettings,
  ) {
    unregisterPersistenceSession()
    core.contentPersistenceDisabled = false
    await setupEditorForContent(content, documentId, editorRoot, settings, { enableTemplates: false })
  }

  // Content authority invariant:
  //  - `note.json` (`note.content`) is the single source of truth for a
  //    note's body — the editor is built directly from it, with no separate
  //    disk-backed CRDT copy in between.
  //  - Exception: when `parseNoteContentToDocSafe` reports `degraded` for
  //    `note.content` (a node type this schema can't parse), the doc shown
  //    is a plain-text stand-in — `contentPersistenceDisabled` blocks
  //    `flushPendingContentUpdate` from writing it back over the original.
  // Keep this coupling intact when changing the setup/persistence paths.
  async function setupEditorForNote(note: NoteDocument, editorRoot: HTMLDivElement, settings: WorkspaceSettings) {
    unregisterPersistenceSession()

    const contentCheck = parseNoteContentToDocSafe(core.schema, note.content)
    core.contentPersistenceDisabled = contentCheck.degraded
    if (contentCheck.degraded) {
      reportDegradedContentNotice(note.id, core.workspacePath)
    }

    unregisterEditorPersistence = registerEditorPersistence(note.id, {
      // Clearing lastLoadedNoteId forces the next note load to rebuild the
      // editor from the note's stored content even when it equals the live
      // content; otherwise persistence would stay suspended.
      suspend: () => { core.lastLoadedNoteId = null },
      flushContent: () => { flushPendingContentUpdate() },
    })

    await setupEditorForContent(note.content, note.id, editorRoot, settings, { preParsedDoc: contentCheck.doc })
  }

  return {
    isMarkActive,
    executeStateCommand,
    executeCommandById,
    runPluginToolbarAction,
    runSlashItemFromOverlay,
    insertEmojiFromSlashPicker,
    getSlashItemFromState,
    initPluginHost,
    destroyEditorView,
    setupEditorForDocument,
    setupEditorForNote,
    flushPendingContentUpdate,
    flushDatabaseCleanup,
    insertContentAtSelection(content: NoteDocument['content']): boolean {
      if (!core.editorView) return false
      const doc = parseNoteContentToDoc(core.schema, content)
      const slice = new Slice(doc.content, 0, 0)
      const tr = core.editorView.state.tr.replaceSelection(slice).scrollIntoView()
      const selectionPos = Math.max(1, Math.min(tr.doc.content.size, tr.selection.to))
      core.editorView.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos), -1)))
      core.editorView.focus()
      callbacks.onOverlaysUpdate()
      return true
    },
  }
}
