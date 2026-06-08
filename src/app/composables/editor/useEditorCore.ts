import { EditorView } from 'prosemirror-view'
import { AllSelection, NodeSelection, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'
import { Slice, type Node } from 'prosemirror-model'
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
  parseNoteContentToDoc,
  serializeDocToNoteContent,
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
import { isProseMirrorTransformError } from './prosemirrorErrors'
import { i18n } from '../../../i18n'

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
  lastLoadedNoteId: string | null
  ydoc: Y.Doc | null
  awareness: Awareness | null
  /** False when the Y.Doc/awareness are owned by a cloud backend session and
   *  must not be destroyed by the editor on teardown. */
  ownsYdoc: boolean
  workspacePath: string | null
}

export interface EditorCoreCallbacks {
  onOverlaysUpdate: () => void
  onCloseOverlays: () => void
  onContentUpdate: (content: NoteDocument['content']) => void
  onDocDirty?: () => void
  onDocChanged?: (doc: Node) => void
  onInternalLinkOpen: (noteId: string, anchor: string | null) => void
  onLinkPickerEnter?: () => boolean
  onImagePickerRequest: (pos: number) => void
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
  onMathInlineInsert: () => boolean
  onMathBlockInsert: () => boolean
  onSlashMathItemRan: () => void
  onSlashEmojiPickRequest: () => void
  onMermaidEditRequest: (pos: number, rect?: DOMRect) => void
  onMarkmapEditRequest: (pos: number, rect?: DOMRect) => void
  onVegaEditRequest: (pos: number, rect?: DOMRect) => void
  onCalloutIconPickRequest: (pos: number, rect: DOMRect, icon: string) => void
  onTemplateInsertRequest?: () => void
  onAfterTransaction?: (view: EditorView) => void
  onAssetSrcsRemoved?: (srcs: string[]) => void
}

function collectAssetSrcs(doc: Node): Set<string> {
  const srcs = new Set<string>()
  doc.descendants((node) => {
    const src = node.attrs?.src
    if (typeof src === 'string' && src.startsWith('.nevo/assets/')) srcs.add(src)
  })
  return srcs
}

