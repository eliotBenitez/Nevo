import { describe, expect, it, vi } from 'vitest'
import { createAnimationFrameBatcher } from './animationFrameBatcher'

describe('createAnimationFrameBatcher', () => {
  it('coalesces repeated schedules into one callback per frame', () => {
    const callback = vi.fn()
    let pendingFrame: FrameRequestCallback | null = null
    const requestFrame = vi.fn((next: FrameRequestCallback) => {
      pendingFrame = next
      return 7
    })
    const batcher = createAnimationFrameBatcher(callback, {
      requestFrame,
      cancelFrame: vi.fn(),
    })

    batcher.schedule()
    batcher.schedule()
    batcher.schedule()

    expect(requestFrame).toHaveBeenCalledOnce()
    expect(callback).not.toHaveBeenCalled()

    const frame = pendingFrame as FrameRequestCallback | null
    expect(frame).not.toBeNull()
    frame?.(16)

    expect(callback).toHaveBeenCalledOnce()
  })

  it('cancels a scheduled callback', () => {
    const callback = vi.fn()
    const cancelFrame = vi.fn()
    const batcher = createAnimationFrameBatcher(callback, {
      requestFrame: () => 11,
      cancelFrame,
    })

    batcher.schedule()
    batcher.cancel()

    expect(cancelFrame).toHaveBeenCalledWith(11)
    expect(callback).not.toHaveBeenCalled()
  })
})
