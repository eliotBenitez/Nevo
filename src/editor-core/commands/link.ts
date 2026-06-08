import type { MarkType } from 'prosemirror-model'
import type { Command, EditorState } from 'prosemirror-state'
import type { NevoLinkRange } from './types'

function clampToLineRange(pos: number, start: number, end: number): number {
  return Math.max(start, Math.min(pos, end))
}

function hasMarkAtPosition(state: EditorState, pos: number, markType: MarkType): boolean {
  const marks = state.doc.resolve(pos).marks()
  return markType.isInSet(marks) !== null
}

function findLinkMarkInSelection(state: EditorState, markType: MarkType): NevoLinkRange | null {
  const { from, to, empty } = state.selection
  if (empty) return null

  let href = ''
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    const mark = markType.isInSet(node.marks)
    if (!mark) return
    const nextHref = mark.attrs.href
    if (typeof nextHref === 'string') href = nextHref
  })

  if (!href) return null
  return { from, to, href }
}

function findLinkMarkAtCursor(state: EditorState, markType: MarkType): NevoLinkRange | null {
  const { selection } = state
  if (!selection.empty) return null

  const { $from } = selection
  const parentStart = $from.start()
  const parentEnd = $from.end()

  let probe = clampToLineRange($from.pos, parentStart, parentEnd)
  if (!hasMarkAtPosition(state, probe, markType) && probe > parentStart && hasMarkAtPosition(state, probe - 1, markType)) {
    probe -= 1
  }

  if (!hasMarkAtPosition(state, probe, markType)) return null

  let from = probe
  let to = probe

  while (from > parentStart && hasMarkAtPosition(state, from - 1, markType)) { from -= 1 }
  while (to < parentEnd && hasMarkAtPosition(state, to, markType)) { to += 1 }

  if (from >= to) return null

  const hrefMark = markType.isInSet(state.doc.resolve(from).marks())
  const href = typeof hrefMark?.attrs.href === 'string' ? hrefMark.attrs.href : ''
  if (!href) return null

  return { from, to, href }
}

export function getLinkRange(state: EditorState): NevoLinkRange | null {
  const link = state.schema.marks.link
  if (!link) return null
  return findLinkMarkInSelection(state, link) ?? findLinkMarkAtCursor(state, link)
}

export function createLinkSetCommand(link: MarkType, href: string): Command {
  return (state, dispatch) => {
    if (!href.trim()) return false

    const existing = getLinkRange(state)
    if (!dispatch) return true

    if (existing) {
      const tr = state.tr.removeMark(existing.from, existing.to, link).addMark(existing.from, existing.to, link.create({ href }))
      dispatch(tr.scrollIntoView())
      return true
    }

    const { from, to, empty } = state.selection
    if (empty) {
      dispatch(state.tr.addStoredMark(link.create({ href })))
      return true
    }

    const tr = state.tr.removeMark(from, to, link).addMark(from, to, link.create({ href }))
    dispatch(tr.scrollIntoView())
    return true
  }
}

export function createUnsetLinkCommand(link: MarkType): Command {
  return (state, dispatch) => {
    const existing = getLinkRange(state)
    const { from, to, empty } = state.selection

    if (!existing && empty) return false
    if (!dispatch) return true

    if (existing) {
      dispatch(state.tr.removeStoredMark(link).removeMark(existing.from, existing.to, link).scrollIntoView())
      return true
    }

    dispatch(state.tr.removeStoredMark(link).removeMark(from, to, link).scrollIntoView())
    return true
  }
}
