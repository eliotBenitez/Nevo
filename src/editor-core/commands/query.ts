import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { emptyQueryBlockData, type QueryBlockData } from '../../features/query/queryBlockData'
import { insertBlockAndSelect } from './utils'

export function createInsertQueryCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ data: emptyQueryBlockData() })
    if (!dispatch) return true
    return insertBlockAndSelect(state, dispatch, node)
  }
}

export function createUpdateQueryCommand(nodeType: NodeType, data: QueryBlockData): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, data }).scrollIntoView())
    return true
  }
}

export function createRemoveQueryCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selection.from, selection.from + selection.node.nodeSize).scrollIntoView())
    return true
  }
}
