import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref, shallowRef } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  createDefaultCanvasFrame,
  type CanvasBounds,
  type CanvasCamera,
  type CanvasConnector,
  type CanvasElement,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { useCanvasQuickConnect } from '../composables/useCanvasQuickConnect'
import type { CanvasTool, CanvasToolStyle } from '../composables/useCanvasToolState'

function stubRaf() {
  const callbacks: FrameRequestCallback[] = []
  let handle = 0
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
    callbacks.push(cb)
    return ++handle
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return {
    flush() {
      const pending = callbacks.splice(0)
      pending.forEach(cb => cb(0))
    },
  }
}

function shape(id: string, x: number, locked?: boolean): CanvasElement {
  return {
    id,
    kind: 'shape',
    shape: 'rectangle',
    x,
    y: 0,
    width: 200,
    height: 100,
    zIndex: 1,
    ...(locked === undefined ? {} : { locked }),
  }
}

function fakePointerDown(pointerId: number, clientX: number, clientY: number): PointerEvent {
  return {
    pointerId,
    clientX,
    clientY,
    preventDefault() {},
  } as unknown as PointerEvent
}

function dispatchPointerMove(pointerId: number, clientX: number, clientY: number) {
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId, clientX, clientY, bubbles: true }))
}

function dispatchPointerUp(pointerId: number, clientX: number, clientY: number) {
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId, clientX, clientY, bubbles: true }))
}

const defaultToolStyle: CanvasToolStyle = {
  element: {},
  connector: { color: '#737373', width: 2, routing: 'straight', startCap: 'none', endCap: 'arrow' },
}

interface MountOptions {
  elements: CanvasElement[]
  selectedIds?: string[]
  enabled?: boolean
  activeTool?: CanvasTool
}

function mountQuickConnect(options: MountOptions) {
  const snapshot = shallowRef<CanvasSnapshotV1>({
    version: 1,
    frame: createDefaultCanvasFrame(),
    elements: Object.fromEntries(options.elements.map(element => [element.id, element])),
    connectors: {},
    order: options.elements.map(element => element.id),
  })
  const camera: CanvasCamera = { x: 0, y: 0, zoom: 1 }
  const viewportEl = document.createElement('div')
  // jsdom does not implement pointer capture; the composable calls it
  // unconditionally when starting a drag, so it needs a no-op stub here.
  viewportEl.setPointerCapture = vi.fn()
  viewportEl.releasePointerCapture = vi.fn()
  const addConnector = vi.fn((_connector: Omit<CanvasConnector, 'id' | 'zIndex'>) => 'connector-1')
  const select = vi.fn()
  const selectedIds = ref<readonly string[]>(options.selectedIds ?? [])
  const enabled = ref(options.enabled ?? true)
  const activeTool = ref<CanvasTool>(options.activeTool ?? 'select')
  const toolStyle = ref<CanvasToolStyle>(defaultToolStyle)

  const captured: { api: ReturnType<typeof useCanvasQuickConnect> | null } = { api: null }
  const Host = defineComponent({
    setup() {
      captured.api = useCanvasQuickConnect({
        snapshot,
        camera,
        effectiveFrame: shallowRef<CanvasBounds>({ x: 0, y: 0, width: 1000, height: 400 }),
        viewport: ref(viewportEl),
        activeTool,
        selectedIds,
        enabled,
        toolStyle,
        addConnector,
        select,
      })
      return () => null
    },
  })
  const wrapper = mount(Host)
  if (!captured.api) throw new Error('useCanvasQuickConnect did not initialize inside test host component')
  return { wrapper, api: captured.api, addConnector, select }
}

