import { beforeEach, describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'
import {
  clearActiveEditor,
  getActiveEditor,
  notifyActiveEditorTransaction,
  registerActiveEditor,
} from './activeEditorRegistry'
import { applyEditorEdit, EditorUnavailableError, readEditorSnapshot } from './mcpEditorOperations'

function mountEditor(text = 'Hello'): EditorView {
  const state = EditorState.create({
    doc: nevoBaseSchema.node('doc', null, [
      nevoBaseSchema.node('paragraph', null, [nevoBaseSchema.text(text)]),
    ]),
    schema: nevoBaseSchema,
  })
  const root = document.createElement('div')
  document.body.appendChild(root)
  return new EditorView(root, {
    state,
    // Mirror useEditorCore: every applied transaction bumps the revision the
    // bridge hands out and validates against.
    dispatchTransaction(transaction) {
      const view = this as unknown as EditorView
      view.updateState(view.state.apply(transaction))
      notifyActiveEditorTransaction()
    },
  })
}

describe('mcpEditorOperations', () => {
  let view: EditorView | null = null

  beforeEach(() => {
    view?.destroy()
    view = null
    clearActiveEditor()
  })

  it('refuses to read a snapshot when no note is open', () => {
    expect(() => readEditorSnapshot()).toThrow(EditorUnavailableError)
  })

  it('returns the open note id, revision, and document', () => {
    view = mountEditor('Ship the bridge')
    registerActiveEditor(view, 'note-1')

    const snapshot = readEditorSnapshot()
    expect(snapshot.noteId).toBe('note-1')
    expect(snapshot.revision).toBe(0)
    expect(JSON.stringify(snapshot.doc)).toContain('Ship the bridge')
  })

  it('refuses to address a note other than the open one', () => {
    view = mountEditor()
    registerActiveEditor(view, 'note-1')

    expect(() => readEditorSnapshot('note-2')).toThrow(/not the note currently open/)
    expect(() =>
      applyEditorEdit({ noteId: 'note-2', revision: 0, operations: [{ type: 'insertText', text: 'x', from: 1 }] }),
    ).toThrow(/not the note currently open/)
  })

  it('applies an edit and reports the new revision', () => {
    view = mountEditor('Hello')
    registerActiveEditor(view, 'note-1')

    const result = applyEditorEdit({
      noteId: 'note-1',
      revision: 0,
      operations: [{ type: 'insertText', text: ' world', from: 6 }],
    })

    expect(result.applied).toBe(true)
    expect(result.revision).toBe(1)
    expect(view.state.doc.textContent).toBe('Hello world')
  })

  it('rejects an absolute edit quoting a stale revision', () => {
    view = mountEditor('Hello')
    registerActiveEditor(view, 'note-1')

    // Someone typed since the agent read its snapshot.
    view.dispatch(view.state.tr.insertText('!', 6))
    expect(getActiveEditor()?.revision).toBe(1)

    expect(() =>
      applyEditorEdit({
        noteId: 'note-1',
        revision: 0,
        operations: [{ type: 'insertText', text: ' world', from: 6 }],
      }),
    ).toThrow(/changed since revision 0 \(now 1\)/)
  })

  it('treats an omitted "to" as a pure insertion, ignoring the caret', () => {
    view = mountEditor('Hello')
    registerActiveEditor(view, 'note-1')
    // Caret at the very start: without pinning, the insert would swallow the
    // text between position 6 and the caret.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))

    applyEditorEdit({
      noteId: 'note-1',
      revision: getActiveEditor()?.revision ?? 0,
      operations: [{ type: 'insertText', text: ' world', from: 6 }],
    })

    expect(view.state.doc.textContent).toBe('Hello world')
  })

  it('appends position-free text as a new block instead of using the caret', () => {
    view = mountEditor('Hello')
    registerActiveEditor(view, 'note-1')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))

    applyEditorEdit({
      noteId: 'note-1',
      revision: getActiveEditor()?.revision ?? 0,
      operations: [{ type: 'insertText', text: 'From an agent' }],
    })

    expect(view.state.doc.childCount).toBe(2)
    expect(view.state.doc.child(0).textContent).toBe('Hello')
    expect(view.state.doc.child(1).textContent).toBe('From an agent')
  })

  it('keeps batched position-free insertions ordered at the document end', () => {
    view = mountEditor('Hello')
    registerActiveEditor(view, 'note-1')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))

    applyEditorEdit({
      noteId: 'note-1',
      revision: getActiveEditor()?.revision ?? 0,
      operations: [
        { type: 'insertText', text: 'First addition' },
        { type: 'insertText', text: 'Second addition' },
      ],
    })

    expect(Array.from({ length: view.state.doc.childCount }, (_, index) => view!.state.doc.child(index).textContent)).toEqual([
      'Hello',
      'First addition',
      'Second addition',
    ])
  })

  it('appends a position-free node after existing blocks', () => {
    view = mountEditor('Hello')
    registerActiveEditor(view, 'note-1')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))

    applyEditorEdit({
      noteId: 'note-1',
      revision: getActiveEditor()?.revision ?? 0,
      operations: [{ type: 'insertNode', nodeType: 'divider' }],
    })

    expect(view.state.doc.child(0).textContent).toBe('Hello')
    expect(view.state.doc.lastChild?.type.name).toBe('divider')
  })

  it('rejects an unsupported operation type', () => {
    view = mountEditor()
    registerActiveEditor(view, 'note-1')

    expect(() =>
      applyEditorEdit({
        noteId: 'note-1',
        revision: 0,
        operations: [{ type: 'deleteEverything' }],
      }),
    ).toThrow(/Unsupported transaction operation/)
  })

  it('forgets the editor when the view is torn down', () => {
    view = mountEditor()
    registerActiveEditor(view, 'note-1')
    clearActiveEditor(view)

    expect(getActiveEditor()).toBeNull()
    expect(() => readEditorSnapshot()).toThrow(EditorUnavailableError)
  })

  it('ignores a late teardown from a replaced view', () => {
    const stale = mountEditor()
    view = mountEditor()
    registerActiveEditor(view, 'note-2')

    // The previous note's view is destroyed after the new one registered.
    clearActiveEditor(stale)
    stale.destroy()

    expect(getActiveEditor()?.noteId).toBe('note-2')
  })
})
