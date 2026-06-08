import type { Node as PMNode, NodeType } from 'prosemirror-model'
import { NodeSelection, type Command, type Selection } from 'prosemirror-state'

export interface SelectedNodeMatch {
  pos: number
  node: PMNode
}

export function createInsertBlockCommand(nodeType: NodeType, attrs: Record<string, unknown> = {}): Command {
  return (state, dispatch) => {
    const node = nodeType.createAndFill(attrs)
    if (!node) return false
    if (!dispatch) return true

    const { $from } = state.selection
    let tr = state.tr

    if (state.selection.empty && $from.parent.isTextblock && $from.parent.content.size === 0) {
      const from = $from.before()
      const to = from + $from.parent.nodeSize
      tr = tr.replaceWith(from, to, node)
    } else {
      tr = tr.replaceSelectionWith(node, false)
    }

    dispatch(tr.scrollIntoView())
    return true
  }
}

export function findSelectedNode(selection: Selection, nodeType: NodeType): SelectedNodeMatch | null {
  if (selection instanceof NodeSelection && selection.node.type === nodeType) {
    return { pos: selection.from, node: selection.node }
  }

  const { $from } = selection
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type === nodeType) {
      return { pos: $from.before(depth), node }
    }
  }

  return null
}

export function createSetNodeAttrsCommand(nodeType: NodeType, updater: (node: PMNode) => Record<string, unknown>): Command {
  return (state, dispatch) => {
    const selected = findSelectedNode(state.selection, nodeType)
    if (!selected) return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(selected.pos, undefined, updater(selected.node)).scrollIntoView())
    return true
  }
}

export function createCodeLanguageCommand(codeBlock: NodeType, language: string | null): Command {
  return createSetNodeAttrsCommand(codeBlock, (node) => ({ ...node.attrs, language }))
}
