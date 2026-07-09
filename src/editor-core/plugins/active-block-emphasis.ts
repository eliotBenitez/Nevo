import type { ResolvedPos } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import { isContainerBlockType } from '../schema/container-blocks'

function getActiveBlockDepth($cursor: ResolvedPos): number | null {
  let textblockDepth: number | null = null

  for (let depth = $cursor.depth; depth >= 1; depth -= 1) {
    const node = $cursor.node(depth)

    if (isContainerBlockType(node.type)) {
      return depth
    }

    if (textblockDepth === null && node.isTextblock) {
      textblockDepth = depth
    }
  }

  return textblockDepth
}

export function createActiveBlockEmphasisPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { selection } = state
        if (!(selection instanceof TextSelection) || !selection.$cursor) {
          return DecorationSet.empty
        }
        const $cursor = selection.$cursor
        if ($cursor.depth < 1) return DecorationSet.empty

        const activeBlockDepth = getActiveBlockDepth($cursor)
        if (activeBlockDepth === null) return DecorationSet.empty

        const blockStart = $cursor.before(activeBlockDepth)
        const blockEnd = blockStart + $cursor.node(activeBlockDepth).nodeSize
        return DecorationSet.create(state.doc, [
          Decoration.node(blockStart, blockEnd, { class: 'nv-active-block' }),
        ])
      },
    },
  })
}
