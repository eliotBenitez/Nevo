import { Plugin, PluginKey, NodeSelection, Selection } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode, Slice } from 'prosemirror-model'

const EDGE_RATIO = 0.25
const EDGE_MAX_PX = 120

type DropAction =
  | { type: 'vertical' }
  | { type: 'wrap'; side: 'left' | 'right'; from: number; to: number }
  | { type: 'addColumn'; side: 'left' | 'right'; insertAt: number }

interface DropTarget {
  decoFrom: number
  decoTo: number
  decoClass: string
  action: DropAction
}

const key = new PluginKey<DropTarget | null>('nevo-column-drop')

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.decoFrom === b.decoFrom && a.decoTo === b.decoTo && a.decoClass === b.decoClass
}

function blockRect(view: EditorView, pos: number): DOMRect | null {
  const dom = view.nodeDOM(pos)
  const el = dom instanceof HTMLElement ? dom : dom instanceof Text ? dom.parentElement : null
  return el ? el.getBoundingClientRect() : null
}

function resolveDropTarget(view: EditorView, clientX: number, clientY: number): DropTarget | null {
  const { state } = view
  const columnType = state.schema.nodes.column
  const columnListType = state.schema.nodes.column_list
  if (!columnType || !columnListType) return null

  const posResult = view.posAtCoords({ left: clientX, top: clientY })
  if (!posResult) return null
  const $pos = state.doc.resolve(posResult.pos)

  let columnDepth = -1
  for (let d = $pos.depth; d >= 1; d -= 1) {
    if ($pos.node(d).type === columnType) { columnDepth = d; break }
  }

  // Resolve the edge block (used for horizontal edge detection + column creation)
  // and the inner block (used for the vertical insert indicator).
  let edgeFrom: number
  let edgeTo: number
  let innerFrom: number
  let innerTo: number
  let isColumn = false

  if (columnDepth >= 0) {
    isColumn = true
    edgeFrom = $pos.before(columnDepth)
    edgeTo = edgeFrom + $pos.node(columnDepth).nodeSize
    if ($pos.depth > columnDepth) {
      innerFrom = $pos.before(columnDepth + 1)
      innerTo = innerFrom + $pos.node(columnDepth + 1).nodeSize
    } else {
      innerFrom = edgeFrom
      innerTo = edgeTo
    }
  } else {
    let topPos: number | null = null
    if ($pos.depth >= 1) topPos = $pos.before(1)
    else if (state.doc.nodeAt(posResult.pos)) topPos = posResult.pos
    if (topPos === null) return null
    const topNode = state.doc.nodeAt(topPos)
    if (!topNode) return null
    edgeFrom = topPos
    edgeTo = topPos + topNode.nodeSize
    innerFrom = edgeFrom
    innerTo = edgeTo
  }

  const rect = blockRect(view, edgeFrom)
  if (!rect) return null

  const threshold = Math.min(rect.width * EDGE_RATIO, EDGE_MAX_PX)
  let side: 'left' | 'right' | null = null
  if (clientX <= rect.left + threshold) side = 'left'
  else if (clientX >= rect.right - threshold) side = 'right'

  if (side) {
    if (isColumn) {
      const insertAt = side === 'left' ? edgeFrom : edgeTo
      return { decoFrom: edgeFrom, decoTo: edgeTo, decoClass: `nv-drop-${side}`, action: { type: 'addColumn', side, insertAt } }
    }
    const targetNode = state.doc.nodeAt(edgeFrom)
    // Don't wrap an existing column_list into a column (would nest); fall through to vertical.
    if (targetNode && targetNode.type !== columnListType) {
      return { decoFrom: edgeFrom, decoTo: edgeTo, decoClass: `nv-drop-${side}`, action: { type: 'wrap', side, from: edgeFrom, to: edgeTo } }
    }
  }

  // Vertical: indicate above/below the inner block.
  const innerRect = blockRect(view, innerFrom) ?? rect
  const decoClass = clientY < innerRect.top + innerRect.height / 2 ? 'nv-drop-top' : 'nv-drop-bottom'
  return { decoFrom: innerFrom, decoTo: innerTo, decoClass, action: { type: 'vertical' } }
}

