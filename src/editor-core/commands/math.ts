import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { findSelectedNode } from './utils'

export function createInsertMathInlineCommand(nodeType: NodeType, latex = ''): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ latex, displayMode: false })
    if (!dispatch) return true
    const tr = state.tr.replaceSelectionWith(node, false)
    dispatch(tr.setSelection(NodeSelection.create(tr.doc, state.selection.from)).scrollIntoView())
    return true
  }
}

export function createInsertMathBlockCommand(nodeType: NodeType, latex = ''): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ latex, displayMode: true })
    if (!dispatch) return true

    const { $from } = state.selection
    let insertPos = state.selection.from
    let tr = state.tr

    if (state.selection.empty && $from.parent.isTextblock && $from.parent.content.size === 0) {
      insertPos = $from.before()
      tr = tr.replaceWith(insertPos, insertPos + $from.parent.nodeSize, node)
    } else {
      tr = tr.replaceSelectionWith(node, false)
      insertPos = tr.mapping.map(insertPos)
    }

    dispatch(tr.setSelection(NodeSelection.create(tr.doc, insertPos)).scrollIntoView())
    return true
  }
}

export function createUpdateMathCommand(mathInline: NodeType, mathBlock: NodeType, latex: string): Command {
  return (state, dispatch) => {
    const selected = findSelectedNode(state.selection, mathInline) ?? findSelectedNode(state.selection, mathBlock)
    if (!selected) return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(selected.pos, undefined, { ...selected.node.attrs, latex }).scrollIntoView())
    return true
  }
}

export function createRemoveMathCommand(mathInline: NodeType, mathBlock: NodeType): Command {
  return (state, dispatch) => {
    const selected = findSelectedNode(state.selection, mathInline) ?? findSelectedNode(state.selection, mathBlock)
    if (!selected) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selected.pos, selected.pos + selected.node.nodeSize).scrollIntoView())
    return true
  }
}
