import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { insertAnswer, replaceSelection, SelectionChangedError } from './aiChatEditorActions'

function mount(paragraphs: string[], select?: [number, number]) {
  const doc = nevoBaseSchema.node('doc', null, paragraphs.map(p =>
    nevoBaseSchema.node('paragraph', null, p ? [nevoBaseSchema.text(p)] : [])))
  let state = EditorState.create({ doc, schema: nevoBaseSchema })
  if (select) state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, select[0], select[1])))
  const dispatched: number[] = []
  const view = new EditorView(document.createElement('div'), {
    state,
    dispatchTransaction(tr) {
      dispatched.push(tr.steps.length)
      view.updateState(view.state.apply(tr))
    },
  })
  return { view, dispatched }
}

const texts = (view: EditorView) => view.state.doc.children.map(n => n.textContent)

describe('insertAnswer', () => {
  it('replaces an empty caret with the answer', () => {
    const { view, dispatched } = mount([''], [1, 1])
    insertAnswer(view, 'Hello **world**')
    expect(texts(view)).toEqual(['Hello world'])
    expect(dispatched).toHaveLength(1)
  })

  it('inserts after the block of a non-empty selection', () => {
    const { view } = mount(['one two three'], [1, 4])
    insertAnswer(view, 'answer')
    expect(texts(view)).toEqual(['one two three', 'answer'])
  })
})

describe('replaceSelection', () => {
  it('replaces inline inside one paragraph without adding a block', () => {
    const { view, dispatched } = mount(['one two three'], [5, 8])
    replaceSelection(view, { noteId: 'n', from: 5, to: 8, text: 'two' }, 'TWO')
    expect(texts(view)).toEqual(['one TWO three'])
    expect(dispatched).toHaveLength(1)
  })

  it('replaces with blocks when the answer is multi-paragraph', () => {
    const { view } = mount(['one two three'], [5, 8])
    replaceSelection(view, { noteId: 'n', from: 5, to: 8, text: 'two' }, 'a\n\nb')
    expect(texts(view).join('|')).toContain('a')
    expect(texts(view).join('|')).toContain('b')
  })

  it('throws SelectionChangedError when the text changed', () => {
    const { view, dispatched } = mount(['one TWO three'])
    expect(() => replaceSelection(view, { noteId: 'n', from: 5, to: 8, text: 'two' }, 'x'))
      .toThrow(SelectionChangedError)
    expect(dispatched).toHaveLength(0)
  })
})
