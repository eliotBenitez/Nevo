import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { insertBlockAndSelect } from './utils'

const DEFAULT_MARKDOWN = '# Topic\n## Idea A\n## Idea B'

export function createInsertMarkmapCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ markdown: DEFAULT_MARKDOWN })
    if (!dispatch) return true
    return insertBlockAndSelect(state, dispatch, node)
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
