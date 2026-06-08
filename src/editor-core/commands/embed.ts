import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { createSetNodeAttrsCommand } from './utils'

export interface EmbedBlockAttrs {
  url: string
  embedType: string
  embedHtml: string
  title: string
  thumbnailUrl: string
}

export function createInsertEmbedCommand(embedBlock: NodeType): Command {
  const attrs = {
    url: '',
    embedType: '',
    embedHtml: '',
    title: '',
    thumbnailUrl: '',
  }

  return (state, dispatch) => {
    const node = embedBlock.createAndFill(attrs)
    if (!node) return false
    if (!dispatch) return true

    const { $from } = state.selection
    let tr = state.tr
    let insertedPos: number | null = null

    if (state.selection.empty && $from.parent.isTextblock && $from.parent.content.size === 0) {
      insertedPos = $from.before()
      tr = tr.replaceWith(insertedPos, insertedPos + $from.parent.nodeSize, node)
    } else {
      tr = tr.replaceSelectionWith(node, false)
      const mappedFrom = tr.mapping.map(state.selection.from, -1)
      tr.doc.descendants((candidate, pos) => {
        if (candidate.type !== embedBlock) return true
        if (insertedPos === null || Math.abs(pos - mappedFrom) < Math.abs(insertedPos - mappedFrom)) {
          insertedPos = pos
        }
        return true
      })
    }

    if (insertedPos !== null) {
      tr = tr.setSelection(NodeSelection.create(tr.doc, insertedPos))
    }

    dispatch(tr.scrollIntoView())
    return true
  }
}

export function createEmbedAttrsCommand(embedBlock: NodeType, attrs: Partial<EmbedBlockAttrs>): Command {
  return createSetNodeAttrsCommand(embedBlock, (node) => ({ ...node.attrs, ...attrs }))
}
