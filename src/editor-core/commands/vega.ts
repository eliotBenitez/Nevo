import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { insertBlockAndSelect } from './utils'

const DEFAULT_SPEC = '{}'

export function createInsertVegaCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ spec: DEFAULT_SPEC })
    if (!dispatch) return true
    return insertBlockAndSelect(state, dispatch, node)
  }
}

export function createUpdateVegaCommand(nodeType: NodeType, spec: string): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, spec }).scrollIntoView())
    return true
  }
}

export function createRemoveVegaCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selection.from, selection.from + selection.node.nodeSize).scrollIntoView())
    return true
  }
}