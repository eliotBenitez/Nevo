import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { ImageBlockAttrs } from './types'
import { findSelectedNode, createSetNodeAttrsCommand } from './utils'

export function createImageAttrsCommand(imageBlock: NodeType, attrs: Partial<ImageBlockAttrs>): Command {
  return createSetNodeAttrsCommand(imageBlock, (node) => ({ ...node.attrs, ...attrs }))
}

export function createInsertImageCommand(imageBlock: NodeType): Command {
  return (state, dispatch) => {
    const node = imageBlock.create({ src: '', alt: '', caption: '', sizePreset: 'medium', width: null })
    if (!dispatch) return true
    dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView())
    return true
  }
}

export function createRemoveImageCommand(imageBlock: NodeType): Command {
  return (state, dispatch) => {
    const selected = findSelectedNode(state.selection, imageBlock)
    if (!selected) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selected.pos, selected.pos + selected.node.nodeSize).scrollIntoView())
    return true
  }
}
