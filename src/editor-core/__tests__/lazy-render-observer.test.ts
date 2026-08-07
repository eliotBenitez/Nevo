import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLazyRenderObserver } from '../node-views/utils'

const disconnect = vi.fn()

beforeEach(() => {
  disconnect.mockClear()
  vi.stubGlobal('IntersectionObserver', class {
    constructor() {}
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = disconnect
    takeRecords = () => []
    root = null
    rootMargin = ''
    thresholds = []
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('createLazyRenderObserver', () => {
  it('renders a measured visible node when the observer has not emitted', async () => {
    const dom = document.createElement('span')
    document.body.append(dom)
    Object.defineProperty(dom, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 100, 80, 24),
    })
    const onVisible = vi.fn()

    createLazyRenderObserver(dom, onVisible)
    await Promise.resolve()

    expect(onVisible).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('keeps a distant node deferred', async () => {
    const dom = document.createElement('span')
    document.body.append(dom)
    Object.defineProperty(dom, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, window.innerHeight + 1_000, 80, 24),
    })
    const onVisible = vi.fn()

    const observer = createLazyRenderObserver(dom, onVisible)
    await Promise.resolve()

    expect(onVisible).not.toHaveBeenCalled()
    observer.disconnect()
  })
})
