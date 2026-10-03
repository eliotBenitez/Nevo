import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'prosemirror-view'
import { useCanvasDocument } from '../composables/useCanvasDocument'
import {
  CANVAS_DOCUMENT_FRAME_ID,
  CANVAS_SNAPSHOT_VERSION,
  createDefaultCanvasFrame,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { createNevoEditorState } from '../../../editor-core/state'
import type { BlockNode } from '../../../types/note'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function paragraphBlock(text: string): BlockNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function mountCanvasDocument(
  getEditorView: () => EditorView | null,
  getMirror: () => CanvasSnapshotV1 | undefined = () => undefined,
  onMirrorChange: (snapshot: CanvasSnapshotV1) => void = () => {},
) {
  const captured: { api: ReturnType<typeof useCanvasDocument> | null } = { api: null }
  const Host = defineComponent({
    setup() {
      captured.api = useCanvasDocument({
        getEditorView,
        getMirror,
        onMirrorChange,
      })
      return () => null
    },
  })
  const wrapper = mount(Host)
  const api = captured.api
  if (!api) throw new Error('useCanvasDocument did not initialize inside test host component')
  return { wrapper, api }
}

describe('useCanvasDocument (single document-frame model)', () => {
  let previousResizeObserver: typeof ResizeObserver | undefined
  let view: EditorView | null = null
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    previousResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    wrapper?.unmount()
    view?.destroy()
    view = null
    document.body.replaceChildren()
    if (previousResizeObserver) globalThis.ResizeObserver = previousResizeObserver
    else delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  })

  function setupDoc(content: BlockNode) {
    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content,
    })
    const mountEl = document.createElement('div')
    document.body.appendChild(mountEl)
    // Bound to the view this call creates, not to the shared `view`: a test
    // that sets up a second editor would otherwise route the first one's
    // transactions into the second and trip "mismatched transaction".
    let created: EditorView | null = null
    created = new EditorView(mountEl, {
      state: setup.state,
      dispatchTransaction(transaction) {
        created?.updateState(created.state.apply(transaction))
      },
    })
    view = created
    return { view: created }
  }

  it('seeds a default document frame when there is no persisted canvas mirror', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    setupDoc(content)
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))

    expect(api.snapshot.value.frame).toMatchObject({ autoHeight: true })
    expect(api.snapshot.value.order).toContain(CANVAS_DOCUMENT_FRAME_ID)
  })

  it('moves and resizes the document frame without dispatching any ProseMirror transaction', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    setupDoc(content)
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    const docSizeBefore = view!.state.doc.content.size

    api.moveFrame(120, 240)
    expect(api.snapshot.value.frame).toMatchObject({ x: 120, y: 240 })

    api.resizeFrame(500, 700)
    expect(api.snapshot.value.frame).toMatchObject({ width: 500, height: 700, autoHeight: false })

    expect(view!.state.doc.content.size).toBe(docSizeBefore)
  })

  it('migrates a legacy per-block layout map from the incoming mirror into a single frame on connect', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('legacy note')] }
    setupDoc(content)
    const legacyMirror = {
      version: 1,
      layouts: {
        'legacy-block': { blockId: 'legacy-block', x: 40, y: 60, width: 480, height: 320, zIndex: 0 },
      },
    } as unknown as CanvasSnapshotV1

    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => legacyMirror)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))

    expect(api.snapshot.value.frame.x).toBe(40)
    expect(api.snapshot.value.frame.y).toBe(60)
  })

  it('bootstraps instantly for a very large document since frame geometry never touches ProseMirror', async () => {
    const blockCount = 300
    const content: BlockNode = {
      type: 'doc',
      content: Array.from(
        { length: blockCount },
        (_, index) => paragraphBlock(`Block ${index} padding text to grow content size. `.repeat(20)),
      ),
    }
    setupDoc(content)
    expect(view!.state.doc.content.size).toBeGreaterThan(80_000)

    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true), { timeout: 2_000 })

    expect(api.snapshot.value.frame).toBeTruthy()
  })

  it('adds a canvas text element without inserting a paragraph into the ProseMirror document', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    setupDoc(content)
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    const docSizeBefore = view!.state.doc.content.size
    const childCountBefore = view!.state.doc.childCount

    const id = api.addTextElement(10, 20)
    expect(id).toBeTruthy()

    expect(api.snapshot.value.elements[id]).toMatchObject({ kind: 'text', x: 10, y: 20 })
    expect(view!.state.doc.content.size).toBe(docSizeBefore)
    expect(view!.state.doc.childCount).toBe(childCountBefore)
  })

  it('does not emit onMirrorChange when connecting, and emits exactly once on a real change', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    setupDoc(content)
    const mirror: CanvasSnapshotV1 = {
      version: CANVAS_SNAPSHOT_VERSION,
      frame: createDefaultCanvasFrame(),
      elements: {},
      connectors: {},
      order: [],
    }
    const onMirrorChange = vi.fn()
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => mirror, onMirrorChange)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))

    // Connecting seeds the store from the mirror without committing, so the
    // resulting snapshot never diffs against anything and nothing is emitted.
    expect(onMirrorChange).not.toHaveBeenCalled()

    api.moveFrame(120, 240)
    expect(api.snapshot.value.frame).toMatchObject({ x: 120, y: 240 })

    expect(onMirrorChange).toHaveBeenCalledTimes(1)
  })

  it('does not emit onMirrorChange when a commit does not change the snapshot', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    setupDoc(content)
    const mirror: CanvasSnapshotV1 = {
      version: CANVAS_SNAPSHOT_VERSION,
      frame: createDefaultCanvasFrame(),
      elements: {},
      connectors: {},
      order: [],
    }
    const onMirrorChange = vi.fn()
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => mirror, onMirrorChange)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    // A mirror that already matches the store's default emits nothing on connect.
    expect(onMirrorChange).not.toHaveBeenCalled()

    const frame = api.snapshot.value.frame
    api.moveFrame(frame.x, frame.y)

    expect(onMirrorChange).not.toHaveBeenCalled()
  })

  it('emits the mirror on commit and the reverted mirror on undo', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    setupDoc(content)
    const mirror: CanvasSnapshotV1 = {
      version: CANVAS_SNAPSHOT_VERSION,
      frame: createDefaultCanvasFrame(),
      elements: {},
      connectors: {},
      order: [],
    }
    const onMirrorChange = vi.fn()
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => mirror, onMirrorChange)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    expect(onMirrorChange).not.toHaveBeenCalled()

    api.moveFrame(300, 400)
    expect(onMirrorChange).toHaveBeenCalledTimes(1)
    expect(onMirrorChange.mock.calls[0][0].frame).toMatchObject({ x: 300, y: 400 })

    api.undo()
    expect(onMirrorChange).toHaveBeenCalledTimes(2)
    expect(onMirrorChange.mock.calls[1][0].frame).toMatchObject({ x: 0, y: 0 })
    expect(api.snapshot.value.frame).toMatchObject({ x: 0, y: 0 })
  })

  // The editor is recreated underneath a mounted canvas on a note switch or
  // reload. Without re-binding, frame styling keeps landing on the detached
  // node, so the live card renders unpositioned and never hides when
  // collapsed. Canvas state itself no longer lives on the editor view/Y.Doc,
  // so re-binding is purely a CSS/DOM concern now — the store and its
  // history carry over unchanged.
  it('re-binds frame styling to a recreated editor view', async () => {
    const first = setupDoc({ type: 'doc', content: [paragraphBlock('first note')] })
    const firstView = first.view
    let activeView: EditorView | null = firstView

    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => activeView)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    api.setFrameCollapsed(true)
    expect(api.snapshot.value.frame.collapsed).toBe(true)
    expect(firstView.dom.dataset.canvasFrameCollapsed).toBe('true')

    const second = setupDoc({ type: 'doc', content: [paragraphBlock('second note')] })
    const secondView = second.view
    expect(secondView).not.toBe(firstView)
    activeView = secondView

    api.syncEditorView()

    // The new view is styled from the (unchanged) store snapshot and the
    // stale one is cleaned up.
    expect(secondView.dom.dataset.canvasFrameCollapsed).toBe('true')
    expect(secondView.dom.style.getPropertyValue('--canvas-frame-width')).not.toBe('')
    expect(firstView.dom.dataset.canvasFrameCollapsed).toBeUndefined()

    // Gestures now reach the same store either way — the store never moved.
    api.moveFrame(300, 400)
    expect(api.snapshot.value.frame).toMatchObject({ x: 300, y: 400 })

    firstView.destroy()
  })
})
