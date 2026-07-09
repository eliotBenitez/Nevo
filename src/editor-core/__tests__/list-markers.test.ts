import { describe, expect, it } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'

function findTextBlockContentPos(doc: PMNode, text: string): number {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null || !node.isTextblock || node.textContent !== text) return true
    found = pos + 1
    return false
  })
  if (found === null) throw new Error(`Text block "${text}" not found`)
  return found
}

function mount(content: BlockNode) {
  const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
  const el = document.createElement('div')
  document.body.appendChild(el)
  let view: EditorView
  // eslint-disable-next-line prefer-const
  view = new EditorView(el, {
    state: setup.state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)) },
  })
  return { view, destroy: () => { view.destroy(); el.remove() } }
}

describe('list-markers plugin (incremental gate)', () => {
  it('keeps ordered-list numbering correct after typing in an unrelated paragraph', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'intro' }] },
        {
          type: 'ordered_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
          ],
        },
      ],
    }
    const { view, destroy } = mount(content)
    try {
      // This edit never touches the list, so the plugin should take the
      // map-only path and leave marker text untouched.
      const introPos = findTextBlockContentPos(view.state.doc, 'intro')
      view.dispatch(view.state.tr.insertText('!', introPos + 'intro'.length))

      const listItems = el(view).querySelectorAll('li')
      expect(listItems[0]?.getAttribute('data-nevo-list-marker')).toBe('1.')
      expect(listItems[1]?.getAttribute('data-nevo-list-marker')).toBe('2.')
    } finally {
      destroy()
    }
  })

  it('renumbers an ordered list after inserting a new item at the top', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'ordered_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
          ],
        },
      ],
    }
    const { view, destroy } = mount(content)
    try {
      const firstPos = findTextBlockContentPos(view.state.doc, 'first')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstPos)))
      // Insert a new list_item right before the first one (position 1: content start
      // of the top-level ordered_list) so the whole list must renumber.
      const listItemType = view.state.schema.nodes.list_item
      const paragraphType = view.state.schema.nodes.paragraph
      const tr = view.state.tr.insert(1, listItemType.create(null, paragraphType.create(null, view.state.schema.text('zero'))))
      view.dispatch(tr)

      const listItems = el(view).querySelectorAll('li')
      expect(listItems[0]?.getAttribute('data-nevo-list-marker')).toBe('1.')
      expect(listItems[1]?.getAttribute('data-nevo-list-marker')).toBe('2.')
      expect(listItems[2]?.getAttribute('data-nevo-list-marker')).toBe('3.')
      expect(listItems[0]?.textContent).toBe('zero')
      expect(listItems[1]?.textContent).toBe('first')
      expect(listItems[2]?.textContent).toBe('second')
    } finally {
      destroy()
    }
  })
})

function el(view: EditorView): HTMLElement {
  return view.dom.parentElement as HTMLElement
}
