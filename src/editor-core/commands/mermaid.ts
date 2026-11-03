import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { insertBlockAndSelect } from './utils'

const DEFAULT_CODE = 'graph TD\n  A --> B'

export function createInsertMermaidCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ code: DEFAULT_CODE })
    if (!dispatch) return true
    return insertBlockAndSelect(state, dispatch, node)
  }
}

export function createUpdateMermaidCommand(nodeType: NodeType, code: string): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, code }).scrollIntoView())
    return true
  }
}

export function createRemoveMermaidCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selection.from, selection.from + selection.node.nodeSize).scrollIntoView())
    return true
  }
}
