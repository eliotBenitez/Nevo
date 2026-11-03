// Orders writes to a note made outside its editor (an MCP agent editing a
// closed note) against reads that would open it.
//
// Without this, a note opened while such a write is in flight is loaded from
// the pre-write file (or the note cache), and the user's first keystrokes
// autosave that stale body over the agent's edit. Readers wait for pending
// writes instead, and a read that had already started when a write began is
// detectable through `generation` and must be repeated.
//
// Writes to the same note also run one at a time, so two agents editing one
// closed note each see the other's result instead of overwriting it.

export interface ExternalWriteGate {
  /** Runs `write` after every earlier write for `noteId`, keeping readers waiting until it settles. */
  run<T>(noteId: string, write: () => Promise<T>): Promise<T>
  isPending(noteId: string): boolean
  /** Resolves once no write for `noteId` is pending; never rejects. */
  settled(noteId: string): Promise<void>
  /** Bumped when a write starts: a read that saw another value overlapped a write. */
  generation(noteId: string): number
}

export function createExternalWriteGate(): ExternalWriteGate {
  const tails = new Map<string, Promise<unknown>>()
  const generations = new Map<string, number>()

  return {
    run(noteId, write) {
      const previous = tails.get(noteId) ?? Promise.resolve()
      const result = previous.catch(() => {}).then(() => {
        generations.set(noteId, (generations.get(noteId) ?? 0) + 1)
        return write()
      })
      const tail = result.catch(() => {})
      tails.set(noteId, tail)
      void tail.then(() => {
        if (tails.get(noteId) === tail) tails.delete(noteId)
      })
      return result
    },
    isPending(noteId) {
      return tails.has(noteId)
    },
    async settled(noteId) {
      let tail = tails.get(noteId)
      while (tail) {
        await tail
        tail = tails.get(noteId)
      }
    },
    generation(noteId) {
      return generations.get(noteId) ?? 0
    },
  }
}
