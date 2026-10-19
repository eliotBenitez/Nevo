import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { nevoBaseSchema as schema } from '../../../editor-core/schema'
import { useEditorOutline } from './useEditorOutline'

const heading = (text: string) => schema.node('heading', { level: 2 }, [schema.text(text)])
const paragraph = (text: string) => schema.node('paragraph', null, [schema.text(text)])

/** A view stand-in whose nodeDOM returns a laid-out element per heading position. */
function fakeView(initial: ProseMirrorNode) {
  const elements = new Map<number, HTMLElement>()
  const view = {
    state: { doc: initial },
    nodeDOM: (pos: number) => {
      const node = view.state.doc.nodeAt(pos)
      if (node?.type.name !== 'heading') return null
      if (!elements.has(pos)) {
        const el = document.createElement('h2')
        el.textContent = node.textContent
        el.getClientRects = () => [{}] as unknown as DOMRectList
        el.scrollIntoView = vi.fn()
        elements.set(pos, el)
      }
      return elements.get(pos)!
    },
  }
  return view
}

function setup(view: ReturnType<typeof fakeView>) {
  let outline!: ReturnType<typeof useEditorOutline>
  const scrollEl = document.createElement('div')
  const wrapper = mount(defineComponent({
    setup() {
      outline = useEditorOutline({ getView: () => view as unknown as EditorView, getScrollEl: () => scrollEl })
      return () => h('div')
    },
  }))
  return { outline, wrapper }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useEditorOutline', () => {
  it('scrolls to the clicked heading even when an edit moved it before the debounced refresh', () => {
    const view = fakeView(schema.node('doc', null, [heading('Intro'), heading('Plan')]))
    const { outline, wrapper } = setup(view)
    outline.refreshNow()
    const planIndex = outline.items.value.findIndex(item => item.text === 'Plan')

    view.state.doc = schema.node('doc', null, [paragraph('New text above'), heading('Intro'), heading('Plan')])
    outline.scrollToHeading(planIndex)

    const planPos = outline.items.value.find(item => item.text === 'Plan')!.pos
    expect(view.nodeDOM(planPos)!.scrollIntoView).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('measures headings at most once per animation frame while scrolling', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const view = fakeView(schema.node('doc', null, [heading('Intro')]))
    const { outline, wrapper } = setup(view)
    outline.refreshNow()

    outline.updateActive()
    outline.updateActive()
    outline.updateActive()
    expect(frames).toHaveLength(1)
    frames[0](0)
    outline.updateActive()
    expect(frames).toHaveLength(2)
    wrapper.unmount()
  })
})
