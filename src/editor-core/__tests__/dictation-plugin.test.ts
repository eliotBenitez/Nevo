import { describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo } from 'prosemirror-history'
import type { Node as PMNode } from 'prosemirror-model'
import { nevoBaseSchema } from '../schema'
import {
  commitDictatedText,
  createDictationPlugin,
  getDictationState,
  setDictationLevel,
  setDictationPartial,
  startDictationUi,
  stopDictationUi,
} from '../plugins/dictation'

const schema = nevoBaseSchema

function makeView(doc: PMNode, cursor: number) {
  const options = { t: (k: string) => k, onStop: vi.fn() }
  let state = EditorState.create({ doc, plugins: [history(), createDictationPlugin(options)] })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursor)))
  const view = new EditorView(document.createElement('div'), { state })
  return { view, options }
}

function paragraphs(...texts: string[]) {
  return schema.node('doc', null, texts.map(text => schema.node('paragraph', null, text ? [schema.text(text)] : [])))
}

describe('dictation plugin', () => {
  it('shows the partial as a decoration that never reaches the document', () => {
    const { view } = makeView(paragraphs('Hello'), 6)
    startDictationUi(view)
    setDictationPartial(view, 'interim words')
    setDictationLevel(view, 2)

    expect(view.state.doc.textContent).toBe('Hello')
    expect(JSON.stringify(view.state.doc.toJSON())).not.toContain('interim')
    expect(view.dom.querySelector('.nv-dictation-partial')?.textContent).toBe('interim words')
    expect(getDictationState(view.state).level).toBe(1)
    const indicator = view.dom.querySelector('.nv-dictation-indicator')!
    expect(indicator.getAttribute('aria-hidden')).toBe('true')
    expect(indicator.getAttribute('title')).toBe('dictation.indicator')

    stopDictationUi(view)
    expect(view.dom.querySelector('.nv-dictation')).toBeNull()
  })

  it('commits a phrase as a single undo step and moves the anchor', () => {
    const { view } = makeView(paragraphs('Hello'), 6)
    startDictationUi(view)
    setDictationPartial(view, 'brave new')
    expect(commitDictatedText(view, 'brave new world.')).toBe(true)

    expect(view.state.doc.textContent).toBe('Hello brave new world.')
    expect(getDictationState(view.state)).toMatchObject({ partial: '', anchor: 23 })
    expect(view.dom.querySelector('.nv-dictation-partial')?.textContent).toBe('')

    undo(view.state, view.dispatch)
    expect(view.state.doc.eq(paragraphs('Hello'))).toBe(true)
  })

  it('moves the anchor with a selection change inside the same block', () => {
    const { view } = makeView(paragraphs('one two'), 8)
    startDictationUi(view)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)))
    expect(getDictationState(view.state).anchor).toBe(4)
  })

  it('keeps the anchor in its block when the selection moves to another block', () => {
    const { view } = makeView(paragraphs('one', 'two'), 4)
    startDictationUi(view)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)))
    expect(getDictationState(view.state).anchor).toBe(4)
    expect(view.dom.querySelectorAll('p')[0].querySelector('.nv-dictation')).not.toBeNull()
    commitDictatedText(view, 'three')
    expect(view.state.doc.child(0).textContent).toBe('one three')
    expect(view.state.doc.child(1).textContent).toBe('two')
    expect(view.state.selection.head).toBe(15)
  })

  it('maps the anchor through edits that do not set the selection', () => {
    const { view } = makeView(paragraphs('end'), 4)
    startDictationUi(view)
    view.dispatch(view.state.tr.insert(0, schema.node('paragraph', null, [schema.text('top')])))
    expect(getDictationState(view.state).anchor).toBe(9)
  })

  it('calls onStop on Escape and on indicator click', () => {
    const { view, options } = makeView(paragraphs('x'), 2)
    const escape = () => view.someProp('handleKeyDown', f => f(view, new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(escape()).toBeFalsy()
    startDictationUi(view)
    expect(escape()).toBe(true)
    ;(view.dom.querySelector('.nv-dictation-indicator') as HTMLElement).click()
    expect(options.onStop).toHaveBeenCalledTimes(2)
  })

  it('splits the block on a spoken paragraph command', () => {
    const { view } = makeView(paragraphs('First'), 6)
    startDictationUi(view)
    commitDictatedText(view, 'line. New paragraph. Second line')
    expect(view.state.doc.childCount).toBe(2)
    expect(view.state.doc.child(0).textContent).toBe('First line.')
    expect(view.state.doc.child(1).textContent).toBe('Second line')
    expect(view.state.selection.head).toBe(getDictationState(view.state).anchor)
    undo(view.state, view.dispatch)
    expect(view.state.doc.eq(paragraphs('First'))).toBe(true)
  })

  it('refuses to commit inside a code block', () => {
    const doc = schema.node('doc', null, [schema.node('code_block', null, [schema.text('let x')])])
    const { view } = makeView(doc, 6)
    startDictationUi(view)
    setDictationPartial(view, 'pending')
    expect(commitDictatedText(view, 'words')).toBe(false)
    expect(view.state.doc.eq(doc)).toBe(true)
    expect(getDictationState(view.state).partial).toBe('')
  })
})
