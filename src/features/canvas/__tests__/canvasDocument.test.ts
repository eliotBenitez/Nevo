import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { EditorView } from 'prosemirror-view'
import { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import { useCanvasDocument } from '../composables/useCanvasDocument'
import {
  CANVAS_DOCUMENT_FRAME_ID,
  CANVAS_LAYOUTS_KEY,
  CANVAS_SNAPSHOT_VERSION,
  createDefaultCanvasFrame,
  readCanvasSnapshot,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { createYDocFromContent, Y_FRAGMENT_NAME } from '../../../editor-core/collaboration'
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
  getYDoc: () => Y.Doc | null,
  getAwareness: () => Awareness | null,
  getMirror: () => CanvasSnapshotV1 | undefined = () => undefined,
  onMirrorChange: (snapshot: CanvasSnapshotV1) => void = () => {},
) {
  const captured: { api: ReturnType<typeof useCanvasDocument> | null } = { api: null }
  const Host = defineComponent({
    setup() {
      captured.api = useCanvasDocument({
        getEditorView,
        getYDoc,
        getAwareness,
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
    const ydoc = createYDocFromContent(nevoBaseSchema, content)
    const awareness = new Awareness(ydoc)
    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content,
      yFragment: ydoc.getXmlFragment(Y_FRAGMENT_NAME),
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
    return { ydoc, awareness, view: created }
  }

  it('seeds a default document frame when the Y.Doc has no canvas state', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    const { ydoc, awareness } = setupDoc(content)
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => ydoc, () => awareness)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))

    expect(api.snapshot.value.frame).toMatchObject({ autoHeight: true })
    expect(api.snapshot.value.order).toContain(CANVAS_DOCUMENT_FRAME_ID)
  })

  it('moves and resizes the document frame without dispatching any ProseMirror transaction', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    const { ydoc, awareness } = setupDoc(content)
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => ydoc, () => awareness)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    const docSizeBefore = view!.state.doc.content.size

    api.moveFrame(120, 240)
    await vi.waitFor(() => {
      expect(api.snapshot.value.frame).toMatchObject({ x: 120, y: 240 })
    })

    api.resizeFrame(500, 700)
    await vi.waitFor(() => {
      expect(api.snapshot.value.frame).toMatchObject({ width: 500, height: 700, autoHeight: false })
    })

    expect(view!.state.doc.content.size).toBe(docSizeBefore)
  })

  it('migrates a legacy per-block layout map into a single frame on connect', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('legacy note')] }
    const { ydoc, awareness } = setupDoc(content)
    ydoc.getMap(CANVAS_LAYOUTS_KEY).set('legacy-block', {
      blockId: 'legacy-block', x: 40, y: 60, width: 480, height: 320, zIndex: 0,
    })

    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => ydoc, () => awareness)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))

    expect(ydoc.getMap(CANVAS_LAYOUTS_KEY).size).toBe(0)
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
    const { ydoc, awareness } = setupDoc(content)
    expect(view!.state.doc.content.size).toBeGreaterThan(80_000)

    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => ydoc, () => awareness)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true), { timeout: 2_000 })

    expect(api.snapshot.value.frame).toBeTruthy()
  })

  it('adds a canvas text element without inserting a paragraph into the ProseMirror document', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    const { ydoc, awareness } = setupDoc(content)
    const { wrapper: hostWrapper, api } = mountCanvasDocument(() => view, () => ydoc, () => awareness)
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    const docSizeBefore = view!.state.doc.content.size
    const childCountBefore = view!.state.doc.childCount

    const id = api.addTextElement(10, 20)
    expect(id).toBeTruthy()

    await vi.waitFor(() => {
      expect(api.snapshot.value.elements[id]).toMatchObject({ kind: 'text', x: 10, y: 20 })
    })
    expect(view!.state.doc.content.size).toBe(docSizeBefore)
    expect(view!.state.doc.childCount).toBe(childCountBefore)
  })

  it('does not emit onMirrorChange when the Y.Doc already matches the incoming mirror, and emits exactly once on a real change', async () => {
    const content: BlockNode = { type: 'doc', content: [paragraphBlock('hello world')] }
    const { ydoc, awareness } = setupDoc(content)
    const mirror: CanvasSnapshotV1 = {
      version: CANVAS_SNAPSHOT_VERSION,
      frame: createDefaultCanvasFrame(),
      elements: {},
      connectors: {},
      order: [],
    }
    const onMirrorChange = vi.fn()
    const { wrapper: hostWrapper, api } = mountCanvasDocument(
      () => view,
      () => ydoc,
      () => awareness,
      () => mirror,
      onMirrorChange,
    )
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))

    // Connecting to a fresh Y.Doc seeds it from the mirror, so the resulting
    // snapshot is structurally identical to what was just handed in.
    expect(onMirrorChange).not.toHaveBeenCalled()

    api.moveFrame(120, 240)
    await vi.waitFor(() => {
      expect(api.snapshot.value.frame).toMatchObject({ x: 120, y: 240 })
    })

    expect(onMirrorChange).toHaveBeenCalledTimes(1)
  })

  // The editor is recreated underneath a mounted canvas on a note switch or
  // reload. Without re-binding, frame styling keeps landing on the detached
  // node (so the live card renders unpositioned and never hides when
  // collapsed) and every frame gesture mutates the previous note's Y.Doc.
  it('re-binds to a recreated editor view and Y.Doc', async () => {
    const first = setupDoc({ type: 'doc', content: [paragraphBlock('first note')] })
    const firstView = first.view
    let activeView: EditorView | null = firstView
    let activeDoc: Y.Doc = first.ydoc

    const { wrapper: hostWrapper, api } = mountCanvasDocument(
      () => activeView,
      () => activeDoc,
      () => first.awareness,
    )
    wrapper = hostWrapper

    api.connectWhenReady()
    await vi.waitFor(() => expect(api.ready.value).toBe(true))
    api.setFrameCollapsed(true)
    await vi.waitFor(() => expect(api.snapshot.value.frame.collapsed).toBe(true))
    expect(firstView.dom.dataset.canvasFrameCollapsed).toBe('true')

    const second = setupDoc({ type: 'doc', content: [paragraphBlock('second note')] })
    const secondView = second.view
    expect(secondView).not.toBe(firstView)
    activeView = secondView
    activeDoc = second.ydoc

    api.syncEditorView()
    await vi.waitFor(() => expect(api.snapshot.value.frame.collapsed).toBeUndefined())

    // The new note's card is styled and the stale one is cleaned up.
    expect(secondView.dom.dataset.canvasFrameCollapsed).toBe('false')
    expect(secondView.dom.style.getPropertyValue('--canvas-frame-width')).not.toBe('')
    expect(firstView.dom.dataset.canvasFrameCollapsed).toBeUndefined()

    // Gestures now reach the new document, not the one left behind.
    api.moveFrame(300, 400)
    await vi.waitFor(() => expect(api.snapshot.value.frame).toMatchObject({ x: 300, y: 400 }))
    expect(readCanvasSnapshot(first.ydoc).frame).toMatchObject({ x: 0, y: 0 })

    firstView.destroy()
  })
})
