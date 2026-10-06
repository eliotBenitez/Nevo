import type { ResolvedPos } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import { isContainerBlockType } from '../schema/container-blocks'

const LIST_TYPE_NAMES = new Set(['bullet_list', 'ordered_list'])
const LIST_ITEM_TYPE_NAME = 'list_item'

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

function nodeDecoration($cursor: ResolvedPos, depth: number, className: string): Decoration {
  const from = $cursor.before(depth)
  return Decoration.node(from, from + $cursor.node(depth).nodeSize, { class: className })
}

/**
 * Besides the active block itself, the ancestors on its path are marked so the
 * emphasis styles can keep them opaque: `nv-active-root` on the top-level block
 * (lists, tables, toggles, columns) and `nv-active-list` / `nv-active-list-item`
 * on list levels, letting sibling list items be dimmed individually.
 */
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

        const decorations = [nodeDecoration($cursor, activeBlockDepth, 'nv-active-block')]
        for (let depth = 1; depth < activeBlockDepth; depth += 1) {
          const typeName = $cursor.node(depth).type.name
          const classes: string[] = []
          if (depth === 1) classes.push('nv-active-root')
          if (LIST_TYPE_NAMES.has(typeName)) classes.push('nv-active-list')
          else if (typeName === LIST_ITEM_TYPE_NAME) classes.push('nv-active-list-item')
          if (classes.length > 0) decorations.push(nodeDecoration($cursor, depth, classes.join(' ')))
        }
        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}
