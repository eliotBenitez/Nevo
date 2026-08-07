import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { BlockRefTarget } from '../../core/blockRef/resolveBlockRef'
import { createInsertBlockCommand, findSelectedNode } from './utils'

export type BlockEmbedAttrs = BlockRefTarget

/** Inserts a `block_embed` pointing at `target`. Used by the paste-to-embed
 *  handler (see `app/composables/editor/usePasteHandling.ts`) when the pasted
 *  plain text is a single `nevo://block/<noteId>/<blockId>` token — there is
 *  no slash-command or picker UI for block references in v1. */
export function createInsertBlockEmbedCommand(blockEmbed: NodeType, target: BlockRefTarget): Command {
  return createInsertBlockCommand(blockEmbed, { noteId: target.noteId, blockId: target.blockId })
}

export function createRemoveBlockEmbedCommand(blockEmbed: NodeType): Command {
  return (state, dispatch) => {
    const selected = findSelectedNode(state.selection, blockEmbed)
    if (!selected) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selected.pos, selected.pos + selected.node.nodeSize).scrollIntoView())
    return true
  }
}
