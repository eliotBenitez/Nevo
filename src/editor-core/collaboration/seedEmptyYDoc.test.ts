import { describe, expect, it } from 'vitest'
import { EditorView } from 'prosemirror-view'
import * as Y from 'yjs'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import type { BlockNode } from '../../types/note'
import { nevoBaseSchema } from '../schema'
import { createNevoEditorState } from '../state'
import {
  createYDocFromContent,
  seedEmptyYDocFromContent,
  Y_FRAGMENT_NAME,
} from './index'

const EMPTY_CONTENT: BlockNode = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

describe('seedEmptyYDocFromContent', () => {
  it('turns an empty cloud fragment into an editable ProseMirror document', () => {
    const ydoc = new Y.Doc()

    expect(seedEmptyYDocFromContent(ydoc, nevoBaseSchema, EMPTY_CONTENT)).toBe(true)

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: EMPTY_CONTENT,
      yFragment: ydoc.getXmlFragment(Y_FRAGMENT_NAME),
    })
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    let view: EditorView
    // eslint-disable-next-line prefer-const -- collaboration plugins may dispatch during construction.
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        const editorView: EditorView = view ?? (this as unknown as EditorView)
        editorView.updateState(editorView.state.apply(transaction))
      },
    })

    try {
      view.dispatch(view.state.tr.insertText('Cloud text'))
      expect(view.state.doc.textContent).toBe('Cloud text')
    } finally {
      view.destroy()
      mount.remove()
      ydoc.destroy()
    }
  })

  it('never replaces an existing collaborative body', () => {
    const existing: BlockNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] }],
    }
    const ydoc = createYDocFromContent(nevoBaseSchema, existing)

    try {
      expect(seedEmptyYDocFromContent(ydoc, nevoBaseSchema, EMPTY_CONTENT)).toBe(false)
      expect(yDocToProsemirrorJSON(ydoc, Y_FRAGMENT_NAME)).toMatchObject(existing)
    } finally {
      ydoc.destroy()
    }
  })
})
