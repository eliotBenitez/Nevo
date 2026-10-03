// Framework-agnostic registry mapping an open note's id to a handle on its
// live editor session, so code outside the editor (e.g. a Pinia store) can
// reach into it without importing Vue/editor-core internals or routing
// editor state through src/stores (see src/editor-core/AGENTS.md: editor
// state never lives in a store).
//
// `flushContent` replaces the old approach of wiring a single mutable
// module-level callback (`noteStore.setPendingContentFlush`) from whatever
// editor pane happened to be mounted. That aimed a flush at "the mounted
// pane", not at the session for the note actually being saved — harmless
// with one note open, but wrong the moment more than one session can exist.
// Registering per note id here means a flush always targets the right
// session regardless of what else is mounted.

export interface EditorPersistenceHandle {
  /** Cancels any pending disk write for this note WITHOUT flushing it. */
  suspend(): void
  /** Flushes the debounced ProseMirror-doc -> `note.content` update
   *  immediately, if one is pending. */
  flushContent(): void | Promise<void>
}

const registry = new Map<string, EditorPersistenceHandle>()

/**
 * Registers `handle` for `noteId`, replacing any previous registration for
 * the same id. Returns an unregister function that removes only its OWN
 * entry: if a newer registration for the same note id has since replaced it,
 * calling the stale unregister is a no-op rather than deleting the new one.
 */
export function registerEditorPersistence(
  noteId: string,
  handle: EditorPersistenceHandle,
): () => void {
  registry.set(noteId, handle)
  return () => {
    if (registry.get(noteId) === handle) registry.delete(noteId)
  }
}

/** Suspends the live editor's pending disk write for `noteId`. A no-op if no
 *  editor is currently open for that note. */
export function suspendEditorPersistence(noteId: string): void {
  registry.get(noteId)?.suspend()
}

/** The live editor session registered for `noteId`, if any — lets a caller
 *  (e.g. the note store, before/around a save) flush its pending writes
 *  without owning or importing any editor internals itself. */
export function getEditorSession(noteId: string): EditorPersistenceHandle | undefined {
  return registry.get(noteId)
}
