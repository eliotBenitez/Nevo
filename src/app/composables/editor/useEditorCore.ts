import { EditorView } from 'prosemirror-view'
import { AllSelection, NodeSelection, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'
import { Slice, type Node } from 'prosemirror-model'
import { cellAround, CellSelection } from 'prosemirror-tables'
import { invoke } from '@tauri-apps/api/core'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
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
  serializeDocToNoteContent,
  setActivePluginSerialization,
} from '../../../editor-core'
import {
  createYDocFromContent,
  restoreYDocFromBinary,
  encodeYDocState,
  Y_FRAGMENT_NAME,
} from '../../../editor-core/collaboration'
import { collabCommands } from '../../../tauri/commands'
import { initAwarenessUser } from '../../../editor-core/collaboration/yAwareness'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useAuthStore } from '../../../stores/auth'
import type { CloudBackend } from '../../../core/workspace-backend'
import { looksLikeMarkdown, parseMarkdownToSlice } from './markdownPaste'
import { appLogger } from '../../../utils/logger'
import { runGuardedCommand } from './prosemirrorErrors'
import { i18n } from '../../../i18n'
import { useAiCompletion } from '../../../composables/useAiCompletion'
import { buildAiSlashItems } from './aiSlashItems'

function resolveEditorLanguage(): string {
  return document.documentElement.lang || 'ru'
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
  lastSerializedContent: string
  lastSerializedContentRef: NoteDocument['content'] | null
  /** Defers serializing the editor doc: lastSerializedContent is computed on first
   *  read instead of eagerly on every note open. */
  setLastSerializedFromDoc: (doc: Node) => void
  lastLoadedNoteId: string | null
  ydoc: Y.Doc | null
  awareness: Awareness | null
  /** False when the Y.Doc/awareness are owned by a cloud backend session and
   *  must not be destroyed by the editor on teardown. */
  ownsYdoc: boolean
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
  onMathEditRequest: (pos: number, rect?: DOMRect) => void
  onFormulaEditRequest: (cellPos: number, formula: string, rect?: DOMRect) => void
  onMathInlineInsert: () => boolean
  onMathBlockInsert: () => boolean
  onSlashMathItemRan: () => void
  onSlashEmojiPickRequest: () => void
  onMermaidEditRequest: (pos: number, rect?: DOMRect) => void
  onMarkmapEditRequest: (pos: number, rect?: DOMRect) => void
  onVegaEditRequest: (pos: number, rect?: DOMRect) => void
  /** Open the full-canvas draw editor for a draw_block (drawId). */
  onDrawOpen?: (drawId: string) => void
  onPluginNodeEditRequest: (pos: number, nodeName: string, rect?: DOMRect) => void
  onCalloutIconPickRequest: (pos: number, rect: DOMRect, icon: string) => void
  onTemplateInsertRequest?: () => void
  onAfterTransaction?: (view: EditorView) => void
  onAssetSrcsRemoved?: (srcs: string[]) => void
  onAiAskRequest?: (onSubmit: (instruction: string) => void) => void
}

const ASSET_SRC_PREFIX = '.nevo/assets/'

function assetSrcOf(node: Node): string | null {
  const src = node.attrs?.src
  return typeof src === 'string' && src.startsWith(ASSET_SRC_PREFIX) ? src : null
}

function collectAssetSrcs(doc: Node): Set<string> {
  const srcs = new Set<string>()
  doc.descendants((node) => {
    const src = assetSrcOf(node)
    if (src) srcs.add(src)
  })
  return srcs
}

/**
 * Asset srcs that disappeared in this transaction. Instead of walking the whole
 * document twice (before + after), we scan only the ranges the transaction
 * actually touched in the previous doc to gather candidate srcs; the full
 * after-doc scan runs only when at least one asset node was in a changed range.
 * For ordinary text edits there are no candidates, so neither walk happens.
 */
