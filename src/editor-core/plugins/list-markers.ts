import type { Node as PMNode, NodeType, Slice } from 'prosemirror-model'
import type { EditorState, Transaction } from 'prosemirror-state'
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

/**
 * Marker text depends on list structure (item order, ordered-list `order` attr, bullet
 * nesting depth) but never on the text content inside a list item. Most keystrokes edit
 * plain paragraph/heading text elsewhere in the document and can't possibly change any
 * marker, so — mirroring `collectRemovedAssetSrcs` in `useEditorCore.ts` — we scan only
 * the changed ranges for a list-related ancestor/insertion before paying for the full
 * recursive `collect()` rebuild. This is intentionally conservative: an edit anywhere
 * inside an existing list (even one that only changes text, not structure) still
 * triggers a full rebuild, since correctly scoping the rebuild to "only the affected
 * list" would require re-deriving bullet nesting depth from the document root anyway.
 */
function transactionTouchesLists(
  prevDoc: PMNode,
  tr: Transaction,
  listItemType: NodeType | undefined,
  bulletListType: NodeType | undefined,
  orderedListType: NodeType | undefined,
): boolean {
  const isListNode = (node: PMNode) =>
    node.type === listItemType || node.type === bulletListType || node.type === orderedListType
  let doc = prevDoc
  for (const step of tr.steps) {
    const stepMap = step.getMap()
    let touched = false
    stepMap.forEach((oldStart, oldEnd) => {
      if (touched || oldEnd <= oldStart) return
      doc.nodesBetween(oldStart, oldEnd, (node) => {
        if (touched) return false
        if (isListNode(node)) { touched = true; return false }
        return true
      })
    })
    if (touched) return true
    const slice = (step as unknown as { slice?: Slice }).slice
    if (slice) {
      let found = false
      slice.content.descendants((node) => {
        if (found) return false
        if (isListNode(node)) { found = true; return false }
        return true
      })
      if (found) return true
    }
    const result = step.apply(doc)
    if (result.doc) doc = result.doc
  }
  return false
}

export function createListMarkerPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      // Markers depend only on document structure, never on selection.
      init: (_, state) => buildDecorations(state),
      apply: (tr, old, oldState, newState) => {
        if (!tr.docChanged) return old
        const schema = newState.schema
        const touched = transactionTouchesLists(
          oldState.doc,
          tr,
          schema.nodes.list_item,
          schema.nodes.bullet_list,
          schema.nodes.ordered_list,
        )
        if (!touched) return old.map(tr.mapping, newState.doc)
        return buildDecorations(newState)
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)
      },
    },
  })
}
