import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createViewportRenderController } from '../node-views/viewportRenderController'
import { createViewportRenderBudget } from '../node-views/viewportRenderBudget'

interface ObserverRecord {
  callback: IntersectionObserverCallback
  options?: IntersectionObserverInit
  observe: (target: Element) => void
  disconnect: () => void
}

let observers: ObserverRecord[] = []
let pendingFrames = new Map<number, FrameRequestCallback>()
let nextFrame = 1

beforeEach(() => {
  vi.useFakeTimers()
  observers = []
  pendingFrames = new Map()
  nextFrame = 1

  vi.stubGlobal('IntersectionObserver', class {
    private record: ObserverRecord

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.record = {
        callback,
        options,
        observe: vi.fn(),
        disconnect: vi.fn(),
      }
      observers.push(this.record)
    }

    observe = (target: Element) => this.record.observe(target)
    disconnect = () => this.record.disconnect()
    unobserve = vi.fn()
    takeRecords = () => []
    root = null
    rootMargin = ''
    thresholds = []
  })
  vi.stubGlobal('ResizeObserver', undefined)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const handle = nextFrame++
    pendingFrames.set(handle, callback)
    return handle
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
    pendingFrames.delete(handle)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function createHarness(
  render = vi.fn(),
  budget = createViewportRenderBudget(0),
  rootRect?: DOMRect,
) {
  const root = document.createElement('div')
  root.className = 'doc-body'
  const dom = document.createElement('div')
  root.append(dom)
  document.body.append(root)
  Object.defineProperty(dom, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 400, 240),
  })
  if (rootRect) {
    Object.defineProperty(root, 'getBoundingClientRect', {
      configurable: true,
      value: () => rootRect,
    })
  }
  const suspend = vi.fn()
  const controller = createViewportRenderController(dom, {
    render,
    suspend,
    initialPlaceholderHeight: 180,
    suspendDelayMs: 500,
    budget,
  })
  await Promise.resolve()
  return { root, dom, render, suspend, controller }
}

function emitIntersection(isIntersecting: boolean) {
  observers[0]?.callback([
    {
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
    } as IntersectionObserverEntry,
  ], {} as IntersectionObserver)
}

function runNextFrame(timestamp = 16) {
  const next = pendingFrames.entries().next().value as [number, FrameRequestCallback] | undefined
  if (!next) return
  pendingFrames.delete(next[0])
  next[1](timestamp)
}

describe('createViewportRenderController', () => {
  it('renders a measured near-viewport block before the first observer event', async () => {
    const render = vi.fn()
    const { controller } = await createHarness(
      render,
      createViewportRenderBudget(0),
      new DOMRect(0, 0, 800, 600),
    )

    expect(controller.isActive()).toBe(true)
    expect(render).toHaveBeenCalledOnce()
  })

  it('renders inside a buffered editor viewport and suspends later with stable height', async () => {
    const { root, dom, render, suspend, controller } = await createHarness()

    expect(observers[0]?.options?.root).toBe(root)
    expect(observers[0]?.options?.rootMargin).toBe('225% 0px')
    expect(dom.style.minHeight).toBe('180px')

    emitIntersection(true)
    await Promise.resolve()

    expect(controller.isActive()).toBe(true)
    expect(render).toHaveBeenCalledOnce()
    expect(dom.dataset.viewportRenderState).toBe('warming')
    expect(dom.style.minHeight).toBe('180px')

    runNextFrame()
    expect(dom.dataset.viewportRenderState).toBe('warming')
    runNextFrame()
    expect(dom.dataset.viewportRenderState).toBe('active')
    expect(dom.style.minHeight).toBe('')

    emitIntersection(false)
    vi.advanceTimersByTime(499)
    expect(suspend).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(suspend).toHaveBeenCalledOnce()
    expect(controller.isActive()).toBe(false)
    expect(dom.style.minHeight).toBe('240px')
    expect(dom.dataset.viewportRenderState).toBe('suspended')
  })

  it('keeps selected node views active while they are offscreen', async () => {
    const { dom, suspend, controller } = await createHarness()
    emitIntersection(true)
    await Promise.resolve()
    dom.classList.add('ProseMirror-selectednode')

    emitIntersection(false)
    vi.advanceTimersByTime(500)

    expect(suspend).not.toHaveBeenCalled()
    expect(controller.isActive()).toBe(true)

    dom.classList.remove('ProseMirror-selectednode')
    vi.advanceTimersByTime(500)

    expect(suspend).toHaveBeenCalledOnce()
    expect(controller.isActive()).toBe(false)
  })

  it('keeps a recent offscreen preview warm until the LRU budget evicts it', async () => {
    const budget = createViewportRenderBudget(1)
    const { suspend, controller } = await createHarness(vi.fn(), budget)
    emitIntersection(true)
    await Promise.resolve()
    emitIntersection(false)
    vi.advanceTimersByTime(500)

    expect(suspend).not.toHaveBeenCalled()
    expect(controller.isActive()).toBe(true)

    budget.retain({}, () => true)

    expect(suspend).toHaveBeenCalledOnce()
    expect(controller.isActive()).toBe(false)
  })

  it('renders again after re-entering while an earlier render is still finishing', async () => {
    let finishFirstRender = () => {}
    const render = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishFirstRender = resolve
      }))
    const { controller } = await createHarness(render)

    emitIntersection(true)
    await Promise.resolve()
    emitIntersection(false)
    vi.advanceTimersByTime(500)
    emitIntersection(true)
    await Promise.resolve()

    expect(controller.isActive()).toBe(true)
    expect(render).toHaveBeenCalledOnce()

    finishFirstRender()
    await Promise.resolve()
    await Promise.resolve()

    expect(render).toHaveBeenCalledTimes(2)
  })

  it('disconnects observers and cancels pending work on destroy', async () => {
    const { controller } = await createHarness()
    emitIntersection(true)
    await Promise.resolve()

    controller.destroy()

    expect(observers[0]?.disconnect).toHaveBeenCalledOnce()
    expect(pendingFrames.size).toBe(0)
  })
})
