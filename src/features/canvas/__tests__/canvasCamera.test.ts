import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useCanvasCamera } from '../composables/useCanvasCamera'

function stubRaf() {
  const callbacks: FrameRequestCallback[] = []
  let handle = 0
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
    callbacks.push(cb)
    return ++handle
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return {
    pendingCount: () => callbacks.length,
    flush() {
      const pending = callbacks.splice(0)
      pending.forEach(cb => cb(0))
    },
  }
}

function mountCamera() {
  const captured: { api: ReturnType<typeof useCanvasCamera> | null } = { api: null }
  const Host = defineComponent({
    setup() {
      captured.api = useCanvasCamera('workspace-1', 'note-1')
      return () => null
    },
  })
  const wrapper = mount(Host)
  const api = captured.api
  if (!api) throw new Error('useCanvasCamera did not initialize inside test host component')
  return { wrapper, api }
}

describe('useCanvasCamera', () => {
  let wrapper: VueWrapper | null = null
  let raf: ReturnType<typeof stubRaf>

  beforeEach(() => {
    localStorage.clear()
    raf = stubRaf()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('mutates camera synchronously on each panBy call, batches them into one rAF, and leaves cameraView stale until the frame runs', () => {
    const mounted = mountCamera()
    wrapper = mounted.wrapper
    const { camera, cameraView, panBy } = mounted.api
    const initial = { x: camera.x, y: camera.y, zoom: camera.zoom }

    panBy({ x: 10, y: 5 })
    const afterFirst = { x: camera.x, y: camera.y }
    expect(afterFirst).not.toEqual({ x: initial.x, y: initial.y })
    expect(cameraView.x).toBe(initial.x)
    expect(cameraView.y).toBe(initial.y)

    panBy({ x: 20, y: -5 })
    const afterSecond = { x: camera.x, y: camera.y }
    expect(afterSecond).not.toEqual(afterFirst)
    // Still untouched — several live mutations happened but no frame has run yet.
    expect(cameraView.x).toBe(initial.x)
    expect(cameraView.y).toBe(initial.y)

    // Both panBy calls landed in the same animation frame.
    expect(raf.pendingCount()).toBe(1)

    raf.flush()

    expect(cameraView.x).toBe(camera.x)
    expect(cameraView.y).toBe(camera.y)
    expect(cameraView.zoom).toBe(camera.zoom)
  })

  it('runs registered onCameraFrame callbacks inside the same batched frame', () => {
    const mounted = mountCamera()
    wrapper = mounted.wrapper
    const { panBy, onCameraFrame } = mounted.api
    const callback = vi.fn()
    onCameraFrame(callback)

    panBy({ x: 1, y: 1 })
    panBy({ x: 1, y: 1 })
    expect(callback).not.toHaveBeenCalled()

    raf.flush()

    expect(callback).toHaveBeenCalledTimes(1)
  })
})
