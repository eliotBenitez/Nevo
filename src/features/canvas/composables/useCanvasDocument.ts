import { onBeforeUnmount, shallowRef } from 'vue'
import type { EditorView } from 'prosemirror-view'
import * as Y from 'yjs'
import { yUndoPluginKey } from 'y-prosemirror'
import type { Awareness } from 'y-protocols/awareness'
import {
  addCanvasToUndoManager,
  canvasSharedTypesAreEmpty,
  canvasSnapshotsEqual,
  CANVAS_DOCUMENT_FRAME_ID,
  CANVAS_SETUP_ORIGIN,
  COLLAPSED_FRAME_HEIGHT,
  COLLAPSED_FRAME_WIDTH,
  emptyCanvasSnapshot,
  getCanvasSharedTypes,
  migrateCanvasLayoutsIfNeeded,
  MIN_FRAME_WIDTH,
  normalizeCanvasSnapshot,
  readCanvasFrame,
  readCanvasSnapshot,
  reflowConnectorBinding,
  replaceCanvasSnapshot,
  runCanvasGesture,
  writeCanvasFrame,
  type CanvasBounds,
  type CanvasDocumentFrame,
  type CanvasSharedTypes,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { applyCanvasFrameStyle, clearCanvasFrameStyle } from '../canvasFrameStyle'
import { useCanvasElements } from './useCanvasElements'
import { useCanvasP1Elements } from './useCanvasP1Elements'

interface CanvasDocumentOptions {
  getEditorView: () => EditorView | null
  getYDoc: () => Y.Doc | null
  getAwareness: () => Awareness | null
  getMirror: () => CanvasSnapshotV1 | undefined
  onMirrorChange: (snapshot: CanvasSnapshotV1) => void
}

const REFRESH_DEBOUNCE_MS = 24
const MIN_FRAME_HEIGHT = 200
const MAX_FRAME_HEIGHT = 20_000

function reflowFrameConnectors(types: CanvasSharedTypes, bounds: CanvasDocumentFrame) {
  for (const [id, connector] of types.connectors.entries()) {
    const next = reflowConnectorBinding(connector, 'block', CANVAS_DOCUMENT_FRAME_ID, bounds)
    if (next !== connector) types.connectors.set(id, next)
  }
}

/**
 * Bridges the single document frame (and canvas elements/connectors) between
 * the disk-backed Y.Doc and the DOM. Unlike the pre-Phase-2 per-block model,
 * this never touches ProseMirror decorations or document state — geometry is
 * a handful of CSS variables on one element (see `canvasFrameStyle.ts`), so a
 * transaction burst here can never fan out into a whole-document PM rebuild.
 */
export function useCanvasDocument(options: CanvasDocumentOptions) {
  const snapshot = shallowRef<CanvasSnapshotV1>(emptyCanvasSnapshot())
  const ready = shallowRef(false)
  // Screen-space chrome (header, outline, resize handle) reads this to follow
  // an in-flight frame drag/resize — see `previewFrame` below. `null` once no
  // gesture is in flight, so consumers fall back to the committed snapshot.
  const framePreview = shallowRef<Partial<CanvasBounds> | null>(null)
  let ydoc: Y.Doc | null = null
  let view: EditorView | null = null
  let undoManager: Y.UndoManager | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let previewFrameHandle: number | null = null
  let pendingFramePatch: Partial<CanvasDocumentFrame> | null = null
  const observers: Array<() => void> = []
  // Last snapshot handed to `options.onMirrorChange`. Gates the emit so a Yjs
  // observer firing without a structural change (or merely connecting to an
  // already-matching mirror) does not dirty the note and trigger a full save.
  let lastEmitted: CanvasSnapshotV1 | null = null

  const elements = useCanvasElements({
    getYDoc: () => ydoc,
    getUndoManager: () => undoManager,
  })
  const p1Elements = useCanvasP1Elements({
    getYDoc: () => ydoc,
    getUndoManager: () => undoManager,
  })

  function cancelPreviewFrame() {
    if (previewFrameHandle !== null) {
      cancelAnimationFrame(previewFrameHandle)
      previewFrameHandle = null
    }
    pendingFramePatch = null
    framePreview.value = null
  }

  function refresh() {
    if (!ydoc || !view) return
    cancelPreviewFrame()
    snapshot.value = readCanvasSnapshot(ydoc)
    applyCanvasFrameStyle(view.dom, snapshot.value.frame)
    if (!canvasSnapshotsEqual(lastEmitted ?? undefined, snapshot.value)) {
      lastEmitted = snapshot.value
      options.onMirrorChange(snapshot.value)
    }
  }

  // Time-debounced (not just microtask-coalesced): during bursts of Y updates
  // (remote peers, element drags) this collapses many notifications into one
  // refresh every ~24ms while still guaranteeing a trailing run.
  function queueRefresh() {
    if (refreshTimer !== null) return
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      refresh()
    }, REFRESH_DEBOUNCE_MS)
  }

  function observeSharedTypes() {
    if (!ydoc) return
    const types = getCanvasSharedTypes(ydoc)
    for (const type of [types.frame, types.elements, types.connectors, types.order]) {
      type.observe(queueRefresh)
      observers.push(() => type.unobserve(queueRefresh))
    }
  }

  function bindTo(nextView: EditorView, nextDoc: Y.Doc) {
    observers.splice(0).forEach(stop => stop())
    if (view && view !== nextView) clearCanvasFrameStyle(view.dom)
    view = nextView
    ydoc = nextDoc

    migrateCanvasLayoutsIfNeeded(ydoc, CANVAS_SETUP_ORIGIN)
    const types = getCanvasSharedTypes(ydoc)
    const pluginState = yUndoPluginKey.getState(view.state) as { undoManager?: Y.UndoManager } | undefined
    undoManager = pluginState?.undoManager ?? null

    const incomingMirror = normalizeCanvasSnapshot(options.getMirror())
    if (canvasSharedTypesAreEmpty(types)) {
      replaceCanvasSnapshot(ydoc, incomingMirror ?? emptyCanvasSnapshot(), CANVAS_SETUP_ORIGIN)
    }
    if (undoManager) addCanvasToUndoManager(undoManager, types)

    // Seeding lastEmitted with the incoming mirror means opening Canvas mode
    // on a note whose Y.Doc already matches note.content emits nothing at
    // all — refresh() below will find no structural diff.
    lastEmitted = incomingMirror ?? null

    observeSharedTypes()
    ready.value = true
    refresh()
  }

  async function connect(): Promise<boolean> {
    const nextView = options.getEditorView()
    const nextDoc = options.getYDoc()
    if (!nextView || !nextDoc) return false
    bindTo(nextView, nextDoc)
    return true
  }

  /**
   * Re-binds when the editor is recreated under us (note switch, reload). The
   * captured `view`/`ydoc` would otherwise keep pointing at a detached DOM node
   * and the previous note's document: frame styling would land on dead DOM (so
   * the live card renders unpositioned and never hides when collapsed) and
   * every frame gesture would silently mutate the wrong note.
   */
  function syncEditorView() {
    const nextView = options.getEditorView()
    const nextDoc = options.getYDoc()
    if (!nextView || !nextDoc) return
    if (nextView === view && nextDoc === ydoc) return
    bindTo(nextView, nextDoc)
  }

  function connectWhenReady() {
    void connect().then((connected) => {
      if (!connected) retryTimer = setTimeout(connectWhenReady, 50)
    })
  }

  function moveFrame(x: number, y: number) {
    if (!ydoc) return
    runCanvasGesture(ydoc, undoManager, (types) => {
      const frame = readCanvasFrame(types)
      if (!frame || frame.locked) return
      const next = { ...frame, x, y }
      writeCanvasFrame(types, next)
      reflowFrameConnectors(types, next)
    })
  }

  function resizeFrame(width: number, height: number) {
    if (!ydoc) return
    runCanvasGesture(ydoc, undoManager, (types) => {
      const frame = readCanvasFrame(types)
      if (!frame || frame.locked) return
      const next: CanvasDocumentFrame = {
        ...frame,
        width: Math.max(MIN_FRAME_WIDTH, width),
        height: Math.max(MIN_FRAME_HEIGHT, Math.min(MAX_FRAME_HEIGHT, height)),
        autoHeight: false,
      }
      writeCanvasFrame(types, next)
      reflowFrameConnectors(types, next)
    })
  }

  /** Undoable like `moveFrame`/`resizeFrame`. `useCanvasFrameMetrics`'
   *  measured content height lives in the view layer and isn't reachable from
   *  a gesture callback, so connectors reflow against the fixed collapsed
   *  constants when collapsing and against the stored frame geometry when
   *  expanding — the same approximation the other frame gestures already
   *  make for auto-height frames. */
  function setFrameCollapsed(collapsed: boolean) {
    if (!ydoc) return
    runCanvasGesture(ydoc, undoManager, (types) => {
      const frame = readCanvasFrame(types)
      if (!frame || frame.locked) return
      const next: CanvasDocumentFrame = { ...frame, collapsed }
      writeCanvasFrame(types, next)
      const bounds = collapsed
        ? { x: next.x, y: next.y, width: COLLAPSED_FRAME_WIDTH, height: COLLAPSED_FRAME_HEIGHT, zIndex: next.zIndex }
        : next
      reflowFrameConnectors(types, bounds)
    })
  }

  function previewFrame(patch: Partial<Pick<CanvasDocumentFrame, 'x' | 'y' | 'width' | 'height'>>) {
    if (!view) return
    pendingFramePatch = { ...(pendingFramePatch ?? {}), ...patch }
    if (previewFrameHandle !== null) return
    previewFrameHandle = requestAnimationFrame(() => {
      previewFrameHandle = null
      if (!view || !pendingFramePatch) return
      applyCanvasFrameStyle(view.dom, { ...snapshot.value.frame, ...pendingFramePatch })
      framePreview.value = pendingFramePatch
      pendingFramePatch = null
    })
  }

  function setFrameEditing(editing: boolean) {
    if (!view) return
    if (editing) view.dom.dataset.canvasEditing = 'true'
    else delete view.dom.dataset.canvasEditing
  }

  function undo() {
    undoManager?.undo()
  }

  function redo() {
    undoManager?.redo()
  }

  function disconnect() {
    ready.value = false
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    cancelPreviewFrame()
    observers.splice(0).forEach(stop => stop())
    if (view) {
      clearCanvasFrameStyle(view.dom)
      delete view.dom.dataset.canvasEditing
    }
    view = null
    ydoc = null
    undoManager = null
    lastEmitted = null
  }

  onBeforeUnmount(disconnect)

  return {
    snapshot,
    ready,
    framePreview,
    connectWhenReady,
    syncEditorView,
    moveFrame,
    resizeFrame,
    setFrameCollapsed,
    previewFrame,
    cancelPreviewFrame,
    setFrameEditing,
    ...elements,
    ...p1Elements,
    undo,
    redo,
    getAwareness: options.getAwareness,
  }
}
