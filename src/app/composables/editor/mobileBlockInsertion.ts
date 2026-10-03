import { NodeSelection, TextSelection } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'

/**
 * Opens the slash insertion flow without replacing a selected block atom.
 * Text selections keep the existing inline behaviour; a selected block gets a
 * fresh paragraph immediately after it and the slash trigger is placed there.
 */
export function createMobileBlockMenuTransaction(state: EditorState): Transaction | null {
  const { selection } = state
  const tr = state.tr

  if (selection instanceof NodeSelection && selection.node.isBlock) {
    const paragraph = state.schema.nodes.paragraph?.createAndFill()
    if (!paragraph) return null

    const insertPos = selection.to
    tr.insert(insertPos, paragraph)
    tr.insertText('/', insertPos + 1)
    return tr
      .setSelection(TextSelection.create(tr.doc, insertPos + 2))
      .scrollIntoView()
  }

  if (selection instanceof TextSelection && selection.$from.parent.isTextblock) {
    return tr.insertText('/', selection.from, selection.to).scrollIntoView()
  }

  return null
}
