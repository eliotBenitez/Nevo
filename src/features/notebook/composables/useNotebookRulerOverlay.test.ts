import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../../../core/notebook/codec'
import { useNotebookRulerOverlay } from './useNotebookRulerOverlay'

describe('notebook ruler overlay placement', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('centers on the visible page, keeps handles reachable on resize, and stops observing on unmount', () => {
    let resize = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
    const page = createNotebook().pages[0]!
    const beforeToggle = vi.fn()
    const wrapper = mount(defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null), scroller = ref<HTMLElement | null>(null)
        const overlay = useNotebookRulerOverlay({ root, scroller, page: () => page, zoom: () => 2,
          inputActive: () => false, beforeToggle })
        return { root, scroller, ...overlay, pageId: page.id }
      },
      template: '<section ref="root"><main ref="scroller"><div :data-page-id="pageId"><svg class="notebook-page" /></div></main></section>',
    }))
    vi.spyOn(wrapper.get('svg').element, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 1300, top: 200, bottom: 1880, width: 1200, height: 1680 } as DOMRect)
    let width = 320
    vi.spyOn(wrapper.get('main').element, 'getBoundingClientRect').mockImplementation(() => ({ left: 100, right: 100 + width, top: 200, bottom: 600, width, height: 400 }) as DOMRect)
    expect(wrapper.vm.open).toBe(false)
    wrapper.vm.toggle()
    expect(wrapper.vm.pose).toEqual({ x: 80, y: 100, angle: 0 })
    wrapper.vm.pose = { x: 200, y: 200, angle: 30 }
    width = 200
    wrapper.vm.active = true
    resize()
    expect(wrapper.vm.pose.x).toBe(200)
    wrapper.vm.active = false
    resize()
    expect(wrapper.vm.pose).toEqual({ x: 69, y: 169, angle: 30 })
    wrapper.vm.toggle()
    expect(wrapper.vm.open).toBe(false)
    expect(beforeToggle).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
