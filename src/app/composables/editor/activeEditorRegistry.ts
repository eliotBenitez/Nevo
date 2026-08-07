import type { EditorView } from 'prosemirror-view'

/**
 * Registry of the editor view currently mounted, for callers that live outside
 * the editor component tree — today the MCP bridge, which must dispatch
 * ProseMirror transactions on the live view because the on-disk note content is
 * not the source of truth while a note is open.
 *
 * A module-level singleton mirrors `active-serialization.ts`: exactly one note
 * is open at a time, and the alternative (threading the view up through the
 * shell) would put editor internals into unrelated component props.
 */
interface ActiveEditor {
  view: EditorView
  noteId: string
}

let active: ActiveEditor | null = null

/**
 * Monotonic count of transactions applied since the view was registered.
 * External callers pass it back when applying an edit; a mismatch means the
 * document moved under them and absolute positions can no longer be trusted.
 */
let revision = 0

export function registerActiveEditor(view: EditorView, noteId: string): void {
  active = { view, noteId }
  revision = 0
}

export function clearActiveEditor(view?: EditorView): void {
  // Ignore a teardown that arrives after a different view already registered,
  // which happens when switching notes destroys the old view late.
  if (view && active && active.view !== view) return
  active = null
  revision = 0
}

export function notifyActiveEditorTransaction(): void {
  revision += 1
}

export function getActiveEditor(): (ActiveEditor & { revision: number }) | null {
  return active ? { ...active, revision } : null
}
