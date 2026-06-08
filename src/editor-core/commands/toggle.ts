import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { TextSelection } from 'prosemirror-state'

export function createInsertToggleCommand(toggle: NodeType, toggleTitle: NodeType, paragraph: NodeType): Command {
  return (state, dispatch) => {
    const { selection } = state
    const { $from } = selection

    let targetDepth = -1
    for (let depth = $from.depth; depth >= 1; depth -= 1) {
      if ($from.node(depth).isTextblock) {
        targetDepth = depth
        break
      }
    }

    if (targetDepth < 1) return false

    const targetNode = $from.node(targetDepth)
    const targetParent = $from.node(targetDepth - 1)
    const targetIndex = $from.index(targetDepth - 1)
    if (!targetParent.canReplaceWith(targetIndex, targetIndex + 1, toggle)) {
      return false
    }

    const titleContent = targetNode.content.size > 0
      ? targetNode.content
      : paragraph.createAndFill()?.content

    if (!titleContent) return false

    const titleNode = toggleTitle.create(null, titleContent)
    const bodyNode = paragraph.createAndFill()
    if (!bodyNode) return false

    const toggleNode = toggle.createAndFill({ collapsed: false }, [titleNode, bodyNode])
    if (!toggleNode) return false
    if (!dispatch) return true

    const from = $from.before(targetDepth)
    const to = from + targetNode.nodeSize
    const titleEnd = from + titleNode.nodeSize + 1
    const tr = state.tr.replaceWith(from, to, toggleNode)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, titleEnd)).scrollIntoView())
    return true
  }
}

export function createToggleCollapseCommand(toggle: NodeType): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    for (let depth = $from.depth; depth >= 1; depth -= 1) {
      const node = $from.node(depth)
      if (node.type === toggle) {
        if (!dispatch) return true
        const pos = $from.before(depth)
        dispatch(
          state.tr
            .setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: !node.attrs.collapsed })
            .scrollIntoView(),
        )
        return true
      }
    }
    return false
  }
}