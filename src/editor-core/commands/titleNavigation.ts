import { TextSelection, type Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'

export function isFirstBlockEmpty(doc: PMNode): boolean {
  if (doc.childCount === 0) return false
  const firstChild = doc.child(0)
  if (
    firstChild.type.name === 'paragraph'
    || firstChild.type.name === 'heading'
    || firstChild.type.name === 'checklist_item'
  ) {
    return firstChild.content.size === 0 || firstChild.textContent.trim() === ''
  }
  return false
}

export function createFocusFirstBlockOrCreateEmptyCommand(): Command {
  return (state, dispatch, view) => {
    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return false

    const doc = state.doc
    const hasEmptyFirstBlock = isFirstBlockEmpty(doc)

    if (hasEmptyFirstBlock) {
      if (dispatch) {
        const selection = TextSelection.create(doc, 1)
        const tr = state.tr.setSelection(selection).scrollIntoView()
        dispatch(tr)
        view?.focus()
      }
      return true
    }

    if (dispatch) {
      const paragraph = paragraphType.createAndFill() ?? paragraphType.create()
      let tr = state.tr.insert(0, paragraph)
      const selection = TextSelection.create(tr.doc, 1)
      tr = tr.setSelection(selection).scrollIntoView()
      dispatch(tr)
      view?.focus()
    }

    return true
  }
}

export function focusEditorFirstBlock(view: EditorView): boolean {
  return createFocusFirstBlockOrCreateEmptyCommand()(view.state, view.dispatch, view)
}