export function createEditorCore(): EditorCore {
  return {
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
    lastSerializedContent: '',
    lastSerializedContentRef: null,
    lastLoadedNoteId: null,
    ydoc: null,
    awareness: null,
    ownsYdoc: false,
    workspacePath: null,
  }
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

  let pendingContentDoc: Node | null = null
  let contentSerializeTimer: ReturnType<typeof setTimeout> | null = null

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
    if (!core.editorView) return false
    let applied = false
    try {
      applied = command(core.editorView.state, core.editorView.dispatch.bind(core.editorView))
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'command_transform_error',
        message: 'Editor command failed during document transform',
        workspacePath: core.workspacePath,
        error,
      })
      return false
    }
    if (applied) {
      core.editorView.focus()
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
    if (!core.editorView) return
    try {
      action.run({
        view: core.editorView,
        state: core.editorView.state,
        dispatch: core.editorView.dispatch.bind(core.editorView),
      })
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'plugin_toolbar_transform_error',
        message: 'Plugin toolbar action failed during document transform',
        workspacePath: core.workspacePath,
        error,
        payload: { actionId: action.id },
      })
      return
    }
    core.editorView.focus()
    callbacks.onOverlaysUpdate()
  }

  function runSlashItemFromOverlay(item: NevoSlashItem, _slashState: NevoSlashMenuState = core.lastSlashPluginState): boolean {
    if (!core.editorView) return false
    const currentSlashState = getSlashMenuState(core.editorView.state)
    if (!currentSlashState.open || !currentSlashState.range) return false
    if (!currentSlashState.itemIds.includes(item.id)) return false

    if (item.id === 'emoji') {
      callbacks.onSlashEmojiPickRequest()
      return true
    }

    let applied = false
    try {
      applied = executeSlashItem(core.editorView, item, currentSlashState)
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'slash_transform_error',
        message: 'Slash command failed during document transform',
        workspacePath: core.workspacePath,
        error,
        payload: { itemId: item.id },
      })
      return false
    }
    if (!applied) return false
    if (item.id === 'math-inline' || item.id === 'math') {
      callbacks.onSlashMathItemRan()
    }
    if (item.id === 'embed') {
      requestEmbedUrlForSelectedBlock()
    }
    core.editorView.focus()
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
    if (core.pluginHost) {
      await core.pluginHost.deactivateAll()
      await core.pluginHost.dispose()
      core.pluginHost = null
    }
    core.toolbarPluginActions = []

    if (!workspacePath) {
      core.schema = createSchemaWithPluginExtensions()
      return
    }

    const manifests = pluginManifests.map(toEditorPluginManifest)
    const host = new EditorPluginHost({ workspacePath, manifests, nevoVersion: '1.0.0' })
    await host.initialize()
    core.pluginHost = host
    core.schema = createSchemaWithPluginExtensions(host)
    core.toolbarPluginActions = sortToolbarActions(Array.from(host.registries.toolbarActions.values()))

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

  async function setupEditorForNote(note: NoteDocument, editorRoot: HTMLDivElement, settings: WorkspaceSettings) {
    let yFragment: import('yjs').XmlFragment | undefined

    // Release any previous Y.Doc; cloud sessions are owned by the backend and
    // must not be destroyed here (only the editor-owned local docs are).
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
          ydoc = restoreYDocFromBinary(new Uint8Array(bytes))
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

        let saveTimer: ReturnType<typeof setTimeout> | null = null
        ydoc.on('update', () => {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(async () => {
            if (core.ydoc === ydoc) {
              const state = encodeYDocState(ydoc)
              try {
                await collabCommands.saveYjsState(workspacePath, noteId, Array.from(state))
              } catch { /* non-critical */ }
            }
          }, 2000)
        })
      }
    }

    const setup = createNevoEditorState({
      schema: core.schema,
      content: note.content,
      enableSlashCommands: settings.editor.slashCommands,
      enableMarkdownShortcuts: settings.editor.markdownShortcuts,
      tabBehavior: settings.editor.tabKeyBehavior,
      onTemplateInsertRequest: settings.features?.templates !== false ? callbacks.onTemplateInsertRequest : undefined,
      enableVega: settings.features?.vega !== false,
      enableMarkmap: settings.features?.markmap !== false,
      pluginHost: core.pluginHost ?? undefined,
      yFragment,
      awareness: core.awareness ?? undefined,
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
        onRequestMermaidEdit: ({ position, anchorRect }) => callbacks.onMermaidEditRequest(position, anchorRect),
        onRequestMarkmapEdit: ({ position, anchorRect }) => callbacks.onMarkmapEditRequest(position, anchorRect),
        onRequestVegaEdit: ({ position, anchorRect }) => callbacks.onVegaEditRequest(position, anchorRect),
        onRequestMediaAsset: ({ position, kind }) => callbacks.onMediaPickerRequest(position, kind),
        onRequestNoteEmbedPick: ({ position, anchorRect }) => callbacks.onNoteEmbedPickRequest(position, anchorRect),
        onRequestEmbedUrl: ({ position, anchorRect }) => callbacks.onEmbedUrlRequest(position, anchorRect),
        onNoteEmbedContentLoad: (ctx) => callbacks.onNoteEmbedContentLoad?.(ctx),
        onNoteEmbedOpen: (noteId) => callbacks.onNoteEmbedOpen(noteId),
        t: (key: string) => i18n.global.t(key),
      },
    })

    core.commandRegistry = setup.commands
    core.coreCommands = setup.coreCommands
    core.slashItems = setup.slashItems
    core.lastSerializedContent = JSON.stringify(serializeDocToNoteContent(setup.state.doc))
    core.lastSerializedContentRef = note.content
    core.lastLoadedNoteId = note.id

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
              const prevSrcs = collectAssetSrcs(prevState.doc)
              const nextSrcs = collectAssetSrcs(nextState.doc)
              const removed = [...prevSrcs].filter((s) => !nextSrcs.has(s))
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
        },
        handlePaste(_view, event) {
          if (settings.editor.pasteBehavior !== 'plain-text') {
            const html = event.clipboardData?.getData('text/html')
            if (html) return false
            const mdText = event.clipboardData?.getData('text/plain')
            if (mdText && looksLikeMarkdown(mdText)) {
              const slice = parseMarkdownToSlice(mdText, _view.state.schema)
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
