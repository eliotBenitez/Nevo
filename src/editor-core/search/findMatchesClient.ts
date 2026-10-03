import type { FindMatch, FindQuery, TextRun } from './findMatches'
import { findMatchesInRuns } from './findMatches'
import type { FindMatchesWorkerRequest, FindMatchesWorkerResponse } from './findMatchesWorker'

/** Default deadline for a single regex match request. A safe pattern over a
 *  realistic note resolves in a few milliseconds; 250ms is generous slack
 *  before we assume the pattern is pathological and cut it off. */
export const DEFAULT_FIND_MATCHES_TIMEOUT_MS = 250

/** Superset of `FindRegExpErrorReason` (`invalid` | `unsafe`) with the one
 *  reason that only exists at the client/worker level: the pattern passed
 *  the static safety check but still ran too long. */
export type FindMatchesOutcomeReason = 'invalid' | 'unsafe' | 'timeout'

export interface FindMatchesOutcome {
  matches: FindMatch[]
  error: boolean
  reason?: FindMatchesOutcomeReason
  truncated: boolean
  timedOut: boolean
}

export type FindMatchesWorkerFactory = () => Worker

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./findMatchesWorker.ts', import.meta.url), { type: 'module' })
}

interface PendingRequest {
  resolve: (outcome: FindMatchesOutcome) => void
  timer: ReturnType<typeof setTimeout>
}

/** Owns the lifecycle of the regex-matching worker for one editor view.
 *  Requests are correlated by id like `databaseWorkerClient.ts`, but a
 *  timeout here means the worker's own thread is stuck (a runaway
 *  `RegExp.exec` can't be interrupted any other way), so a timeout tears
 *  down and fails every in-flight request, not just the one that timed out.
 *  The worker is created lazily and recreated on demand after that. */
export class FindMatchesClient {
  private worker: Worker | null = null
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 0

  constructor(private readonly createWorker: FindMatchesWorkerFactory = defaultWorkerFactory) {}

  requestMatches(runs: TextRun[], query: FindQuery, limit: number, timeoutMs = DEFAULT_FIND_MATCHES_TIMEOUT_MS): Promise<FindMatchesOutcome> {
    // Only the default factory depends on the real global `Worker`; an
    // injected factory (tests, or a future non-Worker transport) is trusted
    // to work regardless of what `typeof Worker` says in this environment.
    if (this.createWorker === defaultWorkerFactory && typeof Worker === 'undefined') {
      // No worker support in this environment (some test runners, very old
      // WebViews): fall back to computing on the caller's thread rather than
      // never resolving. Safety still comes from `isSafeRegexSource` having
      // already gated the query before this is ever called from the plugin.
      return Promise.resolve({ ...findMatchesInRuns(runs, query, limit), timedOut: false })
    }

    const id = this.nextId += 1
    const worker = this.ensureWorker()

    return new Promise((resolve) => {
      const timer = setTimeout(() => this.failAll(), timeoutMs)
      this.pending.set(id, { resolve, timer })
      const request: FindMatchesWorkerRequest = { id, runs, query, limit }
      worker.postMessage(request)
    })
  }

  /** Cancels any in-flight request and releases the worker. Safe to call
   *  even if no request is in flight (e.g. on plugin/view teardown). */
  dispose() {
    for (const request of this.pending.values()) clearTimeout(request.timer)
    this.pending.clear()
    this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.onmessage = (event: MessageEvent<FindMatchesWorkerResponse>) => {
      const { id, ...result } = event.data
      const request = this.pending.get(id)
      if (!request) return
      this.pending.delete(id)
      clearTimeout(request.timer)
      request.resolve({ ...result, timedOut: false })
    }
    worker.onerror = () => this.failAll()
    worker.onmessageerror = () => this.failAll()
    this.worker = worker
    return worker
  }

  /** The worker is presumed stuck or broken: terminate it and resolve every
   *  pending request as timed out, so nothing waits forever. The next
   *  request lazily spins up a fresh worker. */
  private failAll() {
    this.worker?.terminate()
    this.worker = null
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.resolve({ matches: [], error: true, reason: 'timeout', truncated: false, timedOut: true })
    }
    this.pending.clear()
  }
}
