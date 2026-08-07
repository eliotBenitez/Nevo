import { describe, expect, it, vi } from 'vitest'
import { createIdleTaskScheduler } from './idleTaskScheduler'

describe('createIdleTaskScheduler', () => {
  it('coalesces delayed work and waits for the idle callback', () => {
    const task = vi.fn()
    const delayed = new Map<number, () => void>()
    const idle = new Map<number, () => void>()
    let nextHandle = 1
    const scheduler = createIdleTaskScheduler(task, {
      delayMs: 250,
      idleTimeoutMs: 900,
      timing: {
        setTimeout: (callback) => {
          const handle = nextHandle++
          delayed.set(handle, callback)
          return handle
        },
        clearTimeout: (handle) => delayed.delete(handle),
        requestIdleCallback: (callback, timeoutMs) => {
          expect(timeoutMs).toBe(900)
          const handle = nextHandle++
          idle.set(handle, callback)
          return handle
        },
        cancelIdleCallback: (handle) => idle.delete(handle),
      },
    })

    scheduler.schedule()
    scheduler.schedule()

    expect(delayed.size).toBe(1)
    const delayedCallback = [...delayed.values()][0]
    delayed.clear()
    delayedCallback?.()
    expect(task).not.toHaveBeenCalled()

    const idleCallback = [...idle.values()][0]
    idle.clear()
    idleCallback?.()

    expect(task).toHaveBeenCalledOnce()
    expect(scheduler.isPending()).toBe(false)
  })

  it('flushes synchronously and cancels pending host work', () => {
    const task = vi.fn()
    const clearTimeout = vi.fn()
    const scheduler = createIdleTaskScheduler(task, {
      delayMs: 250,
      timing: {
        setTimeout: () => 7,
        clearTimeout,
      },
    })

    scheduler.schedule()

    expect(scheduler.flush()).toBe(true)
    expect(task).toHaveBeenCalledOnce()
    expect(clearTimeout).toHaveBeenCalledWith(7)
    expect(scheduler.flush()).toBe(false)
  })
})
