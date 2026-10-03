import { describe, expect, it, vi } from 'vitest'
import { createSaveQueue } from './saveQueue'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('createSaveQueue', () => {
  it('never lets an older revision overwrite a newer one, even if it would resolve later', async () => {
    const queue = createSaveQueue()
    const runs: number[] = []
    const gate = deferred<void>()

    // First commit starts immediately and blocks on `gate`.
    const first = queue.enqueue('note-1', 1, async (revision) => {
      await gate.promise
      runs.push(revision)
    })

    // A newer revision queues behind it while the first is still in flight.
    const second = queue.enqueue('note-1', 2, async (revision) => {
      runs.push(revision)
    })

    gate.resolve()
    await Promise.all([first, second])

    expect(runs).toEqual([1, 2])
    expect(queue.persistedRevision('note-1')).toBe(2)
  })

  it('coalesces rapid requests that arrive while a commit is in flight into a single follow-up run', async () => {
    const queue = createSaveQueue()
    const commit = vi.fn(async () => {})
    const gate = deferred<void>()

    const gatedCommit = vi.fn(async () => {
      await gate.promise
    })

    const first = queue.enqueue('note-1', 1, gatedCommit)
    // Three more requests arrive in rapid succession while the first is
    // still blocked on `gate` — they must coalesce into one run for the
    // highest revision, not three separate runs.
    const second = queue.enqueue('note-1', 2, commit)
    const third = queue.enqueue('note-1', 3, commit)
    const fourth = queue.enqueue('note-1', 4, commit)

    gate.resolve()
    await Promise.all([first, second, third, fourth])

    // One run for revision 1 (the initial call), one coalesced run for
    // revision 4 (2 and 3 never ran on their own).
    expect(gatedCommit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(4)
    expect(queue.persistedRevision('note-1')).toBe(4)
  })

  it('resolves a request immediately without running its commit once its revision is already persisted', async () => {
    const queue = createSaveQueue()
    await queue.enqueue('note-1', 5, async () => {})
    expect(queue.persistedRevision('note-1')).toBe(5)

    const commit = vi.fn(async () => {})
    await queue.enqueue('note-1', 3, commit)

    expect(commit).not.toHaveBeenCalled()
  })

  it('a failed commit rejects its waiters, does not advance persistedRevision, and does not block later runs', async () => {
    const queue = createSaveQueue()

    await expect(queue.enqueue('note-1', 1, async () => { throw new Error('disk full') }))
      .rejects.toThrow('disk full')
    expect(queue.persistedRevision('note-1')).toBe(0)

    const retry = vi.fn(async () => {})
    await queue.enqueue('note-1', 1, retry)

    expect(retry).toHaveBeenCalledTimes(1)
    expect(queue.persistedRevision('note-1')).toBe(1)
  })

  it('a failure part-way through a coalesced batch still lets the queue move on', async () => {
    const queue = createSaveQueue()
    const gate = deferred<void>()

    const first = queue.enqueue('note-1', 1, async () => {
      await gate.promise
      throw new Error('write failed')
    })
    const second = queue.enqueue('note-1', 2, async () => {})

    gate.resolve()
    await expect(first).rejects.toThrow('write failed')
    await expect(second).resolves.toBeUndefined()
    expect(queue.persistedRevision('note-1')).toBe(2)
  })

  it('runs independent keys in parallel, not serialized against each other', async () => {
    const queue = createSaveQueue()
    const order: string[] = []
    const gateA = deferred<void>()

    const a = queue.enqueue('note-a', 1, async () => {
      order.push('a-start')
      await gateA.promise
      order.push('a-end')
    })
    const b = queue.enqueue('note-b', 1, async () => {
      order.push('b-start')
      order.push('b-end')
    })

    await b
    // note-b's commit completed without waiting for note-a's still-pending one.
    expect(order).toEqual(['a-start', 'b-start', 'b-end'])

    gateA.resolve()
    await a
    expect(order).toEqual(['a-start', 'b-start', 'b-end', 'a-end'])
  })

  it('a request for a key with no history has persistedRevision 0', () => {
    const queue = createSaveQueue()
    expect(queue.persistedRevision('unknown')).toBe(0)
  })

  it('runs the very first request for a key even when its revision is 0', async () => {
    // Revision 0 is also the reported persistedRevision of a brand-new,
    // never-committed key — the queue must not mistake that coincidence for
    // "already satisfied" and skip the commit.
    const queue = createSaveQueue()
    const commit = vi.fn(async () => {})

    await queue.enqueue('note-1', 0, commit)

    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(0)
    expect(queue.persistedRevision('note-1')).toBe(0)
  })
})
