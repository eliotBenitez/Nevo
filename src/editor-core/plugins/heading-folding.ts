import { Plugin, PluginKey } from 'prosemirror-state'
import type { Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'

export const headingFoldingKey = new PluginKey('headingFolding')

/**
 * Detects whether a transaction structurally affects heading nodes (insert,
 * delete, level change, collapse toggle). Returns false for pure text edits
 * inside non-heading blocks — the common typing case on large documents —
 * so the decoration set can be cheaply remapped instead of fully rebuilt.
 *
 * Walks only the changed ranges reported by each step's map (not the whole
 * document): a heading is affected if one appears in any old or new range.
 */
function transactionAffectsHeadings(tr: Transaction): boolean {
  let affects = false
  let before = tr.before
  for (const step of tr.steps) {
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (affects) return
      if (oldEnd > oldStart) {
        before.nodesBetween(oldStart, oldEnd, (node) => {
          if (node.type.name === 'heading') { affects = true; return false }
          return true
        })
      }
      if (!affects && newEnd > newStart) {
        tr.doc.nodesBetween(newStart, newEnd, (node) => {
          if (node.type.name === 'heading') { affects = true; return false }
          return true
        })
      }
    })
    if (affects) return true
    before = step.apply(before).doc ?? before
  }
  return false
}

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
      // Forced rebuild via explicit meta (fold/unfold commands).
      if (tr.getMeta(headingFoldingKey)) {
        return buildDecorations(newState.doc)
      }
      if (!tr.docChanged) return old
      // Avoid the O(document) rebuild for the common typing case: if no step
      // touched a heading, the existing decorations stay structurally valid
      // and only need their positions remapped.
      if (!transactionAffectsHeadings(tr)) {
        return old.map(tr.mapping, tr.doc)
      }
      return buildDecorations(newState.doc)
    },
  },
  props: {
    decorations(state) {
      return this.getState(state)
    },
  },
})
