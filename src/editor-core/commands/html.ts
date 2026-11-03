import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { clampHtmlBlockHeight, HTML_BLOCK_DEFAULT_CODE, HTML_BLOCK_DEFAULT_HEIGHT } from '../schema/htmlBlock'
import { insertBlockAndSelect } from './utils'

export function createInsertHtmlCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const node = nodeType.create({ code: HTML_BLOCK_DEFAULT_CODE, height: HTML_BLOCK_DEFAULT_HEIGHT })
    if (!dispatch) return true
    return insertBlockAndSelect(state, dispatch, node)
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