function collectRemovedAssetSrcs(prevDoc: Node, transaction: Transaction): string[] {
  const candidates = new Set<string>()
  let doc = prevDoc
  for (const step of transaction.steps) {
    const map = step.getMap()
    map.forEach((oldStart, oldEnd) => {
      if (oldEnd <= oldStart) return
      doc.nodesBetween(oldStart, oldEnd, (node) => {
        const src = assetSrcOf(node)
        if (src) candidates.add(src)
      })
    })
    const result = step.apply(doc)
    if (result.doc) doc = result.doc
  }
  if (candidates.size === 0) return []
  // The same asset may still be referenced elsewhere or have been re-inserted,
  // so confirm against the resulting document before reporting it as removed.
  const stillPresent = collectAssetSrcs(transaction.doc)
  return [...candidates].filter((src) => !stillPresent.has(src))
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
    ydoc: null,
    awareness: null,
    ownsYdoc: false,
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
    editorCapabilities: manifest.editorCapabilities,
    uiCapabilities: manifest.uiCapabilities ?? [],
    workspaceCapabilities: manifest.workspaceCapabilities ?? [],
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
  // Captured synchronously (Pinia active during component setup) for use in the
  // async note-setup path, which decides between disk-backed and cloud-backed Yjs.
  const workspaceStore = useWorkspaceStore()
  const authStore = useAuthStore()
  const ai = useAiCompletion()

  let pendingContentDoc: Node | null = null
  let contentSerializeTimer: ReturnType<typeof setTimeout> | null = null

  // Debounced persistence of the editor-owned (disk-backed) Y.Doc. Hoisted to
  // composable scope so it can be torn down on note switch / editor destroy —
  // otherwise the pending timer leaks past `ydoc.destroy()` and the last edit
  // within the debounce window is never written.
  let yjsSaveTimer: ReturnType<typeof setTimeout> | null = null
  let flushYjsPersistence: (() => void) | null = null
  let yjsUpdateTarget: Y.Doc | null = null
  let yjsUpdateHandler: (() => void) | null = null

  function teardownYjsPersistence() {
    const hadPendingSave = yjsSaveTimer !== null
    if (yjsSaveTimer) {
      clearTimeout(yjsSaveTimer)
      yjsSaveTimer = null
    }
    // Only flush when a debounced save was actually pending, so a plain note
    // switch with no unsaved Yjs changes doesn't trigger a redundant write.
    if (hadPendingSave) flushYjsPersistence?.()
    flushYjsPersistence = null
    if (yjsUpdateTarget && yjsUpdateHandler) {
      yjsUpdateTarget.off('update', yjsUpdateHandler)
    }
    yjsUpdateTarget = null
    yjsUpdateHandler = null
  }

  function clearContentSerializeTimer() {
    if (contentSerializeTimer) {
      clearTimeout(contentSerializeTimer)
      contentSerializeTimer = null
    }
  }

  function flushPendingContentUpdate(): NoteDocument['content'] | null {
    clearContentSerializeTimer()
    if (!pendingContentDoc) return null

    const content = serializeDocToNoteContent(pendingContentDoc)
    pendingContentDoc = null
    const serialized = JSON.stringify(content)
    core.lastSerializedContent = serialized
    core.lastSerializedContentRef = content
    callbacks.onContentUpdate(content)
    return content
  }

  function scheduleContentUpdate(doc: Node) {
    pendingContentDoc = doc
    callbacks.onDocDirty?.()
    callbacks.onDocChanged?.(doc)
    clearContentSerializeTimer()
    contentSerializeTimer = setTimeout(() => {
      flushPendingContentUpdate()
    }, CONTENT_SERIALIZE_DELAY_MS)
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
    if (core.pluginHost) {
      await core.pluginHost.deactivateAll()
      await core.pluginHost.dispose()
      core.pluginHost = null
    }
    core.toolbarPluginActions = []
    setActivePluginSerialization(null)

    if (!workspacePath) {
      core.schema = createSchemaWithPluginExtensions()
      return
    }

    const manifests = pluginManifests.map(toEditorPluginManifest)
    const host = new EditorPluginHost({
      workspacePath,
      manifests,
      nevoVersion: '1.0.0',
      runtime: {
        invoke: (commandId, args = {}) => invoke(commandId, { workspacePath, ...args }),
        t: (key, params) => String(i18n.global.t(key, params ?? {})),
        getPluginSetting: (pluginId, key) => workspaceStore.getPluginSetting(pluginId, key),
        setPluginSetting: (pluginId, key, value) => { void workspaceStore.setPluginSetting(pluginId, key, value) },
      },
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
    flushPendingContentUpdate()
    teardownYjsPersistence()
    core.editorView?.destroy()
    core.editorView = null
    // Cloud-backed sessions are owned by the workspace backend; only release
    // our reference, never destroy them here.
    if (core.ownsYdoc) {
      core.awareness?.destroy()
      core.ydoc?.destroy()
    }
    core.awareness = null
    core.ydoc = null
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
      yFragment?: import('yjs').XmlFragment
      enableTemplates?: boolean
    } = {},
  ) {
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
      enableMarkdownShortcuts: settings.editor.markdownShortcuts,
      tabBehavior: settings.editor.tabKeyBehavior,
      onTemplateInsertRequest: options.enableTemplates !== false && core.systemPlugins.templates
        ? callbacks.onTemplateInsertRequest
        : undefined,
      enableVega: core.systemPlugins.vega,
      enableMarkmap: core.systemPlugins.markmap,
      enableDraw: settings.features?.draw !== false,
      pluginHost: core.pluginHost ?? undefined,
      yFragment: options.yFragment,
      awareness: options.yFragment ? core.awareness ?? undefined : undefined,
      nodeViewOptions: {
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
        onRequestMarkmapEdit: ({ position, anchorRect }) => callbacks.onMarkmapEditRequest(position, anchorRect),
        onRequestVegaEdit: ({ position, anchorRect }) => callbacks.onVegaEditRequest(position, anchorRect),
        onRequestDrawOpen: ({ node }) => callbacks.onDrawOpen?.(node.attrs.drawId),
        onRequestMediaAsset: ({ position, kind }) => callbacks.onMediaPickerRequest(position, kind),
        onRequestNoteEmbedPick: ({ position, anchorRect }) => callbacks.onNoteEmbedPickRequest(position, anchorRect),
        onRequestEmbedUrl: ({ position, anchorRect }) => callbacks.onEmbedUrlRequest(position, anchorRect),
        onNoteEmbedContentLoad: (ctx) => callbacks.onNoteEmbedContentLoad?.(ctx),
        onNoteEmbedOpen: (noteId) => callbacks.onNoteEmbedOpen(noteId),
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
              event: 'yjs_transaction_apply_error',
              message: 'Editor transaction failed — possibly corrupted Yjs state',
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
              event: 'yjs_update_state_error',
              message: 'Editor state update failed — possibly corrupted Yjs state',
              workspacePath: core.workspacePath,
              error,
            })
            return
          }
          core.pluginHost?.notifyTransactionApplied(nextState, transaction)
          if (shouldRefreshOverlays(prevState, nextState, transaction)) {
            callbacks.onOverlaysUpdate()
          }
          if (transaction.docChanged && !core.isApplyingExternalState) {
            if (callbacks.onAssetSrcsRemoved) {
              const removed = collectRemovedAssetSrcs(prevState.doc, transaction)
              if (removed.length > 0) callbacks.onAssetSrcsRemoved(removed)
            }
            scheduleContentUpdate(nextState.doc)
          }
          callbacks.onAfterTransaction?.(view)
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
            return handleTableContextMenu(view, event)
          },
        },
        handlePaste(_view, event) {
          if (callbacks.onImagePaste?.(event)) return true
          if (settings.editor.pasteBehavior !== 'plain-text') {
            const html = event.clipboardData?.getData('text/html')
            if (html) return false
            const mdText = event.clipboardData?.getData('text/plain')
            if (mdText && looksLikeMarkdown(mdText)) {
              const slice = parseMarkdownToSlice(mdText, _view.state.schema, callbacks.resolveWikiLink)
              if (slice) {
                event.preventDefault()
                _view.dispatch(_view.state.tr.replaceSelection(slice).scrollIntoView())
                return true
              }
            }
            return false
          }
          const text = event.clipboardData?.getData('text/plain')
          if (!text) return false
          event.preventDefault()
          const { state, dispatch } = _view
          const { schema } = state
          const paragraphType = schema.nodes.paragraph
          if (!paragraphType) {
            dispatch(state.tr.insertText(text).scrollIntoView())
            return true
          }
          const lines = text.split('\n')
          let tr = state.tr.deleteSelection()
          let pos = tr.selection.from
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? ''
            if (i === 0) {
              if (line) { tr = tr.insertText(line, pos); pos += line.length }
            } else {
              const para = line
                ? paragraphType.createAndFill(null, schema.text(line))
                : paragraphType.createAndFill()
              if (para) { tr = tr.insert(pos, para); pos += para.nodeSize }
            }
          }
          dispatch(tr.scrollIntoView())
          return true
        },
      })
      applyCaretAnimation(core.editorView.dom as HTMLElement, settings.editor.caretAnimation)
      callbacks.onOverlaysUpdate()
      return
    }

    core.isApplyingExternalState = true
    try {
      core.editorView.updateState(setup.state)
    } catch (error) {
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'yjs_update_state_error',
        message: 'Editor state update failed during note switch — possibly corrupted Yjs state',
        workspacePath: core.workspacePath,
        error,
      })
    }
    core.isApplyingExternalState = false
    applyCaretAnimation(core.editorView.dom as HTMLElement, settings.editor.caretAnimation)
    callbacks.onOverlaysUpdate()
  }

  async function setupEditorForDocument(
    content: NoteDocument['content'],
    documentId: string,
    editorRoot: HTMLDivElement,
    settings: WorkspaceSettings,
  ) {
    teardownYjsPersistence()
    if (core.ownsYdoc) { core.awareness?.destroy(); core.ydoc?.destroy() }
    core.awareness = null
    core.ydoc = null
    core.ownsYdoc = false
    await setupEditorForContent(content, documentId, editorRoot, settings, { enableTemplates: false })
  }

  async function setupEditorForNote(note: NoteDocument, editorRoot: HTMLDivElement, settings: WorkspaceSettings) {
    let yFragment: import('yjs').XmlFragment | undefined

    // Release any previous Y.Doc; cloud sessions are owned by the backend and
    // must not be destroyed here (only the editor-owned local docs are).
    teardownYjsPersistence()
    if (core.ownsYdoc) { core.awareness?.destroy(); core.ydoc?.destroy() }
    core.awareness = null
    core.ydoc = null

    if (workspaceStore.backendKind === 'cloud') {
      const cloud = workspaceStore.backend as CloudBackend | null
      const session = cloud?.getNoteSession(note.id) ?? null
      if (session) {
        await session.whenSynced()
        core.ydoc = session.ydoc
        core.awareness = session.awareness
        core.ownsYdoc = false
        yFragment = session.ydoc.getXmlFragment(Y_FRAGMENT_NAME)
        const name = authStore.user?.displayName || authStore.user?.email || 'User'
        initAwarenessUser(session.awareness, name)
      }
    } else if (core.workspacePath) {
      const workspacePath = core.workspacePath
      const noteId = note.id
      let ydoc: Y.Doc | null = null

      try {
        const bytes = await collabCommands.loadYjsState(workspacePath, noteId)
        if (bytes.length > 0) {
          ydoc = restoreYDocFromBinary(bytes)
          try {
            ydoc.getXmlFragment(Y_FRAGMENT_NAME)
          } catch {
            ydoc.destroy()
            ydoc = createYDocFromContent(core.schema, note.content)
          }
        } else {
          ydoc = createYDocFromContent(core.schema, note.content)
        }
      } catch {
        try {
          ydoc = createYDocFromContent(core.schema, note.content)
        } catch { /* fall through — use non-Yjs mode */ }
      }

      if (ydoc) {
        core.ydoc = ydoc
        core.awareness = new Awareness(ydoc)
        core.ownsYdoc = true
        yFragment = ydoc.getXmlFragment(Y_FRAGMENT_NAME)

        const persistYjsState = () => {
          if (core.ydoc !== ydoc) return
          const state = encodeYDocState(ydoc)
          // `state` is a Uint8Array; the command wrapper forwards it as a raw
          // IPC body, so no Array.from conversion (which would JSON-inflate it).
          void collabCommands.saveYjsState(workspacePath, noteId, state).catch(() => {
            /* non-critical */
          })
        }
        flushYjsPersistence = persistYjsState
        const handleUpdate = () => {
          if (yjsSaveTimer) clearTimeout(yjsSaveTimer)
          yjsSaveTimer = setTimeout(() => {
            yjsSaveTimer = null
            persistYjsState()
          }, 2000)
        }
        yjsUpdateTarget = ydoc
        yjsUpdateHandler = handleUpdate
        ydoc.on('update', handleUpdate)
      }
    }

    await setupEditorForContent(note.content, note.id, editorRoot, settings, { yFragment })
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
