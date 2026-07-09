import { Plugin } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { Node as PMNode, NodeType } from 'prosemirror-model'
import type { Slice } from 'prosemirror-model'

/** A column counts as empty when it holds nothing but empty textblocks (or nothing). */
function columnIsEmpty(col: PMNode): boolean {
  for (let i = 0; i < col.childCount; i++) {
    const child = col.child(i)
    if (!(child.isTextblock && child.content.size === 0)) return false
  }
  return true
}

/**
 * Cheap pre-check: does this transaction's change even come near a column/column_list?
 * Mirrors the `collectRemovedAssetSrcs` pattern in `useEditorCore.ts` — scan only the
 * (small) changed ranges instead of the whole document, and bail out before the full
 * (pruned) `normalizeColumns` traversal when there is nothing column-related to fix.
 * Deliberately conservative: it flags "touched" for any edit inside a column's subtree,
 * even ones that don't actually empty it, so we never miss a genuine cleanup.
 */
function hasColumnAncestor(doc: PMNode, pos: number, isColumnNode: (node: PMNode) => boolean): boolean {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)
  for (let d = $pos.depth; d >= 0; d--) {
    if (isColumnNode($pos.node(d))) return true
  }
  return false
}

function transactionTouchesColumns(prevDoc: PMNode, tr: Transaction, columnType: NodeType, columnListType: NodeType): boolean {
  const isColumnNode = (node: PMNode) => node.type === columnType || node.type === columnListType
  let doc = prevDoc
  for (const step of tr.steps) {
    const stepMap = step.getMap()
    let touched = false
    stepMap.forEach((oldStart, oldEnd) => {
      if (touched) return
      // Ancestor check: catches plain insertions landing inside a column (no
      // deletion, so there's nothing for `nodesBetween` below to find) as well as
      // edits/deletions that start inside a column's content.
      if (hasColumnAncestor(doc, oldStart, isColumnNode)) { touched = true; return }
      if (oldEnd <= oldStart) return
      // Range check: catches deletions that remove a column/column_list node
      // wholesale, where the node itself is a sibling of `oldStart`, not an ancestor.
      doc.nodesBetween(oldStart, oldEnd, (node) => {
        if (touched) return false
        if (isColumnNode(node)) { touched = true; return false }
        return true
      })
    })
    if (touched) return true
    const slice = (step as unknown as { slice?: Slice }).slice
    if (slice) {
      let found = false
      slice.content.descendants((node) => {
        if (found) return false
        if (isColumnNode(node)) { found = true; return false }
        return true
      })
      if (found) return true
    }
    const result = step.apply(doc)
    if (result.doc) doc = result.doc
  }
  return false
}

/** Removes empty columns and unwraps column_lists left with fewer than two columns. */
function normalizeColumns(state: EditorState): Transaction | null {
  const columnType = state.schema.nodes.column
  const columnListType = state.schema.nodes.column_list
  if (!columnType || !columnListType) return null

  const selFrom = state.selection.from
  // Keep an empty column if the cursor is inside it, so it doesn't collapse while editing.
  const shouldKeep = (col: PMNode, start: number, end: number) =>
    col.type === columnType && (!columnIsEmpty(col) || (selFrom > start && selFrom < end))

  const targets: Array<{ from: number; to: number; attrs: PMNode['attrs']; kept: PMNode[] }> = []
  state.doc.descendants((node, pos) => {
    // Column lists can only ever appear inside other block containers (never inside a
    // textblock's inline content), so pruning textblock/leaf subtrees skips the vast
    // majority of a typical document (paragraph text, headings, code) without missing
    // any nested column_list.
    if (node.isTextblock || node.isLeaf) return false
    if (node.type !== columnListType) return true
    const kept: PMNode[] = []
    let changed = false
    let childPos = pos + 1
    node.forEach((col) => {
      const start = childPos
      const end = childPos + col.nodeSize
      childPos = end
      if (shouldKeep(col, start, end)) kept.push(col)
      else changed = true
    })
    if (changed || kept.length < 2) targets.push({ from: pos, to: pos + node.nodeSize, attrs: node.attrs, kept })
    // Keep descending: a column can itself contain a nested column_list.
    return true
  })
  if (!targets.length) return null

  const tr = state.tr
  for (const { from, to, attrs, kept } of targets) {
    const mFrom = tr.mapping.map(from, -1)
    const mTo = tr.mapping.map(to, 1)
    if (kept.length >= 2) tr.replaceWith(mFrom, mTo, columnListType.create(attrs, kept))
    else if (kept.length === 1) tr.replaceWith(mFrom, mTo, kept[0].content)
    else tr.delete(mFrom, mTo)
  }
  return tr.docChanged ? tr : null
}

// Block drag-and-drop itself is driven by pointer events from the block handle (see
// useBlockHandle). This plugin only keeps the document tidy after a drop: collapsing
// empty columns and unwrapping single-column lists.
export function createColumnDropPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      const changed = transactions.filter((t) => t.docChanged)
      if (!changed.length) return null

      const columnType = newState.schema.nodes.column
      const columnListType = newState.schema.nodes.column_list
      if (!columnType || !columnListType) return null

      // Early exit: skip the (already-pruned) full traversal entirely unless one of
      // this transaction's changes actually landed inside a column/column_list.
      let doc = oldState.doc
      const touched = changed.some((tr) => {
        const result = transactionTouchesColumns(doc, tr, columnType, columnListType)
        doc = tr.doc
        return result
      })
      if (!touched) return null

      return normalizeColumns(newState)
    },
  })
}
