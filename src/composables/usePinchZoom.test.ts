import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { usePinchZoom, type PinchZoomUpdate } from './usePinchZoom'

function pointerEvent(
  type: string,
  input: { pointerId: number; pointerType?: string; clientX: number; clientY: number },
) {
  const EventCtor = window.PointerEvent ?? window.MouseEvent
  const event = new EventCtor(type, {
    bubbles: true,
    cancelable: true,
    clientX: input.clientX,
    clientY: input.clientY,
  }) as PointerEvent
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: input.pointerId },
    pointerType: { configurable: true, value: input.pointerType ?? 'touch' },
  })
  return event
}

function mountPinchHarness(callbacks: {
  onStart?: () => void
  onUpdate: (update: PinchZoomUpdate) => void
  onEnd?: () => void
  onPointerDown?: () => void
}) {
  const Harness = defineComponent({
    setup() {
      const target = ref<HTMLDivElement | null>(null)
      usePinchZoom({
        target,
        onStart: callbacks.onStart,
        onUpdate: callbacks.onUpdate,
        onEnd: callbacks.onEnd,
      })
      return { target }
    },
    methods: {
      onPointerDown: callbacks.onPointerDown ?? (() => {}),
    },
    template: '<div ref="target" class="target" @pointerdown="onPointerDown" />',
  })
  return mount(Harness)
}

describe('usePinchZoom', () => {
  it('reports two-finger pan and zoom around the local gesture center', async () => {
    const onStart = vi.fn()
    const onUpdate = vi.fn<(update: PinchZoomUpdate) => void>()
    const onEnd = vi.fn()
    const onPointerDown = vi.fn()
    const wrapper = mountPinchHarness({ onStart, onUpdate, onEnd, onPointerDown })
    await nextTick()
    const target = wrapper.get('.target').element as HTMLDivElement
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 410,
      bottom: 320,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    })

    target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 110, clientY: 120 }))
    target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 210, clientY: 120 }))
    target.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 310, clientY: 120 }))

    expect(onStart).toHaveBeenCalledOnce()
    expect(onPointerDown).toHaveBeenCalledOnce()
    expect(onUpdate).toHaveBeenCalledWith({
      center: { x: 200, y: 100 },
      panDelta: { x: 50, y: 0 },
      scaleFactor: 2,
    })

    target.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 310, clientY: 120 }))
    target.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 110, clientY: 120 }))
    expect(onEnd).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('leaves single-touch and mouse input to the surface handlers', async () => {
    const onUpdate = vi.fn()
    const onPointerDown = vi.fn()
    const wrapper = mountPinchHarness({ onUpdate, onPointerDown })
    await nextTick()
    const target = wrapper.get('.target').element

    target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 20, clientY: 30 }))
    target.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 20, clientY: 30 }))
    target.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 30,
    }))

    expect(onPointerDown).toHaveBeenCalledTimes(2)
    expect(onUpdate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
