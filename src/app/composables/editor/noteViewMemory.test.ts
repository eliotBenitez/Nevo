import { afterEach, describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema as schema } from '../../../editor-core/schema'
import {
  applyNoteViewState,
  captureNoteViewState,
  forgetAllNoteViews,
  isViewUntouched,
  markRestoredView,
  recallNoteView,
  rememberNoteView,
  type NoteViewState,
} from './noteViewMemory'

function createView(paragraphs: string[]): EditorView {
  const doc = schema.node('doc', null, paragraphs.map((text) => schema.node('paragraph', null, text ? [schema.text(text)] : [])))
  return new EditorView(document.createElement('div'), { state: EditorState.create({ schema, doc }) })
}

function state(overrides: Partial<NoteViewState>): NoteViewState {
  return { topPos: null, topOffset: 0, scrollTop: 0, anchor: 1, head: 1, ...overrides }
}

afterEach(() => forgetAllNoteViews())

describe('noteViewMemory', () => {
  it('captures the caret and treats a scroll at the top as "start of note"', () => {
    const view = createView(['hello', 'world'])
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 5)))
    const scrollEl = document.createElement('div')
    expect(captureNoteViewState(view, scrollEl)).toEqual(state({ anchor: 3, head: 5 }))
  })

  it('restores the caret without adding an undo step and resets scroll for the top of the note', () => {
    const view = createView(['hello', 'world'])
    const scrollEl = document.createElement('div')
    scrollEl.scrollTop = 120
    applyNoteViewState(view, scrollEl, state({ anchor: 9, head: 9 }))
    expect(view.state.selection.from).toBe(9)
    expect(view.state.selection.empty).toBe(true)
    expect(scrollEl.scrollTop).toBe(0)
  })

  it('clamps a remembered caret that points past the end of a shortened note', () => {
    const view = createView(['hi'])
    applyNoteViewState(view, document.createElement('div'), state({ anchor: 500, head: 500 }))
    expect(view.state.selection.from).toBe(view.state.doc.content.size - 1)
  })

  it('falls back to the raw scrollTop when no doc anchor was captured', () => {
    const view = createView(['a'])
    const scrollEl = document.createElement('div')
    applyNoteViewState(view, scrollEl, state({ topPos: -1, scrollTop: 340 }))
    expect(scrollEl.scrollTop).toBe(340)
  })

  it('keeps the most recently used notes and evicts the oldest past the limit', () => {
    for (let i = 0; i < 101; i += 1) rememberNoteView(`note-${i}`, state({ scrollTop: i }))
    expect(recallNoteView('note-0')).toBeUndefined()
    expect(recallNoteView('note-100')?.scrollTop).toBe(100)

    rememberNoteView('note-1', state({ scrollTop: 7 }))
    rememberNoteView('note-101', state({}))
    expect(recallNoteView('note-1')?.scrollTop).toBe(7)
    expect(recallNoteView('note-2')).toBeUndefined()
  })
  it('treats a caret move or an edit after a restore as user input, but not an unchanged view', () => {
    const view = createView(['hello', 'world'])
    const scrollEl = document.createElement('div')
    const mark = markRestoredView(view, scrollEl)
    expect(isViewUntouched(view, scrollEl, mark)).toBe(true)

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)))
    expect(isViewUntouched(view, scrollEl, mark)).toBe(false)

    const typed = markRestoredView(view, scrollEl)
    view.dispatch(view.state.tr.insertText('x', 1))
    expect(isViewUntouched(view, scrollEl, typed)).toBe(false)
  })
})
