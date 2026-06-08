import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'

export const toggleFoldingKey = new PluginKey('toggleFolding')

function buildToggleFoldingDecorations(doc: Node): DecorationSet {
  const decorations: Decoration[] = []

  function processContainer(container: Node, pos: number) {
    container.forEach((child, offset) => {
      const childPos = pos + 1 + offset

      if (child.type.name === 'toggle') {
        const collapsed = child.attrs.collapsed === true
        if (collapsed) {
          let firstChild = true
          child.forEach((innerChild, innerOffset) => {
            const innerPos = childPos + 1 + innerOffset
            if (!firstChild) {
              decorations.push(
                Decoration.node(innerPos, innerPos + innerChild.nodeSize, {
                  class: 'nv-toggle-folded-hidden',
                }),
              )
            }
            firstChild = false
          })
        }
      }
    })
  }

  processContainer(doc, -1)
  return DecorationSet.create(doc, decorations)
}

export function createToggleFoldingPlugin(): Plugin {
  return new Plugin({
    key: toggleFoldingKey,
    state: {
      init(_, state) {
        return buildToggleFoldingDecorations(state.doc)
      },
      apply(tr, old, _oldState, newState) {
        if (tr.docChanged || tr.getMeta(toggleFoldingKey)) {
          return buildToggleFoldingDecorations(newState.doc)
        }
        return old
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}