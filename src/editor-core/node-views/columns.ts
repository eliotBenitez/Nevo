import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { resolveNodePosition, type NodeViewPosition } from './utils'

const MIN_COLUMN_PX = 60

function getWidth(node: PMNode): number {
  const w = node.attrs.width
  return typeof w === 'number' && w > 0 ? w : 1
}

export function createColumnNodeView(node: PMNode): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-column'

  const contentDOM = document.createElement('div')
  contentDOM.className = 'nv-column-content'
  dom.appendChild(contentDOM)

  let currentNode = node
  const sync = () => {
    dom.style.flex = `${getWidth(currentNode)} 1 0`
  }
  sync()

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    ignoreMutation(mutation) {
      // The flex style is presentational and updated live during resize.
      return mutation.type === 'attributes' && mutation.target === dom
    },
  }
}

export function createColumnListNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-column-list'

  const row = document.createElement('div')
  row.className = 'nv-column-list-row'
  dom.appendChild(row)

  let currentNode = node
  let handles: HTMLElement[] = []

  // Live resize state.
  let active: {
    handle: HTMLElement
    index: number
    startX: number
    startLeftPx: number
    totalPx: number
    totalGrow: number
    left: HTMLElement
    right: HTMLElement
  } | null = null
  let pending: { leftWidth: number; rightWidth: number } | null = null

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

  const columnEls = () => Array.from(row.children).filter((el): el is HTMLElement => el instanceof HTMLElement)

  const layoutHandles = () => {
    const cols = columnEls()
    const domRect = dom.getBoundingClientRect()
    for (let i = 0; i < handles.length; i++) {
      const a = cols[i]?.getBoundingClientRect()
      const b = cols[i + 1]?.getBoundingClientRect()
      if (!a || !b) continue
      handles[i].style.left = `${(a.right + b.left) / 2 - domRect.left}px`
    }
  }

  const columnPos = (index: number): number | null => {
    const listPos = resolveNodePosition(getPos)
    if (typeof listPos !== 'number') return null
    let pos = listPos + 1
    for (let i = 0; i < index; i++) pos += currentNode.child(i).nodeSize
    return pos
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!active) return
    const dx = event.clientX - active.startX
    const ratio = active.totalGrow / active.totalPx
    const newLeftPx = clamp(active.startLeftPx + dx, MIN_COLUMN_PX, active.totalPx - MIN_COLUMN_PX)
    const leftWidth = newLeftPx * ratio
    const rightWidth = active.totalGrow - leftWidth
    active.left.style.flex = `${leftWidth} 1 0`
    active.right.style.flex = `${rightWidth} 1 0`
    pending = { leftWidth, rightWidth }
    layoutHandles()
  }

  const endResize = (event: PointerEvent) => {
    if (!active) return
    const { index, handle } = active
    handle.classList.remove('is-resizing')
    dom.classList.remove('nv-column-resizing')
    try { handle.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endResize)

    if (pending) {
      const leftPos = columnPos(index)
      const rightPos = columnPos(index + 1)
      if (typeof leftPos === 'number' && typeof rightPos === 'number') {
        const leftNode = currentNode.child(index)
        const rightNode = currentNode.child(index + 1)
        const tr = view.state.tr
          .setNodeMarkup(leftPos, undefined, { ...leftNode.attrs, width: pending.leftWidth })
          .setNodeMarkup(rightPos, undefined, { ...rightNode.attrs, width: pending.rightWidth })
        view.dispatch(tr)
      }
    }
    active = null
    pending = null
  }

  const onHandlePointerDown = (event: PointerEvent, index: number, handle: HTMLElement) => {
    event.preventDefault()
    event.stopPropagation()
    const cols = columnEls()
    const left = cols[index]
    const right = cols[index + 1]
    if (!left || !right) return
    const leftRect = left.getBoundingClientRect()
    const rightRect = right.getBoundingClientRect()
    active = {
      handle,
      index,
      startX: event.clientX,
      startLeftPx: leftRect.width,
      totalPx: leftRect.width + rightRect.width,
      totalGrow: getWidth(currentNode.child(index)) + getWidth(currentNode.child(index + 1)),
      left,
      right,
    }
    pending = null
    handle.classList.add('is-resizing')
    dom.classList.add('nv-column-resizing')
    try { handle.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endResize)
  }

  const rebuildHandles = () => {
    const needed = Math.max(0, currentNode.childCount - 1)
    if (handles.length === needed) return
    for (const h of handles) h.remove()
    handles = []
    for (let i = 0; i < needed; i++) {
      const handle = document.createElement('div')
      handle.className = 'nv-column-gutter'
      handle.contentEditable = 'false'
      handle.setAttribute('aria-hidden', 'true')
      handle.appendChild(document.createElement('span'))
      handle.addEventListener('pointerdown', (e) => onHandlePointerDown(e, i, handle))
      handle.addEventListener('mousedown', (e) => e.preventDefault())
      dom.appendChild(handle)
      handles.push(handle)
    }
  }

  const resizeObserver = new ResizeObserver(() => layoutHandles())
  resizeObserver.observe(row)

  rebuildHandles()
  requestAnimationFrame(layoutHandles)

  return {
    dom,
    contentDOM: row,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      rebuildHandles()
      requestAnimationFrame(layoutHandles)
      return true
    },
    ignoreMutation(mutation) {
      // Gutter handles live outside contentDOM; ignore their attribute/child mutations.
      return mutation.target !== row && !row.contains(mutation.target as Node)
    },
    destroy() {
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endResize)
    },
  }
}
