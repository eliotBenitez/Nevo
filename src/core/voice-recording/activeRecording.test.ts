import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearActiveRecording, finalizeActiveRecording, hasActiveRecording, setActiveRecording } from './activeRecording'

afterEach(() => clearActiveRecording('a'))

describe('activeRecording', () => {
  it('is a no-op when nothing is recording', async () => {
    expect(hasActiveRecording()).toBe(false)
    await expect(finalizeActiveRecording()).resolves.toBeUndefined()
  })

  it('awaits the active finalizer once, even with concurrent callers', async () => {
    let resolve!: () => void
    const finalize = vi.fn(() => new Promise<void>(r => { resolve = r }))
    setActiveRecording('a', finalize)
    const p1 = finalizeActiveRecording()
    const p2 = finalizeActiveRecording()
    resolve()
    await Promise.all([p1, p2])
    expect(finalize).toHaveBeenCalledTimes(1)
  })

  it('clear only removes its own id', () => {
    setActiveRecording('a', async () => {})
    clearActiveRecording('b')
    expect(hasActiveRecording()).toBe(true)
  })

  it('swallows finalizer errors so navigation is never blocked', async () => {
    setActiveRecording('a', async () => { throw new Error('x') })
    await expect(finalizeActiveRecording()).resolves.toBeUndefined()
  })
})
