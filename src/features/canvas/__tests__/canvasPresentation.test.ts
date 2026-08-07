import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasSnapshotV1 } from '../../../core/canvas'
import { useCanvasPresentation } from '../composables/useCanvasPresentation'

describe('useCanvasPresentation', () => {
  it('orders frames, focuses the selected slide, and supports keyboard navigation', async () => {
    const snapshot = ref<CanvasSnapshotV1>({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: {
        second: {
          id: 'second',
          kind: 'frame',
          title: 'Second',
          presentationOrder: 1,
          x: 1000,
          y: 0,
          width: 960,
          height: 540,
          zIndex: -9,
        },
        first: {
          id: 'first',
          kind: 'frame',
          title: 'First',
          presentationOrder: 0,
          x: 0,
          y: 0,
          width: 960,
          height: 540,
          zIndex: -10,
        },
      },
      connectors: {},
      order: ['first', 'second'],
    })
    const focusFrame = vi.fn()
    let presentation!: ReturnType<typeof useCanvasPresentation>
    const Host = defineComponent({
      setup() {
        presentation = useCanvasPresentation({ snapshot, focusFrame })
        return () => null
      },
    })
    const wrapper = mount(Host)

    expect(presentation.start('second')).toBe(true)
    expect(presentation.current.value?.id).toBe('second')
    expect(focusFrame).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'second' }))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(presentation.current.value?.id).toBe('first')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(presentation.active.value).toBe(false)

    wrapper.unmount()
  })
})
