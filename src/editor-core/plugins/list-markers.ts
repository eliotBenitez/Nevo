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

function getBulletMarker(bulletDepth: number): string {
  return bulletMarkers[(Math.max(bulletDepth, 1) - 1) % bulletMarkers.length]
}

/**
 * Manual descent that carries the current bullet-list nesting depth, so we never
 * call `doc.resolve(pos)` per list item (which allocated a ResolvedPos and walked
 * the ancestor chain on every item, every keystroke). `parentPos` is the document
 * position immediately inside `parent` (i.e. before its first child).
 */
function collect(parent: PMNode, parentPos: number, bulletDepth: number, decorations: Decoration[]): void {
  const orderedStart = parent.type.name === 'ordered_list' ? getOrderedStart(parent) : 0
  let offset = 0
  parent.forEach((child, _childOffset, index) => {
    const absPos = parentPos + offset
    offset += child.nodeSize

    if (child.type.name === 'list_item') {
      if (parent.type.name === 'bullet_list') {
        decorations.push(Decoration.node(absPos, absPos + child.nodeSize, {
          'data-nevo-list-marker': getBulletMarker(bulletDepth),
        }))
      } else if (parent.type.name === 'ordered_list') {
        decorations.push(Decoration.node(absPos, absPos + child.nodeSize, {
          'data-nevo-list-marker': `${orderedStart + index}.`,
        }))
      }
    }

    if (child.childCount > 0) {
      const nextBulletDepth = child.type.name === 'bullet_list' ? bulletDepth + 1 : bulletDepth
      collect(child, absPos + 1, nextBulletDepth, decorations)
    }
  })
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = []
  collect(state.doc, 0, 0, decorations)
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
