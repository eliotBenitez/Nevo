import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { EditorView } from 'prosemirror-view'
import EdgelessCanvasView from '../EdgelessCanvasView.vue'
import { CANVAS_DOCUMENT_FRAME_ID, type CanvasSnapshotV1 } from '../../../core/canvas'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { createNevoEditorState } from '../../../editor-core/state'
import en from '../../../locales/en.json'
import type { BlockNode } from '../../../types/note'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function formattedInlineContent(): BlockNode[] {
  const text = 'Mixed formatted canvas content with links and emphasis. '
  return Array.from({ length: 15 }, (_, index) => ({
    type: 'text',
    text,
    ...(index % 3 === 0
      ? { marks: [{ type: 'strong' }] }
      : index % 3 === 1
        ? { marks: [{ type: 'em' }] }
        : { marks: [{ type: 'underline' }] }),
  }))
}

function mixedLargeContent(blockCount = 300): BlockNode {
  const textBlock = (): BlockNode => ({ type: 'paragraph', content: formattedInlineContent() })
  return {
    type: 'doc',
    content: Array.from({ length: blockCount }, (_, index): BlockNode => {
      switch (index % 6) {
        case 1:
          return { type: 'heading', attrs: { level: 2 }, content: formattedInlineContent() }
        case 2:
          return { type: 'blockquote', content: [textBlock()] }
        case 3:
          return {
            type: 'bullet_list',
            content: [{ type: 'list_item', content: [textBlock()] }],
          }
        case 4:
          return {
            type: 'callout',
            attrs: { variant: 'info', icon: '💡' },
            content: [textBlock()],
          }
        case 5:
          return {
            type: 'toggle',
            attrs: { collapsed: false },
            content: [
              { type: 'toggle_title', content: [{ type: 'text', text: `Section ${index}` }] },
              textBlock(),
            ],
          }
        default:
          return textBlock()
      }
    }),
  }
}

describe('EdgelessCanvasView bootstrap', () => {
  let previousResizeObserver: typeof ResizeObserver | undefined
  let wrapper: VueWrapper | null = null
  let view: EditorView | null = null

  beforeEach(() => {
    previousResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    wrapper?.unmount()
    view?.destroy()
    vi.restoreAllMocks()
    document.body.replaceChildren()
    if (previousResizeObserver) globalThis.ResizeObserver = previousResizeObserver
    else delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  })

  it('finishes a 230k-character mixed document bootstrap and renders it as a single frame card', async () => {
    const content = mixedLargeContent()
    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content,
    })
    const pane = document.createElement('div')
    pane.className = 'editor-pane--canvas'
    const editorMount = document.createElement('div')
    pane.appendChild(editorMount)
    document.body.appendChild(pane)

    view = new EditorView(editorMount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        const editorView = view ?? (this as unknown as EditorView)
        editorView.updateState(editorView.state.apply(transaction))
      },
    })
    const measureSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')

    const onMirror = vi.fn()
    wrapper = mount(EdgelessCanvasView, {
      attachTo: pane,
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
      props: {
        noteId: 'large-note',
        workspaceId: 'workspace',
        getEditorView: () => view,
        notes: [{ id: 'linked-note', title: 'Linked roadmap', icon: '🧭' }],
        'onUpdate:mirror': onMirror,
      },
    })

    await vi.waitFor(() => {
      expect(view?.dom.style.getPropertyValue('--canvas-frame-width')).toBeTruthy()
    }, { timeout: 2_000 })
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    expect(onMirror.mock.calls.length).toBeGreaterThan(0)
    expect(onMirror.mock.calls.length).toBeLessThan(5)
    expect(view.state.doc.textContent.length).toBeGreaterThan(230_000)
    expect(onMirror.mock.lastCall?.[0].order).toContain(CANVAS_DOCUMENT_FRAME_ID)
    // The whole point of the single-frame model: no per-block measurement, so
    // bootstrapping a 300-block / 230k-character document does only a
    // handful of layout reads instead of one per top-level block.
    expect(measureSpy.mock.calls.length).toBeLessThan(10)

    expect(view.dom.dataset.canvasFrameAutoheight).toBe('true')

    const rectangleTool = wrapper.get<HTMLButtonElement>('[aria-label="Rectangle"]')
    expect(rectangleTool.attributes('aria-pressed')).toBe('false')
    await rectangleTool.trigger('click')
    expect(rectangleTool.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[role="toolbar"]').attributes('aria-label')).toBe('Canvas tools')

    const noteLinkTool = wrapper.get<HTMLButtonElement>('[aria-label="Linked note"]')
    await noteLinkTool.trigger('click')
    wrapper.get('.edgeless-canvas').element.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0,
      clientX: 180,
      clientY: 160,
      bubbles: true,
    }))
    await nextTick()
    expect(wrapper.get('[role="dialog"]').text()).toContain('Linked roadmap')
    await wrapper.get('[role="option"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper!.get('.canvas-svg-element').text()).toContain('Linked roadmap')
    })
    const latestMirror = onMirror.mock.lastCall?.[0] as CanvasSnapshotV1 | undefined
    const linkedElement = Object.values(latestMirror?.elements ?? {})
      .find(element => element.kind === 'note-link')
    expect(linkedElement).toBeTruthy()
    expect(wrapper.get<HTMLButtonElement>('[aria-label="Select"]').attributes('aria-pressed')).toBe('true')

    const paragraph = nevoBaseSchema.nodes.paragraph.create(
      null,
      nevoBaseSchema.text('Added while Canvas is open'),
    )
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, paragraph))

    // Editing the document no longer touches canvas state at all — frame
    // geometry is fully independent of ProseMirror doc content — so the
    // mirror should not fire again for a plain content edit.
    await new Promise<void>(resolve => setTimeout(resolve, 50))
    expect(onMirror.mock.calls.length).toBeLessThan(5)
  })
})
