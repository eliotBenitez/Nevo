import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'

const DEFAULT_MARKDOWN = '# Topic\n## Idea A\n## Idea B'

export function createInsertMarkmapCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ markdown: DEFAULT_MARKDOWN })
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

export function createUpdateMarkmapCommand(nodeType: NodeType, markdown: string): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, markdown }).scrollIntoView())
    return true
  }
}

export function createRemoveMarkmapCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selection.from, selection.from + selection.node.nodeSize).scrollIntoView())
    return true
  }
}
