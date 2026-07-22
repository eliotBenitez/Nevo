import type * as Y from 'yjs'
import { encodeYDocState } from '../../../editor-core/collaboration'
import { collabCommands } from '../../../tauri/commands'

// Debounce window for persisting the editor-owned Y.Doc to disk after an edit.
const YJS_SAVE_DEBOUNCE_MS = 2000

export interface YjsPersistence {
  /**
   * Begin debounced disk persistence for a note's editor-owned Y.Doc. `isCurrent`
   * guards a stale timer from writing after the editor has moved on to another
   * note (replaces the previous inline `core.ydoc !== ydoc` check).
   */
  attach(ydoc: Y.Doc, workspacePath: string, noteId: string, isCurrent: () => boolean): void
  /**
   * Cancel the pending timer and detach the update handler. A pending debounced
   * save is flushed first, so the last edit within the debounce window is never
   * lost on note switch / editor destroy.
   */
  teardown(): void
  /** Persist the current Y.Doc state to disk immediately (used on app close). */
  flushNow(): Promise<void>
}

/**
 * Owns the debounced persistence lifecycle of a single editor's disk-backed
 * Y.Doc. Extracted from `useEditorCore` so the timer/handler ownership and
 * teardown ordering live in one place and are independently reasoned about.
 */
export function createYjsPersistence(): YjsPersistence {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let flush: (() => Promise<void>) | null = null
  let updateTarget: Y.Doc | null = null
  let updateHandler: (() => void) | null = null

  function teardown(): void {
    const hadPendingSave = saveTimer !== null
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    // Only flush when a debounced save was actually pending, so a plain note
    // switch with no unsaved Yjs changes doesn't trigger a redundant write.
    if (hadPendingSave) void flush?.().catch(() => {})
    flush = null
    if (updateTarget && updateHandler) {
      updateTarget.off('update', updateHandler)
    }
    updateTarget = null
    updateHandler = null
  }

  async function flushNow(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    await flush?.()
  }

  function attach(
    ydoc: Y.Doc,
    workspacePath: string,
    noteId: string,
    isCurrent: () => boolean,
  ): void {
    const persist = async () => {
      if (!isCurrent()) return
      const state = encodeYDocState(ydoc)
      // `state` is a Uint8Array; the command wrapper forwards it as a raw IPC
      // body, so no Array.from conversion (which would JSON-inflate it).
      await collabCommands.saveYjsState(workspacePath, noteId, state)
    }
    flush = persist
    const handleUpdate = () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        void persist().catch(() => {
          /* non-critical */
        })
      }, YJS_SAVE_DEBOUNCE_MS)
    }
    updateTarget = ydoc
    updateHandler = handleUpdate
    ydoc.on('update', handleUpdate)
  }

  return { attach, teardown, flushNow }
}
