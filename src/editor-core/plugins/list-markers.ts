import type { Node as PMNode } from 'prosemirror-model'
import type { EditorState } from 'prosemirror-state'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

const key = new PluginKey<DecorationSet>('list-markers')

const bulletMarkers = ['•', '◦', '▪']

function getOrderedStart(parent: PMNode): number {
  const order = Number(parent.attrs.order)
  return Number.isFinite(order) ? order : 1
}

function getListDepth(doc: PMNode, pos: number, listTypeName: string): number {
  const $pos = doc.resolve(pos)
  let depth = 0

  for (let index = 1; index <= $pos.depth; index += 1) {
    if ($pos.node(index).type.name === listTypeName) depth += 1
  }

  return Math.max(depth, 1)
}

function getBulletMarker(doc: PMNode, pos: number, listTypeName: string): string {
  const depth = getListDepth(doc, pos, listTypeName)
  return bulletMarkers[(depth - 1) % bulletMarkers.length]
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = []

  state.doc.descendants((node, pos, parent, index) => {
    if (node.type.name !== 'list_item' || !parent) return true

    if (parent.type.name === 'bullet_list') {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, {
        'data-nevo-list-marker': getBulletMarker(state.doc, pos, parent.type.name),
      }))
      return true
    }

    if (parent.type.name === 'ordered_list') {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, {
        'data-nevo-list-marker': `${getOrderedStart(parent) + index}.`,
      }))
    }

    return true
  })

  return DecorationSet.create(state.doc, decorations)
}

export function createListMarkerPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      // Markers depend only on document structure, never on selection.
      init: (_, state) => buildDecorations(state),
      apply: (tr, old, _oldState, newState) => (tr.docChanged ? buildDecorations(newState) : old),
    },
    props: {
      decorations(state) {
        return key.getState(state)
      },
    },
  })
}
