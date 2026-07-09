import { Selection } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'

const EDGE_RATIO = 0.25
const EDGE_MAX_PX = 120

export type DropAction =
  | { type: 'vertical'; insertAt: number }
  | { type: 'wrap'; side: 'left' | 'right'; from: number; to: number }
  | { type: 'addColumn'; side: 'left' | 'right'; insertAt: number }

export interface DropTarget {
  rect: DOMRect
  edge: 'left' | 'right' | 'top' | 'bottom'
  action: DropAction
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2
}

export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.edge === b.edge &&
    a.rect.left === b.rect.left &&
    a.rect.top === b.rect.top &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  )
}

function blockRect(view: EditorView, pos: number): DOMRect | null {
  const dom = view.nodeDOM(pos)
  const el = dom instanceof HTMLElement ? dom : dom instanceof Text ? dom.parentElement : null
  return el ? el.getBoundingClientRect() : null
}

// Geometry snapshot taken once when a drag gesture starts. The document never changes
// mid-drag, so caching top-level block rects lets each move hit-test with pure math
// instead of document.elementFromPoint (~6ms per call in large notes on WebKitGTK).
interface BlockGeom {
  pos: number
  top: number
  bottom: number
}

export interface GeomCache {
  blocks: BlockGeom[]
  scrollEl: HTMLElement
  scrollTop: number
}

function findScrollParent(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    const scrollable = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
    if (scrollable && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export function buildGeomCache(view: EditorView): GeomCache {
  const blocks: BlockGeom[] = []
  view.state.doc.forEach((_node, offset) => {
    const rect = blockRect(view, offset)
    if (rect) blocks.push({ pos: offset, top: rect.top, bottom: rect.bottom })
  })
  const scrollEl = findScrollParent(view.dom as HTMLElement)
  return { blocks, scrollEl, scrollTop: scrollEl.scrollTop }
}

// Maps a viewport Y to the nearest top-level block position from the snapshot,
// adjusted for any scrolling that happened since the snapshot was taken.
function blockPosAtY(cache: GeomCache, clientY: number): number | null {
  const { blocks } = cache
  if (blocks.length === 0) return null
  const y = clientY + (cache.scrollEl.scrollTop - cache.scrollTop)
  if (y <= blocks[0].top) return blocks[0].pos
  const last = blocks[blocks.length - 1]
  if (y >= last.bottom) return last.pos

  let lo = 0
  let hi = blocks.length - 1
  let idx = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (blocks[mid].top <= y) { idx = mid; lo = mid + 1 } else hi = mid - 1
  }
  const block = blocks[idx]
  if (y <= block.bottom) return block.pos
  const next = blocks[idx + 1]
  if (!next) return block.pos
  return y - block.bottom <= next.top - y ? block.pos : next.pos
}

// Resolves the column (for edge ops) and inner child block (for the vertical indicator)
// under the cursor inside a column_list. Rare path, so a small on-demand rect scan is fine.
function resolveColumnTarget(
  view: EditorView,
  listPos: number,
  listNode: PMNode,
  clientX: number,
  clientY: number,
): { edgeFrom: number; edgeTo: number; innerFrom: number } | null {
  let bestColFrom = -1
  let bestColTo = -1
  let bestColNode: PMNode | null = null
  let bestColDist = Infinity
  let childPos = listPos + 1
  listNode.forEach((col) => {
    const from = childPos
    const to = from + col.nodeSize
    childPos = to
    const rect = blockRect(view, from)
    if (!rect) return
    const dist = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0
    if (dist < bestColDist) {
      bestColDist = dist
      bestColFrom = from
      bestColTo = to
      bestColNode = col
    }
  })
  if (bestColNode === null) return null

  let innerFrom = bestColFrom
  let bestChildDist = Infinity
  let innerPos = bestColFrom + 1
  ;(bestColNode as PMNode).forEach((child) => {
    const from = innerPos
    innerPos = from + child.nodeSize
    const rect = blockRect(view, from)
    if (!rect) return
    const dist = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
    if (dist < bestChildDist) {
      bestChildDist = dist
      innerFrom = from
    }
  })

  return { edgeFrom: bestColFrom, edgeTo: bestColTo, innerFrom }
}

export function resolveDropTarget(view: EditorView, clientX: number, clientY: number, cache: GeomCache): DropTarget | null {
  const { state } = view
  const columnType = state.schema.nodes.column
  const columnListType = state.schema.nodes.column_list
  if (!columnType || !columnListType) return null

  const blockPos = blockPosAtY(cache, clientY)
  if (blockPos === null) return null
  const blockNode = state.doc.nodeAt(blockPos)
  if (!blockNode) return null

  let edgeFrom: number
  let edgeTo: number
  let innerFrom: number
  let isColumn = false

  if (blockNode.type === columnListType) {
    const col = resolveColumnTarget(view, blockPos, blockNode, clientX, clientY)
    if (!col) return null
    edgeFrom = col.edgeFrom
    edgeTo = col.edgeTo
    innerFrom = col.innerFrom
    isColumn = true
  } else {
    edgeFrom = blockPos
    edgeTo = blockPos + blockNode.nodeSize
    innerFrom = blockPos
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
      return { rect, edge: side, action: { type: 'addColumn', side, insertAt } }
    }
    const targetNode = state.doc.nodeAt(edgeFrom)
    // Don't wrap an existing column_list into a column (would nest); fall through to vertical.
    if (targetNode && targetNode.type !== columnListType) {
      return { rect, edge: side, action: { type: 'wrap', side, from: edgeFrom, to: edgeTo } }
    }
  }

  // Vertical: indicate above/below the inner block.
  const innerRect = blockRect(view, innerFrom) ?? rect
  const edge = clientY < innerRect.top + innerRect.height / 2 ? 'top' : 'bottom'
  const innerNode = state.doc.nodeAt(innerFrom)
  const insertAt = edge === 'top' ? innerFrom : innerFrom + (innerNode?.nodeSize ?? 0)
  return { rect: innerRect, edge, action: { type: 'vertical', insertAt } }
}

