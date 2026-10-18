import { Selection, TextSelection, type EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

/** Where the reader was in a note: the doc position at the top of the viewport and the caret. */
export interface NoteViewState {
  /** Doc position under the top edge of the viewport; null at the very top, -1 when only scrollTop is known. */
  topPos: number | null
  /** Pixel offset of that position from the viewport top, so it lands on the same line. */
  topOffset: number
  scrollTop: number
  anchor: number
  head: number
}

// shortcut: in-memory only, so positions reset on app restart; persist per workspace if users ask.
const MAX_REMEMBERED_NOTES = 100
const memory = new Map<string, NoteViewState>()

export function captureNoteViewState(view: EditorView, scrollEl: HTMLElement): NoteViewState {
  const { anchor, head } = view.state.selection
  const base = { anchor, head, scrollTop: scrollEl.scrollTop }
  if (scrollEl.scrollTop <= 1) return { ...base, topPos: null, topOffset: 0 }

  const scrollRect = scrollEl.getBoundingClientRect()
  const editorRect = view.dom.getBoundingClientRect()
  const top = Math.max(scrollRect.top, editorRect.top) + 1
  try {
    const hit = view.posAtCoords({ left: editorRect.left + Math.min(48, editorRect.width / 2), top })
    if (hit) return { ...base, topPos: hit.pos, topOffset: view.coordsAtPos(hit.pos).top - scrollRect.top }
  } catch {
    // Layout unavailable (detached view): fall back to the raw scrollTop below.
  }
  return { ...base, topPos: -1, topOffset: 0 }
}

/** Restores the caret (without focusing) and the scroll position; positions are clamped to the current doc. */
export function applyNoteViewState(view: EditorView, scrollEl: HTMLElement, state: NoteViewState): void {
  const size = view.state.doc.content.size
  const clamp = (pos: number) => Math.max(0, Math.min(pos, size))
  try {
    const selection = TextSelection.between(view.state.doc.resolve(clamp(state.anchor)), view.state.doc.resolve(clamp(state.head)))
    view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false))
  } catch {
    view.dispatch(view.state.tr.setSelection(Selection.atStart(view.state.doc)).setMeta('addToHistory', false))
  }

  if (state.topPos === null) {
    scrollEl.scrollTop = 0
    return
  }
  if (state.topPos < 0) {
    scrollEl.scrollTop = state.scrollTop
    return
  }
  try {
    const currentOffset = view.coordsAtPos(clamp(state.topPos)).top - scrollEl.getBoundingClientRect().top
    scrollEl.scrollTop += currentOffset - state.topOffset
  } catch {
    scrollEl.scrollTop = state.scrollTop
  }
}

/** What a restore produced, so a later re-anchor can tell whether the user has since acted. */
export interface RestoredViewMark {
  scrollTop: number
  state: EditorState
}

export function markRestoredView(view: EditorView, scrollEl: HTMLElement): RestoredViewMark {
  return { scrollTop: scrollEl.scrollTop, state: view.state }
}

/** True while the user has not scrolled, moved the caret or edited since the mark. */
export function isViewUntouched(view: EditorView, scrollEl: HTMLElement, mark: RestoredViewMark): boolean {
  return scrollEl.scrollTop === mark.scrollTop
    && view.state.doc === mark.state.doc
    && view.state.selection.eq(mark.state.selection)
}

export function rememberNoteView(noteId: string, state: NoteViewState): void {
  memory.delete(noteId)
  memory.set(noteId, state)
  if (memory.size > MAX_REMEMBERED_NOTES) memory.delete(memory.keys().next().value!)
}

export function recallNoteView(noteId: string): NoteViewState | undefined {
  return memory.get(noteId)
}

export function forgetAllNoteViews(): void {
  memory.clear()
}
