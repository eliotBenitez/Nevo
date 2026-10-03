import { describe, expect, it, vi } from 'vitest'
import { FindMatchesClient } from './findMatchesClient'
import type { FindMatchesWorkerRequest, FindMatchesWorkerResponse } from './findMatchesWorker'
import type { FindQuery } from './findMatches'

function query(overrides: Partial<FindQuery> = {}): FindQuery {
  return { text: 'cat', caseSensitive: false, wholeWord: false, regex: true, ...overrides }
}

/** A fake `Worker` that never touches real threads: `respond` lets a test
 *  drive `onmessage` directly, and a "stuck" worker simply never responds,
 *  which is enough to exercise the client's timeout path. */
class FakeWorker {
  onmessage: ((event: MessageEvent<FindMatchesWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  posted: FindMatchesWorkerRequest[] = []
  terminated = false

  postMessage(message: FindMatchesWorkerRequest) {
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

  respond(response: FindMatchesWorkerResponse) {
    this.onmessage?.(new MessageEvent('message', { data: response }))
  }
}

describe('FindMatchesClient', () => {
  it('resolves with the worker result on success', async () => {
    let fake!: FakeWorker
    const client = new FindMatchesClient(() => {
      fake = new FakeWorker()
      return fake as unknown as Worker
    })

    const promise = client.requestMatches([{ text: 'cat cat', start: 0 }], query(), 100)
    expect(fake.posted).toHaveLength(1)
    fake.respond({ id: fake.posted[0].id, matches: [{ from: 0, to: 3 }], error: false, truncated: false })

    const outcome = await promise
    expect(outcome).toEqual({ matches: [{ from: 0, to: 3 }], error: false, truncated: false, timedOut: false })
    expect(fake.terminated).toBe(false)
  })

  it('discards a response for a request that is no longer pending', async () => {
    let fake!: FakeWorker
    const client = new FindMatchesClient(() => {
      fake = new FakeWorker()
      return fake as unknown as Worker
    })

    const promise = client.requestMatches([{ text: 'cat', start: 0 }], query(), 100)
    // A stray response for an id that was never requested (or already
    // resolved) must not throw and must not resolve anything.
    fake.respond({ id: 9999, matches: [], error: false, truncated: false })
    fake.respond({ id: fake.posted[0].id, matches: [{ from: 0, to: 3 }], error: false, truncated: false })

    await expect(promise).resolves.toEqual({ matches: [{ from: 0, to: 3 }], error: false, truncated: false, timedOut: false })
  })

  it('terminates the worker and resolves as timed out when the deadline passes', async () => {
    vi.useFakeTimers()
    try {
      let fake!: FakeWorker
      const client = new FindMatchesClient(() => {
        fake = new FakeWorker()
        return fake as unknown as Worker
      })

      const promise = client.requestMatches([{ text: 'a'.repeat(30), start: 0 }], query(), 100, 250)
      await vi.advanceTimersByTimeAsync(250)

      const outcome = await promise
      expect(outcome.timedOut).toBe(true)
      expect(outcome.error).toBe(true)
      expect(outcome.reason).toBe('timeout')
      expect(fake.terminated).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lazily recreates the worker for the next request after a timeout', async () => {
    vi.useFakeTimers()
    try {
      const workers: FakeWorker[] = []
      const client = new FindMatchesClient(() => {
        const fake = new FakeWorker()
        workers.push(fake)
        return fake as unknown as Worker
      })

      const first = client.requestMatches([{ text: 'x', start: 0 }], query(), 100, 250)
      await vi.advanceTimersByTimeAsync(250)
      await first
      expect(workers).toHaveLength(1)
      expect(workers[0].terminated).toBe(true)

      const second = client.requestMatches([{ text: 'y', start: 0 }], query(), 100, 250)
      expect(workers).toHaveLength(2)
      workers[1].respond({ id: workers[1].posted[0].id, matches: [], error: false, truncated: false })
      await expect(second).resolves.toEqual({ matches: [], error: false, truncated: false, timedOut: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to synchronous matching when Worker is unavailable and no factory was injected', async () => {
    const originalWorker = globalThis.Worker
    delete (globalThis as { Worker?: unknown }).Worker
    try {
      const client = new FindMatchesClient()
      const outcome = await client.requestMatches([{ text: 'cat cat', start: 0 }], query(), 100)
      expect(outcome.matches).toHaveLength(2)
      expect(outcome.timedOut).toBe(false)
    } finally {
      globalThis.Worker = originalWorker
    }
  })

  it('dispose() cancels a pending request and releases the worker', () => {
    let fake!: FakeWorker
    const client = new FindMatchesClient(() => {
      fake = new FakeWorker()
      return fake as unknown as Worker
    })
    void client.requestMatches([{ text: 'cat', start: 0 }], query(), 100)
    client.dispose()
    expect(fake.terminated).toBe(true)
  })
})