// Move for a plain vertical drop: delete the source node and re-insert it at the target.
function buildVerticalMove(state: EditorState, dragged: PMNode, srcFrom: number, srcTo: number, insertAt: number): Transaction | null {
  // Dropping onto itself is a no-op.
  if (insertAt >= srcFrom && insertAt <= srcTo) return null

  try {
    const tr = state.tr
    tr.delete(srcFrom, srcTo)
    const at = tr.mapping.map(insertAt)
    tr.insert(at, dragged)
    tr.setSelection(Selection.near(tr.doc.resolve(at)))
    return tr.scrollIntoView()
  } catch {
    return null
  }
}

function buildColumnDrop(state: EditorState, dragged: PMNode, srcFrom: number, srcTo: number, action: DropAction): Transaction | null {
  if (action.type === 'vertical') return null
  const columnType = state.schema.nodes.column
  const columnListType = state.schema.nodes.column_list
  if (!columnType || !columnListType) return null
  if (dragged.type === columnType || dragged.type === columnListType) return null

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

// Builds the transaction that applies a drop action as a MOVE of the dragged node.
// The source range [srcFrom, srcTo] is captured when the drag starts (the document
// doesn't change mid-drag), so the move never depends on the live editor selection.
export function buildDropTransaction(
  state: EditorState,
  dragged: PMNode,
  srcFrom: number,
  srcTo: number,
  action: DropAction,
): Transaction | null {
  if (!dragged.isBlock) return null
  return action.type === 'vertical'
    ? buildVerticalMove(state, dragged, srcFrom, srcTo, action.insertAt)
    : buildColumnDrop(state, dragged, srcFrom, srcTo, action)
}

export interface DropIndicator {
  show(rect: DOMRect, edge: 'left' | 'right' | 'top' | 'bottom'): void
  hide(): void
  setColor(color: string): void
  destroy(): void
}

// Resolves the themed accent to a concrete rgb() value by probing inside the editor's
// DOM scope. The overlay lives on document.body, so it can't rely on inheriting
// --accent; this also resolves oklch() to an rgb the indicator can use.
export function resolveAccentColor(host: HTMLElement): string {
  const probe = document.createElement('span')
  probe.style.color = 'var(--accent)'
  probe.style.display = 'none'
  host.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

export function createDropIndicator(): DropIndicator {
  const el = document.createElement('div')
  el.className = 'nv-drop-indicator'
  el.style.display = 'none'
  document.body.appendChild(el)

  return {
    show(rect: DOMRect, edge: 'left' | 'right' | 'top' | 'bottom') {
      let left: number
      let top: number
      let width: number
      let height: number

      if (edge === 'top') {
        left = rect.left
        top = rect.top
        width = rect.width
        height = 3
      } else if (edge === 'bottom') {
        left = rect.left
        top = rect.bottom - 3
        width = rect.width
        height = 3
      } else if (edge === 'left') {
        left = rect.left
        top = rect.top
        width = 3
        height = rect.height
      } else {
        left = rect.right - 3
        top = rect.top
        width = 3
        height = rect.height
      }

      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.width = `${width}px`
      el.style.height = `${height}px`
      el.style.display = 'block'
    },
    hide() {
      el.style.display = 'none'
    },
    setColor(color: string) {
      if (color) el.style.background = color
    },
    destroy() {
      el.remove()
    },
  }
}