function buildColumnDrop(state: EditorState, slice: Slice, action: DropAction): Transaction | null {
  if (action.type === 'vertical') return null
  const columnType = state.schema.nodes.column
  const columnListType = state.schema.nodes.column_list
  if (!columnType || !columnListType) return null

  const dragged = slice.content.firstChild
  if (!dragged || slice.content.childCount !== 1 || !dragged.isBlock) return null
  if (dragged.type === columnType || dragged.type === columnListType) return null

  const sel = state.selection
  if (!(sel instanceof NodeSelection)) return null
  const srcFrom = sel.from
  const srcTo = sel.to

  try {
    if (action.type === 'wrap') {
      const { from, to, side } = action
      if (rangesOverlap(srcFrom, srcTo, from, to)) return null
      const targetNode = state.doc.nodeAt(from)
      if (!targetNode) return null
      const colTarget = columnType.create(null, targetNode)
      const colDragged = columnType.create(null, dragged)
      const cols = side === 'left' ? [colDragged, colTarget] : [colTarget, colDragged]
      const list = columnListType.create(null, cols)

      const tr = state.tr
      tr.delete(srcFrom, srcTo)
      const mFrom = tr.mapping.map(from)
      const mTo = tr.mapping.map(to)
      tr.replaceWith(mFrom, mTo, list)
      tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(from))))
      return tr.scrollIntoView()
    }

    // addColumn
    const colDragged = columnType.create(null, dragged)
    const tr = state.tr
    tr.delete(srcFrom, srcTo)
    const at = tr.mapping.map(action.insertAt)
    tr.insert(at, colDragged)
    tr.setSelection(Selection.near(tr.doc.resolve(at + 1)))
    return tr.scrollIntoView()
  } catch {
    return null
  }
}

/** A column counts as empty when it holds nothing but empty textblocks (or nothing). */
function columnIsEmpty(col: PMNode): boolean {
  for (let i = 0; i < col.childCount; i++) {
    const child = col.child(i)
    if (!(child.isTextblock && child.content.size === 0)) return false
  }
  return true
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
    if (node.type !== columnListType) return
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

export function createColumnDropPlugin(): Plugin<DropTarget | null> {
  return new Plugin<DropTarget | null>({
    key,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(key)
        if (meta !== undefined) return meta as DropTarget | null
        if (!value || !tr.docChanged) return value
        return { ...value, decoFrom: tr.mapping.map(value.decoFrom), decoTo: tr.mapping.map(value.decoTo) }
      },
    },
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((t) => t.docChanged)) return null
      return normalizeColumns(newState)
    },
    props: {
      decorations(state) {
        const target = key.getState(state)
        if (!target) return null
        return DecorationSet.create(state.doc, [
          Decoration.node(target.decoFrom, target.decoTo, { class: target.decoClass }),
        ])
      },
      handleDOMEvents: {
        dragover(view, event) {
          const target = resolveDropTarget(view, event.clientX, event.clientY)
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          if (!sameTarget(key.getState(view.state) ?? null, target)) {
            view.dispatch(view.state.tr.setMeta(key, target))
          }
          return false
        },
        dragleave(view, event) {
          const related = event.relatedTarget as Node | null
          if (related && view.dom.contains(related)) return false
          if (key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, null))
          return false
        },
        dragend(view) {
          if (key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, null))
          return false
        },
      },
      handleDrop(view, event, slice) {
        const target = resolveDropTarget(view, event.clientX, event.clientY)
        if (!target || target.action.type === 'vertical') {
          if (key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, null))
          return false
        }
        const tr = buildColumnDrop(view.state, slice, target.action)
        if (!tr) {
          if (key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, null))
          return false
        }
        event.preventDefault()
        view.dispatch(tr.setMeta(key, null))
        return true
      },
    },
  })
}
