import { onBeforeUnmount, shallowRef } from 'vue'
import type { EditorView } from 'prosemirror-view'
import {
  canvasSnapshotsEqual,
  CANVAS_DOCUMENT_FRAME_ID,
  CanvasStore,
  COLLAPSED_FRAME_HEIGHT,
  COLLAPSED_FRAME_WIDTH,
  MIN_FRAME_WIDTH,
  normalizeCanvasSnapshot,
  reflowConnectorBinding,
  type CanvasBounds,
  type CanvasDocumentFrame,
  type CanvasDraft,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { applyCanvasFrameStyle, clearCanvasFrameStyle } from '../canvasFrameStyle'
import { useCanvasElements } from './useCanvasElements'
import { useCanvasP1Elements } from './useCanvasP1Elements'

interface CanvasDocumentOptions {
  getEditorView: () => EditorView | null
  getMirror: () => CanvasSnapshotV1 | undefined
  onMirrorChange: (snapshot: CanvasSnapshotV1) => void
}

const MIN_FRAME_HEIGHT = 200
const MAX_FRAME_HEIGHT = 20_000

function reflowFrameConnectors(draft: CanvasDraft, bounds: CanvasDocumentFrame) {
  for (const [id, connector] of draft.connectors.entries()) {
    const next = reflowConnectorBinding(connector, 'block', CANVAS_DOCUMENT_FRAME_ID, bounds)
    if (next !== connector) draft.connectors.set(id, next)
  }
}

/**
 * Bridges the single document frame (and canvas elements/connectors) between
 * a per-note `CanvasStore` and the DOM. This never touches ProseMirror
 * decorations or document state — geometry is a handful of CSS variables on
 * one element (see `canvasFrameStyle.ts`), so a canvas commit can never fan
 * out into a whole-document PM rebuild. Canvas state lives entirely in the
 * store (seeded from/mirrored to `note.canvas`) and no longer touches the
 * note's Y.Doc at all.
 */
export function useCanvasDocument(options: CanvasDocumentOptions) {
  const store = new CanvasStore()
  const snapshot = shallowRef<CanvasSnapshotV1>(store.snapshot)
  const ready = shallowRef(false)
  // Screen-space chrome (header, outline, resize handle) reads this to follow
  // an in-flight frame drag/resize — see `previewFrame` below. `null` once no
  // gesture is in flight, so consumers fall back to the committed snapshot.
  const framePreview = shallowRef<Partial<CanvasBounds> | null>(null)
  let view: EditorView | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let previewFrameHandle: number | null = null
  let pendingFramePatch: Partial<CanvasDocumentFrame> | null = null
  let unsubscribe: (() => void) | null = null

  const elements = useCanvasElements({
    getStore: () => (ready.value ? store : null),
  })
  const p1Elements = useCanvasP1Elements({
    getStore: () => (ready.value ? store : null),
  })

  function cancelPreviewFrame() {
    if (previewFrameHandle !== null) {
      cancelAnimationFrame(previewFrameHandle)
      previewFrameHandle = null
    }
    pendingFramePatch = null
    framePreview.value = null
  }

  // Runs synchronously on every commit/undo/redo — no debounce. Canvas
  // commits are already coalesced at the gesture boundary (one user action =
  // one `store.commit()` call), so there is no update burst to collapse here
  // the way the old Y.Doc observer had to.
  function handleStoreChange(next: CanvasSnapshotV1) {
    cancelPreviewFrame()
    snapshot.value = next
    if (view) applyCanvasFrameStyle(view.dom, next.frame)
    options.onMirrorChange(next)
  }

  function bindTo(nextView: EditorView) {
    if (view && view !== nextView) clearCanvasFrameStyle(view.dom)
    view = nextView
    if (!ready.value) {
      // First bind for this composable instance (component is keyed per note,
      // see `EdgelessCanvasView.vue`'s usage in `WorkspaceEditorPane.vue`):
      // seed the store from the note's mirror and start listening. A later
      // re-bind (editor view recreated for the *same* note — reload, remount)
      // must not reseed: `handleStoreChange` already keeps the mirror and the
      // store's snapshot in sync, so reloading here would just be a no-op at
      // best and would discard local history at worst.
      const mirror = options.getMirror()
      const normalizedMirror = normalizeCanvasSnapshot(mirror)
      store.load(mirror)
      snapshot.value = store.snapshot
      // A missing/legacy/invalid mirror was just defaulted or migrated into
      // `store.snapshot` — that's new state worth persisting, so emit once to
      // seed `note.canvas`. A mirror that was already valid and unchanged by
      // normalization emits nothing, matching the pre-store behavior of a
      // Y.Doc that already converged with `note.content`.
      if (!normalizedMirror || !canvasSnapshotsEqual(normalizedMirror, store.snapshot)) {
        options.onMirrorChange(store.snapshot)
      }
      unsubscribe = store.subscribe(handleStoreChange)
      ready.value = true
    }
    applyCanvasFrameStyle(view.dom, store.snapshot.frame)
  }

  async function connect(): Promise<boolean> {
    const nextView = options.getEditorView()
    if (!nextView) return false
    bindTo(nextView)
    return true
  }

  /**
   * Re-binds when the editor is recreated under us (note switch, reload). The
   * captured `view` would otherwise keep pointing at a detached DOM node: frame
   * styling would land on dead DOM (so the live card renders unpositioned and
   * never hides when collapsed).
   */
  function syncEditorView() {
    const nextView = options.getEditorView()
    if (!nextView || nextView === view) return
    bindTo(nextView)
  }

  function connectWhenReady() {
    void connect().then((connected) => {
      if (!connected) retryTimer = setTimeout(connectWhenReady, 50)
    })
  }

  function moveFrame(x: number, y: number) {
    store.commit((draft) => {
      if (draft.frame.locked) return
      draft.frame = { ...draft.frame, x, y }
      reflowFrameConnectors(draft, draft.frame)
    })
  }

  function resizeFrame(width: number, height: number) {
    store.commit((draft) => {
      if (draft.frame.locked) return
      draft.frame = {
        ...draft.frame,
        width: Math.max(MIN_FRAME_WIDTH, width),
        height: Math.max(MIN_FRAME_HEIGHT, Math.min(MAX_FRAME_HEIGHT, height)),
        autoHeight: false,
      }
      reflowFrameConnectors(draft, draft.frame)
    })
  }

  /** Undoable like `moveFrame`/`resizeFrame`. `useCanvasFrameMetrics`'
   *  measured content height lives in the view layer and isn't reachable from
   *  a gesture callback, so connectors reflow against the fixed collapsed
   *  constants when collapsing and against the stored frame geometry when
   *  expanding — the same approximation the other frame gestures already
   *  make for auto-height frames. */
  function setFrameCollapsed(collapsed: boolean) {
    store.commit((draft) => {
      if (draft.frame.locked) return
      draft.frame = { ...draft.frame, collapsed }
      const bounds = collapsed
        ? { x: draft.frame.x, y: draft.frame.y, width: COLLAPSED_FRAME_WIDTH, height: COLLAPSED_FRAME_HEIGHT, zIndex: draft.frame.zIndex }
        : draft.frame
      reflowFrameConnectors(draft, bounds)
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
    store.undo()
  }

  function redo() {
    store.redo()
  }

  function disconnect() {
    ready.value = false
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    cancelPreviewFrame()
    unsubscribe?.()
    unsubscribe = null
    if (view) {
      clearCanvasFrameStyle(view.dom)
      delete view.dom.dataset.canvasEditing
    }
    view = null
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
  }
}
