import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive, ref, shallowRef } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createDefaultCanvasFrame, type CanvasBounds, type CanvasSnapshotV1 } from '../../../core/canvas'
import { useCanvasPointerInteraction } from '../composables/useCanvasPointerInteraction'

function snapshot(): CanvasSnapshotV1 {
  return { version: 1, frame: createDefaultCanvasFrame(), elements: {}, connectors: {}, order: [] }
}

function mountInteraction() {
  const panBy = vi.fn()
  const zoomAt = vi.fn()
  const viewport = ref<HTMLDivElement | null>(document.createElement('div'))
  // jsdom reports a zero rect for a detached node; the composable caches this
  // on mount, so stub it to a realistic viewport.
  viewport.value!.getBoundingClientRect = () => ({
    left: 20, top: 10, width: 800, height: 600, right: 820, bottom: 610, x: 20, y: 10, toJSON: () => ({}),
  }) as DOMRect

  const captured: { api: ReturnType<typeof useCanvasPointerInteraction> | null } = { api: null }
  const Host = defineComponent({
    setup() {
      captured.api = useCanvasPointerInteraction({
        snapshot: shallowRef(snapshot()),
        camera: { x: 0, y: 0, zoom: 1 },
        cameraView: reactive({ x: 0, y: 0, zoom: 1 }),
        effectiveFrame: shallowRef<CanvasBounds>({ x: 0, y: 0, width: 900, height: 1200 }),
        viewport,
        selectedIds: ref([]),
        spacePressed: ref(false),
        marquee: ref(null),
        elementDrafts: reactive({}),
        actions: {
          moveFrame: vi.fn(),
          previewFrame: vi.fn(),
          resizeFrame: vi.fn(),
          moveElement: vi.fn(),
          resizeElement: vi.fn(),
        },
        getEditorView: () => null,
        panBy,
        zoomAt,
        publishSelection: vi.fn(),
        publishCursor: vi.fn(),
      })
      return () => null
    },
  })
  const wrapper = mount(Host)
  if (!captured.api) throw new Error('useCanvasPointerInteraction did not initialize')
  return { wrapper, api: captured.api, panBy, zoomAt }
}

function wheel(init: Partial<WheelEventInit>): WheelEvent {
  return new WheelEvent('wheel', { cancelable: true, clientX: 420, clientY: 310, ...init })
}

describe('useCanvasPointerInteraction wheel', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  // WebKitGTK reports DOM_DELTA_LINE with a delta of a few units. A zoom step
  // derived from the delta magnitude resolves to a fraction of a percent there,
  // which reads as "the wheel does not zoom at all".
  it('zooms a line-mode wheel by a fixed step, without a modifier', () => {
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    const event = wheel({ deltaY: -3, deltaMode: WheelEvent.DOM_DELTA_LINE })
    mounted.api.onWheel(event)

    expect(mounted.zoomAt).toHaveBeenLastCalledWith({ x: 400, y: 300 }, 1.1)
    expect(mounted.panBy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('zooms out on a large quantized pixel wheel step', () => {
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    mounted.api.onWheel(wheel({ deltaY: 120, deltaMode: WheelEvent.DOM_DELTA_PIXEL }))

    expect(mounted.zoomAt).toHaveBeenLastCalledWith({ x: 400, y: 300 }, 0.9)
    expect(mounted.panBy).not.toHaveBeenCalled()
  })

  it('pans a trackpad scroll — small pixel deltas with a horizontal component', () => {
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    mounted.api.onWheel(wheel({ deltaX: 4, deltaY: -12 }))

    expect(mounted.panBy).toHaveBeenCalledWith({ x: -4, y: 12 })
    expect(mounted.zoomAt).not.toHaveBeenCalled()
  })

  // Later events in a fast two-finger flick can carry wheel-sized deltas; the
  // gesture must not flip to zoom halfway through.
  it('holds the pan decision for the rest of a trackpad burst', () => {
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    mounted.api.onWheel(wheel({ deltaX: 2, deltaY: -6 }))
    mounted.api.onWheel(wheel({ deltaX: 0, deltaY: -140 }))

    expect(mounted.zoomAt).not.toHaveBeenCalled()
    // `-0` is just the negation of a zero deltaX; it pans by nothing.
    expect(mounted.panBy).toHaveBeenLastCalledWith({ x: -0, y: 140 })
  })

  it('re-classifies once the burst goes idle', () => {
    vi.useFakeTimers()
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    mounted.api.onWheel(wheel({ deltaX: 2, deltaY: -6 }))
    expect(mounted.panBy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(400)
    mounted.api.onWheel(wheel({ deltaY: -3, deltaMode: WheelEvent.DOM_DELTA_LINE }))

    expect(mounted.zoomAt).toHaveBeenCalledTimes(1)
  })

  it('zooms with ctrl even on trackpad-shaped deltas (pinch)', () => {
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    mounted.api.onWheel(wheel({ deltaX: 1, deltaY: -4, ctrlKey: true }))

    expect(mounted.zoomAt).toHaveBeenLastCalledWith({ x: 400, y: 300 }, 1.1)
    expect(mounted.panBy).not.toHaveBeenCalled()
  })

  it('pans horizontally with shift, normalizing line deltas to pixels', () => {
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    mounted.api.onWheel(wheel({ deltaY: -3, deltaMode: WheelEvent.DOM_DELTA_LINE, shiftKey: true }))

    expect(mounted.zoomAt).not.toHaveBeenCalled()
    expect(mounted.panBy).toHaveBeenCalledWith({ x: 48, y: 0 })
  })

  it('ignores a wheel event with no delta', () => {
    const mounted = mountInteraction()
    wrapper = mounted.wrapper

    mounted.api.onWheel(wheel({ deltaY: 0, deltaX: 0 }))

    expect(mounted.zoomAt).not.toHaveBeenCalled()
    expect(mounted.panBy).not.toHaveBeenCalled()
  })
})
