// A small LRU cache of recently opened notes, scoped per workspace handle so
// the same note id in two different workspaces (e.g. a copied/cloned
// workspace) can never collide — a cache hit for the wrong workspace would
// otherwise serve, and could then save, another workspace's note over the
// current one.

import type { NoteDocument } from '../../types/note'

const DEFAULT_LIMIT = 5

interface CacheEntry {
  handleKey: string
  note: NoteDocument
}

export interface NoteCache {
  get(handleKey: string, noteId: string): NoteDocument | undefined
  set(handleKey: string, note: NoteDocument): void
  delete(handleKey: string, noteId: string): void
  /** Drops every cached note whose handle is not `handleKey` — call this when
   *  a load/save observes a workspace switch, so nothing from the previous
   *  workspace can still be served (or saved over) as if it belonged to the
   *  new one. */
  clearExcept(handleKey: string): void
}

function entryKey(handleKey: string, noteId: string): string {
  return `${handleKey}:${noteId}`
}

export function createNoteCache(limit = DEFAULT_LIMIT): NoteCache {
  // Map iteration order is insertion order; re-inserting a touched key moves
  // it to the end, so the first key is always the least-recently-used one.
  const entries = new Map<string, CacheEntry>()

  function get(handleKey: string, noteId: string): NoteDocument | undefined {
    return entries.get(entryKey(handleKey, noteId))?.note
  }

  function set(handleKey: string, note: NoteDocument): void {
    const key = entryKey(handleKey, note.id)
    entries.delete(key)
    entries.set(key, { handleKey, note })
    while (entries.size > limit) {
      const oldestKey = entries.keys().next().value
      if (oldestKey === undefined) break
      entries.delete(oldestKey)
    }
  }

  function del(handleKey: string, noteId: string): void {
    entries.delete(entryKey(handleKey, noteId))
  }

  function clearExcept(handleKey: string): void {
    for (const [key, entry] of entries) {
      if (entry.handleKey !== handleKey) entries.delete(key)
    }
  }

  return { get, set, delete: del, clearExcept }
}
