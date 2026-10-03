// A per-key write queue: at most one `commit` runs at a time for a given
// key, and edits that arrive while one is running are coalesced into a
// single follow-up run instead of piling up one write per edit.
//
// Built for `src/stores/note.ts`'s note-save path, where several triggers
// (autosave debounce, blur, navigation, unmount, app close) can all decide to
// save the same note around the same time. Without a queue, two overlapping
// `backend.saveNote()` calls race the filesystem/network, and whichever one
// happens to resolve *last* — not the one holding the newest content — wins.
// A single-writer-per-key queue makes that race structurally impossible: the
// note's on-disk copy always reflects the most recent state passed through a
// commit, and everything queued behind it observes a completed write, never
// an in-flight one.
//
// This queue only ever orders and coalesces calls *within this process*. It
// says nothing about a second process (or device) writing the same file —
// that is a real, separate gap (no on-disk revision/optimistic-concurrency
// field exists yet to detect it) and is out of scope here; see the note where
// this queue is used in `src/stores/note.ts`.

interface QueueState {
  /** The highest revision a completed commit has actually persisted, or
   *  `null` if no commit has ever run for this key yet. Kept nullable rather
   *  than defaulting to `0` so a caller's very first request — whatever
   *  revision number it happens to use, including `0` — is never mistaken
   *  for "already satisfied" by a queue that has not committed anything. */
  persistedRevision: number | null
  /** The currently-running commit, if any. */
  inFlight: Promise<void> | null
  /** The highest revision requested since the current commit (if any) began,
   *  not yet started. `null` when nothing is waiting. */
  pendingRevision: number | null
  /** The commit function paired with `pendingRevision` — always the one from
   *  the request that most recently raised it, so it reads the freshest
   *  state when it finally runs. */
  pendingCommit: ((revision: number) => Promise<void>) | null
  /** Every caller waiting on `pendingRevision` (or a lower one coalesced into
   *  it) to be satisfied by the next run. */
  pendingWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>
}

export interface SaveQueue {
  /**
   * Requests that `commit` persist `revision` for `key`. Resolves once a
   * commit covering at least `revision` has completed; rejects if the commit
   * that ends up covering it rejects. Resolves immediately, without ever
   * calling `commit`, if `revision` is already covered by a previous
   * successful commit for `key`.
   */
  enqueue(key: string, revision: number, commit: (revision: number) => Promise<void>): Promise<void>
  /** The highest revision known to be durably committed for `key` (`0` if
   *  none has ever committed). */
  persistedRevision(key: string): number
}

export function createSaveQueue(): SaveQueue {
  const states = new Map<string, QueueState>()

  function stateFor(key: string): QueueState {
    let state = states.get(key)
    if (!state) {
      state = {
        persistedRevision: null,
        inFlight: null,
        pendingRevision: null,
        pendingCommit: null,
        pendingWaiters: [],
      }
      states.set(key, state)
    }
    return state
  }

  function runNext(key: string): void {
    const state = stateFor(key)
    if (state.pendingRevision === null) return

    // A commit that landed while this was queued (from a request that was
    // itself coalesced ahead of this one) may already cover it.
    if (state.persistedRevision !== null && state.pendingRevision <= state.persistedRevision) {
      const waiters = state.pendingWaiters
      state.pendingRevision = null
      state.pendingCommit = null
      state.pendingWaiters = []
      waiters.forEach(waiter => waiter.resolve())
      return
    }

    const revision = state.pendingRevision
    const commit = state.pendingCommit
    const waiters = state.pendingWaiters
    state.pendingRevision = null
    state.pendingCommit = null
    state.pendingWaiters = []

    if (!commit) {
      // Unreachable in practice (commit and revision are always set
      // together), but never leave waiters hanging if it happens.
      waiters.forEach(waiter => waiter.resolve())
      return
    }

    state.inFlight = commit(revision)
      .then(
        () => {
          state.persistedRevision = state.persistedRevision === null
            ? revision
            : Math.max(state.persistedRevision, revision)
          waiters.forEach(waiter => waiter.resolve())
        },
        (error: unknown) => {
          // A failed commit must not advance persistedRevision, but the
          // queue itself must keep going — the next request (a retry, or a
          // newer edit) still gets to run.
          waiters.forEach(waiter => waiter.reject(error))
        },
      )
      .finally(() => {
        state.inFlight = null
        runNext(key)
      })
  }

  function enqueue(
    key: string,
    revision: number,
    commit: (revision: number) => Promise<void>,
  ): Promise<void> {
    const state = stateFor(key)
    if (state.persistedRevision !== null && revision <= state.persistedRevision) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      if (state.pendingRevision === null || revision > state.pendingRevision) {
        state.pendingRevision = revision
        state.pendingCommit = commit
      }
      state.pendingWaiters.push({ resolve, reject })

      if (!state.inFlight) runNext(key)
    })
  }

  function persistedRevision(key: string): number {
    return states.get(key)?.persistedRevision ?? 0
  }

  return { enqueue, persistedRevision }
}
