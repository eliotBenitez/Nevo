import { afterEach, describe, expect, it, vi } from 'vitest'
import { swallowNextClick } from './pointerDrag'

describe('swallowNextClick', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('swallows only the next click', () => {
    swallowNextClick()
    const first = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(first)
    const second = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(second)

    expect(first.defaultPrevented).toBe(true)
    expect(second.defaultPrevented).toBe(false)
  })

  it('expires without throwing after the global window is gone', () => {
    vi.useFakeTimers()
    swallowNextClick()
    vi.stubGlobal('window', undefined)

    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
  })
})
