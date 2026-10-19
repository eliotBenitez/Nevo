import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { clampHtmlBlockHeight, HTML_BLOCK_DEFAULT_CODE, HTML_BLOCK_DEFAULT_HEIGHT } from '../schema/htmlBlock'

export function createInsertHtmlCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ code: HTML_BLOCK_DEFAULT_CODE, height: HTML_BLOCK_DEFAULT_HEIGHT })
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

export function createUpdateHtmlCommand(nodeType: NodeType, code: string, height?: number): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    const nextHeight = clampHtmlBlockHeight(height ?? selection.node.attrs.height)
    dispatch(state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, code, height: nextHeight }).scrollIntoView())
    return true
  }
}