describe('useCanvasQuickConnect', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
  })

  it('creates a connector bound to source and target when dragging from an anchor onto a second element', () => {
    const mounted = mountQuickConnect({ elements: [shape('a', 0), shape('b', 600)], selectedIds: ['a'] })
    wrapper = mounted.wrapper

    // 'right' anchor of a: bounds x0 y0 w200 h100 -> {x:200, y:50}
    mounted.api.onAnchorPointerDown('right', fakePointerDown(1, 200, 50))
    dispatchPointerMove(1, 600, 50)
    dispatchPointerUp(1, 600, 50)

    expect(mounted.addConnector).toHaveBeenCalledTimes(1)
    const call = mounted.addConnector.mock.calls[0][0]
    expect(call.from.binding).toMatchObject({ target: 'element', targetId: 'a' })
    expect(call.to.binding).toMatchObject({ target: 'element', targetId: 'b' })
    expect(mounted.select).toHaveBeenCalledWith('connector-1')
    expect(mounted.api.draft.value).toBeNull()
  })

  it('creates nothing when the drag is released over empty canvas', () => {
    const mounted = mountQuickConnect({ elements: [shape('a', 0), shape('b', 600)], selectedIds: ['a'] })
    wrapper = mounted.wrapper

    mounted.api.onAnchorPointerDown('right', fakePointerDown(1, 200, 50))
    dispatchPointerMove(1, 5000, 5000)
    dispatchPointerUp(1, 5000, 5000)

    expect(mounted.addConnector).not.toHaveBeenCalled()
    expect(mounted.api.draft.value).toBeNull()
  })

  it('creates nothing when the drag is released back on the source element', () => {
    const mounted = mountQuickConnect({ elements: [shape('a', 0), shape('b', 600)], selectedIds: ['a'] })
    wrapper = mounted.wrapper

    mounted.api.onAnchorPointerDown('right', fakePointerDown(1, 200, 50))
    dispatchPointerMove(1, 100, 50)
    dispatchPointerUp(1, 100, 50)

    expect(mounted.addConnector).not.toHaveBeenCalled()
  })

  it('creates nothing for a drag shorter than the minimum connect distance', () => {
    const mounted = mountQuickConnect({ elements: [shape('a', 0), shape('b', 600)], selectedIds: ['a'] })
    wrapper = mounted.wrapper

    mounted.api.onAnchorPointerDown('right', fakePointerDown(1, 200, 50))
    dispatchPointerMove(1, 203, 51)
    dispatchPointerUp(1, 203, 51)

    expect(mounted.addConnector).not.toHaveBeenCalled()
  })

  it('cancels the gesture on Escape and creates nothing', () => {
    const mounted = mountQuickConnect({ elements: [shape('a', 0), shape('b', 600)], selectedIds: ['a'] })
    wrapper = mounted.wrapper

    mounted.api.onAnchorPointerDown('right', fakePointerDown(1, 200, 50))
    dispatchPointerMove(1, 600, 50)
    expect(mounted.api.draft.value).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(mounted.api.draft.value).toBeNull()

    dispatchPointerUp(1, 600, 50)
    expect(mounted.addConnector).not.toHaveBeenCalled()
  })

  it('exposes four side midpoints for the hovered element and hides anchors for a locked element', () => {
    const raf = stubRaf()
    const mounted = mountQuickConnect({ elements: [shape('a', 0), shape('locked', 600, true)] })
    wrapper = mounted.wrapper

    dispatchPointerMove(1, 100, 50)
    raf.flush()

    expect(mounted.api.hoveredId.value).toBe('a')
    expect(mounted.api.anchorObject.value).toMatchObject({ id: 'a' })
    expect(mounted.api.anchors.value).toEqual([
      { side: 'top', point: { x: 100, y: 0 } },
      { side: 'right', point: { x: 200, y: 50 } },
      { side: 'bottom', point: { x: 100, y: 100 } },
      { side: 'left', point: { x: 0, y: 50 } },
    ])

    dispatchPointerMove(1, 700, 50)
    raf.flush()
    expect(mounted.api.anchorObject.value).toBeNull()
  })

  it('falls back to the single selected element when nothing is hovered', () => {
    const mounted = mountQuickConnect({ elements: [shape('a', 0)], selectedIds: ['a'] })
    wrapper = mounted.wrapper

    expect(mounted.api.anchorObject.value).toMatchObject({ id: 'a' })
  })

  it('starts no gesture when disabled, even if an anchor pointerdown fires', () => {
    const mounted = mountQuickConnect({ elements: [shape('a', 0), shape('b', 600)], selectedIds: ['a'], enabled: false })
    wrapper = mounted.wrapper

    expect(mounted.api.anchorObject.value).toBeNull()

    mounted.api.onAnchorPointerDown('right', fakePointerDown(1, 200, 50))
    dispatchPointerMove(1, 600, 50)
    dispatchPointerUp(1, 600, 50)

    expect(mounted.addConnector).not.toHaveBeenCalled()
    expect(mounted.api.draft.value).toBeNull()
  })
})
