import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createColumnDropPlugin } from '../plugins/column-drop'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc } from '../serialization'
import type { BlockNode } from '../../types/note'

function twoColumnDoc(): BlockNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'column_list',
        content: [
          { type: 'column', content: [{ type: 'paragraph' }] },
          { type: 'column', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep' }] }] },
        ],
      },
    ],
  }
}

function mount(doc: BlockNode) {
  const parsed = parseNoteContentToDoc(nevoBaseSchema, doc)
  const state = EditorState.create({
    schema: nevoBaseSchema,
    doc: parsed,
    plugins: [createColumnDropPlugin()],
  })
  const el = document.createElement('div')
  document.body.appendChild(el)
  let view: EditorView
  // eslint-disable-next-line prefer-const
  view = new EditorView(el, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)) },
  })
  return { view, destroy: () => { view.destroy(); el.remove() } }
}

function findTextPos(doc: import('prosemirror-model').Node, text: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found !== -1) return false
    if (node.isText && node.text === text) found = pos
    return true
  })
  return found
}

describe('column-drop plugin (incremental gate)', () => {
  it('unwraps a column_list to a single column once the other column empties and the cursor leaves it', () => {
    const { view, destroy } = mount(twoColumnDoc())
    try {
      // Type inside the second (non-empty) column — this transaction touches the
      // column_list subtree, so the gate must still run normalizeColumns and collapse
      // the now-cursor-free empty first column. Move the cursor into the second column
      // first, otherwise the default selection sits inside the empty first column and
      // shouldKeep() would (correctly) preserve it.
      const keepPos = findTextPos(view.state.doc, 'keep')
      const typeAt = keepPos + 'keep'.length
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, typeAt)).insertText('!', typeAt),
      )

      expect(view.state.doc.type.name).toBe('doc')
      const columnList = view.state.doc.firstChild
      expect(columnList?.type.name).not.toBe('column_list')
      expect(view.state.doc.textContent).toBe('keep!')
    } finally {
      destroy()
    }
  })

  it('keeps an empty column intact while the cursor sits inside it', () => {
    const { view, destroy } = mount(twoColumnDoc())
    try {
      // Find the empty column's paragraph and put the cursor there, then type — the
      // edit is inside the column_list, so the gate fires, but shouldKeep() should
      // preserve the column because the (post-edit) selection is inside it.
      let emptyParaPos = -1
      view.state.doc.descendants((node, pos) => {
        if (emptyParaPos !== -1) return false
        if (node.type.name === 'paragraph' && node.content.size === 0) {
          emptyParaPos = pos + 1
          return false
        }
        return true
      })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, emptyParaPos)).insertText('x', emptyParaPos))

      const columnList = view.state.doc.firstChild
      expect(columnList?.type.name).toBe('column_list')
      expect(columnList?.childCount).toBe(2)
    } finally {
      destroy()
    }
  })

  it('does not throw and leaves columns untouched when edits happen entirely outside the column_list', () => {
    const doc: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'outside' }] },
        ...twoColumnDoc().content!,
      ],
    }
    const { view, destroy } = mount(doc)
    try {
      const outsidePos = findTextPos(view.state.doc, 'outside')
      view.dispatch(view.state.tr.insertText('!', outsidePos + 'outside'.length))

      // The edit never touched the column_list subtree, so the gate skips
      // normalizeColumns entirely — the still-empty first column is left as-is.
      const columnList = view.state.doc.child(1)
      expect(columnList.type.name).toBe('column_list')
      expect(columnList.childCount).toBe(2)
      expect(view.state.doc.textContent).toBe('outside!keep')
    } finally {
      destroy()
    }
  })
})
