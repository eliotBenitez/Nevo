import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'

export const headingFoldingKey = new PluginKey('headingFolding')

/**
 * Builds decorations to hide nodes that fall under a collapsed heading.
 * A heading collapses all subsequent nodes until another heading of the same or higher level is reached.
 */
function buildDecorations(doc: Node): DecorationSet {
  const decorations: Decoration[] = []

  function processContainer(container: Node, pos: number) {
    let collapsedLevel: number | null = null

    container.forEach((child, offset) => {
      const childPos = pos + 1 + offset

      if (child.type.name === 'heading') {
        const level = child.attrs.level
        
        // If we were in a collapsed scope, check if this heading ends it
        if (collapsedLevel !== null && level <= collapsedLevel) {
          collapsedLevel = null
        }

        if (collapsedLevel !== null) {
          // This heading itself is hidden because it's under a higher-level collapsed heading
          decorations.push(Decoration.node(childPos, childPos + child.nodeSize, { class: 'nv-heading-folded-hidden' }))
        } else if (child.attrs.collapsed) {
          // This heading is visible but starts a new collapse scope
          collapsedLevel = level
        }
      } else {
        if (collapsedLevel !== null) {
          // This block is hidden
          decorations.push(Decoration.node(childPos, childPos + child.nodeSize, { class: 'nv-heading-folded-hidden' }))
        } else {
          // Visible node. Process its children if it's a container (e.g. blockquote, list).
          if (!child.isTextblock && child.childCount > 0) {
            processContainer(child, childPos)
          }
        }
      }
    })
  }

  processContainer(doc, -1)
  return DecorationSet.create(doc, decorations)
}

export const headingFoldingPlugin = new Plugin({
  key: headingFoldingKey,
  state: {
    init(_, state) {
      return buildDecorations(state.doc)
    },
    apply(tr, old, _oldState, newState) {
      // Rebuild decorations if the document changed or if we explicitly requested an update
      if (tr.docChanged || tr.getMeta(headingFoldingKey)) {
        return buildDecorations(newState.doc)
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
