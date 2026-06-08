import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { FileBlockAttrs } from './types'
import { findSelectedNode, createSetNodeAttrsCommand } from './utils'

export function createFileAttrsCommand(fileBlock: NodeType, attrs: Partial<FileBlockAttrs>): Command {
  return createSetNodeAttrsCommand(fileBlock, (node) => ({ ...node.attrs, ...attrs }))
}

export function createInsertFileCommand(fileBlock: NodeType): Command {
  return (state, dispatch) => {
    const node = fileBlock.create({ src: '', filename: '', mime: '', size: 0 })
    if (!dispatch) return true
    dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView())
    return true
  }
}

export function createRemoveFileCommand(fileBlock: NodeType): Command {
  return (state, dispatch) => {
    const selected = findSelectedNode(state.selection, fileBlock)
    if (!selected) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selected.pos, selected.pos + selected.node.nodeSize).scrollIntoView())
    return true
  }
}
