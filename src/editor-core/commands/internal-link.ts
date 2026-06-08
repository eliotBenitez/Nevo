import type { MarkType } from 'prosemirror-model'
import type { Command, EditorState } from 'prosemirror-state'

export interface InternalLinkRange {
  from: number
  to: number
  noteId: string
  anchor: string | null
}

function hasInternalLinkAt(state: EditorState, pos: number, markType: MarkType): boolean {
  return markType.isInSet(state.doc.resolve(pos).marks()) !== null
}

function findInternalLinkAtCursor(state: EditorState, markType: MarkType): InternalLinkRange | null {
  const { selection } = state
  if (!selection.empty) return null

  const { $from } = selection
  const parentStart = $from.start()
  const parentEnd = $from.end()

  let probe = Math.max(parentStart, Math.min($from.pos, parentEnd))
  if (!hasInternalLinkAt(state, probe, markType) && probe > parentStart && hasInternalLinkAt(state, probe - 1, markType)) {
    probe -= 1
  }
  if (!hasInternalLinkAt(state, probe, markType)) return null

  let from = probe
  let to = probe
  while (from > parentStart && hasInternalLinkAt(state, from - 1, markType)) from -= 1
  while (to < parentEnd && hasInternalLinkAt(state, to, markType)) to += 1
  if (from >= to) return null

  const m = markType.isInSet(state.doc.resolve(from).marks())
  if (!m) return null
  return { from, to, noteId: m.attrs.noteId as string, anchor: (m.attrs.anchor as string | null) ?? null }
}

function findInternalLinkInSelection(state: EditorState, markType: MarkType): InternalLinkRange | null {
  const { from, to, empty } = state.selection
  if (empty) return null

  let noteId = ''
  let anchor: string | null = null
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    const m = markType.isInSet(node.marks)
    if (!m) return
    noteId = m.attrs.noteId as string
    anchor = (m.attrs.anchor as string | null) ?? null
  })

  if (!noteId) return null
  return { from, to, noteId, anchor }
}

export function getInternalLinkRange(state: EditorState): InternalLinkRange | null {
  const markType = state.schema.marks.internal_link
  if (!markType) return null
  return findInternalLinkInSelection(state, markType) ?? findInternalLinkAtCursor(state, markType)
}

export function createSetInternalLinkCommand(markType: MarkType, noteId: string, anchor: string | null = null): Command {
  return (state, dispatch) => {
    if (!noteId.trim()) return false
    const existing = getInternalLinkRange(state)
    if (!dispatch) return true

    const mark = markType.create({ noteId, anchor })
    if (existing) {
      const tr = state.tr.removeMark(existing.from, existing.to, markType).addMark(existing.from, existing.to, mark)
      dispatch(tr.scrollIntoView())
      return true
    }

    const { from, to, empty } = state.selection
    if (empty) {
      dispatch(state.tr.addStoredMark(mark))
      return true
    }

    const tr = state.tr.removeMark(from, to, markType).addMark(from, to, mark)
    dispatch(tr.scrollIntoView())
    return true
  }
}

export function createUnsetInternalLinkCommand(markType: MarkType): Command {
  return (state, dispatch) => {
    const existing = getInternalLinkRange(state)
    const { from, to, empty } = state.selection
    if (!existing && empty) return false
    if (!dispatch) return true

    if (existing) {
      dispatch(state.tr.removeStoredMark(markType).removeMark(existing.from, existing.to, markType).scrollIntoView())
      return true
    }
    dispatch(state.tr.removeStoredMark(markType).removeMark(from, to, markType).scrollIntoView())
    return true
  }
}
