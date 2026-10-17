import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useCanvasCreationGestures } from '../composables/useCanvasCreationGestures'
import type { CanvasTool } from '../composables/useCanvasToolState'

function setup(tool: CanvasTool) {
  const select = vi.fn()
  const clearSelection = vi.fn()
  const onEditText = vi.fn()
  const viewport = document.createElement('div')
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect
  viewport.setPointerCapture = vi.fn()
  let api!: ReturnType<typeof useCanvasCreationGestures>
  const wrapper = mount(defineComponent({
    setup() {
      api = useCanvasCreationGestures({
        activeTool: ref(tool),
        toolStyle: ref({ element: {}, connector: {} }) as never,
        snapshot: ref({ elements: {}, connectors: {} }) as never,
        effectiveFrame: ref({ x: 0, y: 0, width: 800, height: 600 }),
        camera: { x: 0, y: 0, zoom: 1 },
        viewport: ref(viewport),
        actions: {
          addShape: () => 'shape-1',
          addTextElement: () => 'text-1',
          addStroke: () => 'stroke-1',
        } as never,
        select,
        clearSelection,
        onEditText,
        onEditRichText: vi.fn(),
        onRequestImage: vi.fn(),
        onRequestNoteLink: vi.fn(),
        returnToSelect: vi.fn(),
        frameTitle: 'Frame',
      })
      return () => h('div')
    },
  }), { attachTo: document.body })
  const draw = () => {
    const init = { pointerId: 1, button: 0, clientX: 10, clientY: 10 }
    api.onPointerDown(new PointerEvent('pointerdown', init))
    window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: 80, clientY: 60 }))
    window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: 80, clientY: 60 }))
  }
  return { draw, select, clearSelection, onEditText, wrapper }
}

describe('useCanvasCreationGestures', () => {
  it.each<CanvasTool>(['pen', 'rectangle'])('does not select the item created with %s', (tool) => {
    const { draw, select, clearSelection, wrapper } = setup(tool)
    draw()
    expect(select).not.toHaveBeenCalled()
    expect(clearSelection).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('selects new text so it can be edited immediately', () => {
    const { draw, select, onEditText, wrapper } = setup('text')
    draw()
    expect(select).toHaveBeenCalledWith('text-1')
    expect(onEditText).toHaveBeenCalledWith('text-1')
    wrapper.unmount()
  })
})
