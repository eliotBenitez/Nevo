import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useNotebookToolbarLayout } from './useNotebookToolbarLayout'

interface Layout { width: number; left: number; toolsLeft: number; toolsRight: number; right: number }

describe('useNotebookToolbarLayout', () => {
  let layout: Layout
  let resize: (() => void) | null

  function rect(left: number, right: number): DOMRect {
    return { left, right, width: right - left, top: 0, bottom: 32, height: 32, x: left, y: 0, toJSON: () => ({}) } as DOMRect
  }

  beforeEach(() => {
    resize = null
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect() {}
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('notebook-toolbar__left')) return rect(0, layout.left)
      if (this.classList.contains('notebook-toolbar__tools')) return rect(layout.toolsLeft, layout.toolsRight)
      if (this.classList.contains('notebook-toolbar__right')) return rect(layout.right, layout.width)
      return rect(0, layout.width)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function mountToolbar(content = ref(0)) {
    let api!: ReturnType<typeof useNotebookToolbarLayout>
    const wrapper = mount(defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        api = useNotebookToolbarLayout(root, () => content.value)
        return () => h('header', { ref: root }, [
          h('div', { class: 'notebook-toolbar__left' }),
          h('div', { class: 'notebook-toolbar__tools' }),
          h('div', { class: 'notebook-toolbar__right' }),
        ])
      },
    }), { attachTo: document.body })
    Object.defineProperty(wrapper.element, 'clientWidth', { configurable: true, get: () => layout.width })
    return { wrapper, api, content }
  }

  it('stays single-row when the side groups clear the tools', async () => {
    layout = { width: 1400, left: 450, toolsLeft: 500, toolsRight: 900, right: 1000 }
    const { wrapper, api } = mountToolbar()
    await nextTick(); await nextTick()
    expect(api.compact.value).toBe(false)
    wrapper.unmount()
  })

  it('goes two-row on overlap and returns once the toolbar is wide enough', async () => {
    layout = { width: 1090, left: 500, toolsLeft: 340, toolsRight: 750, right: 760 }
    const { wrapper, api } = mountToolbar()
    await nextTick(); await nextTick()
    expect(api.compact.value).toBe(true)

    // Overflow was 500 + 8 - 340 = 168 px, so the single row needs 1090 + 336 px.
    layout = { width: 1300, left: 500, toolsLeft: 445, toolsRight: 855, right: 870 }
    resize?.()
    await nextTick(); await nextTick()
    expect(api.compact.value).toBe(true)

    layout = { width: 1430, left: 500, toolsLeft: 510, toolsRight: 920, right: 930 }
    resize?.()
    await nextTick(); await nextTick()
    expect(api.compact.value).toBe(false)
    wrapper.unmount()
  })

  it('re-measures when the toolbar content changes', async () => {
    layout = { width: 1400, left: 450, toolsLeft: 500, toolsRight: 900, right: 1000 }
    const { wrapper, api, content } = mountToolbar()
    await nextTick(); await nextTick()
    expect(api.compact.value).toBe(false)
    layout = { ...layout, left: 560 }
    content.value += 1
    await nextTick(); await nextTick(); await nextTick()
    expect(api.compact.value).toBe(true)
    wrapper.unmount()
  })
})
