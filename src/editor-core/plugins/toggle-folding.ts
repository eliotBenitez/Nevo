import { Plugin, PluginKey } from 'prosemirror-state'
import type { Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'

export const toggleFoldingKey = new PluginKey('toggleFolding')

/**
 * Detects whether a transaction structurally affects toggle nodes (insert,
 * delete, or collapse/attrs change). Returns false for pure text edits inside
 * non-toggle blocks so the decoration set can be cheaply remapped.
 *
 * Walks only the changed ranges reported by each step's map (not the whole
 * document): a toggle is affected if one appears in any old or new range.
 */
function transactionAffectsToggles(tr: Transaction): boolean {
  let affects = false
  let before = tr.before
  for (const step of tr.steps) {
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (affects) return
      if (oldEnd > oldStart) {
        before.nodesBetween(oldStart, oldEnd, (node) => {
          if (node.type.name === 'toggle') { affects = true; return false }
          return true
        })
      }
      if (!affects && newEnd > newStart) {
        tr.doc.nodesBetween(newStart, newEnd, (node) => {
          if (node.type.name === 'toggle') { affects = true; return false }
          return true
        })
      }
    })
    if (affects) return true
    before = step.apply(before).doc ?? before
  }
  return false
}

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
      if (tr.getMeta(toggleFoldingKey)) {
        return buildToggleFoldingDecorations(newState.doc)
      }
      if (!tr.docChanged) return old
      // Avoid the O(document) rebuild for pure text edits inside non-toggle
      // blocks: remap the existing decorations by mapping instead.
      if (!transactionAffectsToggles(tr)) {
        return old.map(tr.mapping, tr.doc)
      }
      return buildToggleFoldingDecorations(newState.doc)
    },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}