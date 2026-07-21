import { nextTick, reactive } from 'vue'
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorCore } from './useEditorCore'
import { runGuardedCommand } from './prosemirrorErrors'
import {
  buildGeomCache,
  resolveDropTarget,
  sameTarget,
  buildDropTransaction,
  createDropIndicator,
  resolveAccentColor,
  type GeomCache,
  type DropTarget,
  type DropIndicator,
} from '../../../editor-core/dnd/blockDnd'

export interface BlockHandleState {
  visible: boolean
  position: { top: number; left: number }
  hoveredBlockPos: number | null
  /** Primitive mirror of the hovered block's type so Vue only tracks a string
   *  change instead of deep-proxying a ProseMirror node. */
  hoveredBlockTypeName: string | null
  /** Extra attrs needed to resolve the block icon (e.g. heading level, media kind). */
  hoveredBlockIconAttrs: { level?: number; kind?: string } | null
  isDragging: boolean
  typeMenuOpen: boolean
  typeMenuPosition: { top: number; left: number }
}

interface BlockHandleBounds {
  top: number
  right: number
  bottom: number
  left: number
}

interface BlockHandleMenuSize {
  width: number
  height: number
}

interface UseBlockHandleOptions {
  getHandleBoundaryEl?: () => HTMLElement | null
  getTypeMenuBoundaryEl?: () => HTMLElement | null
  getTypeMenuEl?: () => HTMLElement | null
}

const TYPE_MENU_MARGIN = 12
const TYPE_MENU_OFFSET_Y = 28
const TYPE_MENU_ALIGN_BOTTOM_OFFSET = 6
const BLOCK_HANDLE_WIDTH = 32
const BLOCK_HANDLE_HEIGHT = 22
const BLOCK_HANDLE_BOUNDARY_MARGIN = 4
const BLOCK_HANDLE_TOP_OFFSET = 3
const BLOCK_HANDLE_LEFT_OFFSET = 28
const DRAG_THRESHOLD = 4
const AUTOSCROLL_EDGE = 48
const AUTOSCROLL_SPEED = 14

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Extracts only the primitive attrs the block-handle icon depends on, so Vue
 *  can track a small stable shape instead of a deep ProseMirror node. */
function extractBlockIconAttrs(node: PMNode): { level?: number; kind?: string } | null {
  if (node.type.name === 'heading') return { level: node.attrs.level }
  if (node.type.name === 'media_block') return { kind: node.attrs.kind }
  return null
}

export function resolveBlockHandlePosition(
  blockRect: Pick<DOMRect, 'top' | 'left'>,
  bounds?: Pick<DOMRect, 'left'> | null,
) {
  const preferredLeft = blockRect.left - BLOCK_HANDLE_LEFT_OFFSET
  const minLeft = bounds ? bounds.left + BLOCK_HANDLE_WIDTH + BLOCK_HANDLE_BOUNDARY_MARGIN : preferredLeft

  return {
    top: blockRect.top + BLOCK_HANDLE_TOP_OFFSET,
    left: Math.max(preferredLeft, minLeft),
  }
}

export function isPointInBlockHandleStickyArea(
  point: { x: number; y: number },
  blockRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>,
  handlePosition: { top: number; left: number },
) {
  const left = Math.min(handlePosition.left, blockRect.left) - BLOCK_HANDLE_BOUNDARY_MARGIN
  const right = Math.max(handlePosition.left, blockRect.right)
  const top = Math.min(handlePosition.top, blockRect.top) - BLOCK_HANDLE_BOUNDARY_MARGIN
  const bottom = Math.max(handlePosition.top + BLOCK_HANDLE_HEIGHT, blockRect.bottom) + BLOCK_HANDLE_BOUNDARY_MARGIN

  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
}

export function resolveBlockTypeMenuPosition(
  anchor: { top: number; left: number },
  menuSize: BlockHandleMenuSize,
  bounds: BlockHandleBounds,
  margin = TYPE_MENU_MARGIN,
) {
  const minLeft = bounds.left + margin
  const maxLeft = Math.max(minLeft, bounds.right - margin - menuSize.width)
  const nextLeft = clamp(anchor.left, minLeft, maxLeft)

  const preferredBelowTop = anchor.top + TYPE_MENU_OFFSET_Y
  const preferredAboveTop = anchor.top - menuSize.height + TYPE_MENU_ALIGN_BOTTOM_OFFSET
  const maxTop = bounds.bottom - margin - menuSize.height
  const minTop = bounds.top + margin
  const fitsBelow = preferredBelowTop <= maxTop
  const preferredTop = fitsBelow ? preferredBelowTop : preferredAboveTop
  const nextTop = clamp(preferredTop, minTop, Math.max(minTop, maxTop))

  return { top: nextTop, left: nextLeft }
}

export function resolveTurnIntoSelectionPos(
  doc: PMNode,
  hoveredBlockPos: number,
  selectionFrom: number | null = null,
): number | null {
  const blockNode = doc.nodeAt(hoveredBlockPos)
  if (!blockNode) return null

  const blockEnd = hoveredBlockPos + blockNode.nodeSize
  if (selectionFrom !== null && selectionFrom > hoveredBlockPos && selectionFrom < blockEnd) {
    const $from = doc.resolve(selectionFrom)
    for (let depth = $from.depth; depth >= 1; depth -= 1) {
      if ($from.node(depth).isTextblock) return selectionFrom
    }
  }

  if (blockNode.isTextblock) return hoveredBlockPos + 1

  let textblockPos: number | null = null
  blockNode.descendants((node, pos) => {
    if (textblockPos !== null) return false
    if (!node.isTextblock) return true

    textblockPos = hoveredBlockPos + pos + 2
    return false
  })

  return textblockPos
}

function getViewportBounds(): BlockHandleBounds {
  return {
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    left: 0,
  }
}

function getMeasuredMenuEl(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null
  return (el.firstElementChild as HTMLElement | null) ?? el
}

export function createDeleteBlockTransaction(state: EditorState, pos: number): Transaction | null {
  const docNode = state.doc.nodeAt(pos)
  if (!docNode) return null

  const paragraph = state.schema.nodes.paragraph?.createAndFill()
  if (!paragraph) return null

  if (state.doc.childCount === 1 && pos === 0) {
    const tr = state.tr.replaceWith(0, docNode.nodeSize, paragraph)
    return tr.setSelection(TextSelection.create(tr.doc, 1)).scrollIntoView()
  }

  const tr = state.tr.delete(pos, pos + docNode.nodeSize)
  const selectionPos = Math.min(pos, tr.doc.content.size)
  const direction = selectionPos === 0 ? 1 : -1
  return tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), direction)).scrollIntoView()
}

export function useBlockHandle(core: EditorCore, options: UseBlockHandleOptions = {}) {
  const blockHandle = reactive<BlockHandleState>({
    visible: false,
    position: { top: 0, left: 0 },
    hoveredBlockPos: null,
    hoveredBlockTypeName: null,
    hoveredBlockIconAttrs: null,
    isDragging: false,
    typeMenuOpen: false,
    typeMenuPosition: { top: 0, left: 0 },
  })

  // Heavy/non-reactive refs kept outside Vue's reactivity: a ProseMirror node
  // would otherwise be deep-proxied on every hover, and the DOM element has no
  // reason to be tracked reactively.
  let hoveredBlockDom: HTMLElement | null = null

  let currentDom: EventTarget | null = null
  let isOverHandle = false
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let mouseMoveFrame: number | null = null
  let pendingMousePoint: { x: number; y: number } | null = null
  let touchStart: { x: number; y: number; time: number } | null = null

  function updateTypeMenuPosition() {
    const typeMenuEl = getMeasuredMenuEl(options.getTypeMenuEl?.() ?? null)
    if (!typeMenuEl) return

    const boundaryRect = options.getTypeMenuBoundaryEl?.()?.getBoundingClientRect()
    const bounds = boundaryRect ?? getViewportBounds()
    blockHandle.typeMenuPosition = resolveBlockTypeMenuPosition(
      blockHandle.position,
      { width: typeMenuEl.offsetWidth, height: typeMenuEl.offsetHeight },
      bounds,
    )
  }

  function clearHideTimer() {
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function handleMousePoint(clientX: number, clientY: number) {
    const view = core.editorView
    if (!view) return
    if (blockHandle.isDragging) return

    // Sticky corridor: when moving toward the currently shown handle (which sits in the
    // gap to the left of the active block), keep it instead of recomputing. Without this,
    // crossing into a neighbouring column while reaching the handle makes it jump away.
    if (blockHandle.visible && hoveredBlockDom && !blockHandle.typeMenuOpen) {
      const rect = hoveredBlockDom.getBoundingClientRect()
      if (isPointInBlockHandleStickyArea({ x: clientX, y: clientY }, rect, blockHandle.position)) {
        clearHideTimer()
        return
      }
    }

    let hoveredBlockPos: number | null = null

    const posResult = view.posAtCoords({ left: clientX, top: clientY })
    if (posResult) {
      const $pos = view.state.doc.resolve(posResult.pos)
      const callout = view.state.schema.nodes.callout
      const column = view.state.schema.nodes.column
      let calloutDepth: number | null = null
      let columnDepth: number | null = null

      if (callout) {
        for (let depth = $pos.depth; depth >= 1; depth -= 1) {
          if ($pos.node(depth).type === callout) {
            calloutDepth = depth
            break
          }
        }
      }

      if (column) {
        for (let depth = $pos.depth; depth >= 1; depth -= 1) {
          if ($pos.node(depth).type === column) {
            columnDepth = depth
            break
          }
        }
      }

      if (calloutDepth !== null && (columnDepth === null || calloutDepth > columnDepth)) {
        // Always target the callout itself so the handle shows the correct type
        // and is positioned outside the callout (not overlapping the icon)
        hoveredBlockPos = $pos.before(calloutDepth)
      } else if (columnDepth !== null) {
        // Resolve the block that is a direct child of the column, so each block in a
        // column gets its own handle — even when hovering an empty block or the column's
        // stretched empty space resolves to the column itself instead of the inner block.
        if ($pos.depth > columnDepth) {
          hoveredBlockPos = $pos.before(columnDepth + 1)
        } else {
          const columnNode = $pos.node(columnDepth)
          if (columnNode.childCount > 0) {
            const idx = Math.min($pos.index(columnDepth), columnNode.childCount - 1)
            hoveredBlockPos = $pos.posAtIndex(idx, columnDepth)
          }
        }
      } else if ($pos.depth >= 1) {
        hoveredBlockPos = $pos.before(1)
      } else if (view.state.doc.nodeAt(posResult.pos) !== null) {
        // Atom node (math, mermaid, file, image) — pos lands exactly at block start
        hoveredBlockPos = posResult.pos
      }
    }

    // Fallback: walk DOM upward to find the direct child of view.dom, then match via nodeDOM
    if (hoveredBlockPos === null) {
      let el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
      while (el && el !== view.dom) {
        if (el.parentElement === view.dom) {
          view.state.doc.forEach((_, offset) => {
            if (hoveredBlockPos !== null) return
            if (view.nodeDOM(offset) === el) hoveredBlockPos = offset
          })
          break
        }
        el = el.parentElement
      }
    }

    if (hoveredBlockPos === null) {
      if (!blockHandle.typeMenuOpen) blockHandle.visible = false
      return
    }

    const blockNode = view.state.doc.nodeAt(hoveredBlockPos)
    if (!blockNode) {
      if (!blockHandle.typeMenuOpen) blockHandle.visible = false
      return
    }

    const blockDomRaw = view.nodeDOM(hoveredBlockPos)
    let blockDom: HTMLElement | null = null
    if (blockDomRaw instanceof HTMLElement) {
      blockDom = blockDomRaw
    } else if (blockDomRaw instanceof Text) {
      blockDom = blockDomRaw.parentElement
    }

    if (!blockDom) {
      if (!blockHandle.typeMenuOpen) blockHandle.visible = false
      return
    }

    if (
      blockHandle.visible
      && blockHandle.hoveredBlockPos === hoveredBlockPos
      && hoveredBlockDom === blockDom
      && !blockHandle.typeMenuOpen
    ) return

    const blockRect = blockDom.getBoundingClientRect()
    clearHideTimer()
    blockHandle.visible = true
    blockHandle.hoveredBlockPos = hoveredBlockPos
    blockHandle.hoveredBlockTypeName = blockNode.type.name
    blockHandle.hoveredBlockIconAttrs = extractBlockIconAttrs(blockNode)
    hoveredBlockDom = blockDom
    const handleBounds = options.getHandleBoundaryEl?.()?.getBoundingClientRect()
    blockHandle.position = resolveBlockHandlePosition(blockRect, handleBounds)
  }

  function onMouseMove(event: MouseEvent) {
    pendingMousePoint = { x: event.clientX, y: event.clientY }
    if (mouseMoveFrame !== null) return
    mouseMoveFrame = window.requestAnimationFrame(() => {
      mouseMoveFrame = null
      const point = pendingMousePoint
      pendingMousePoint = null
      if (point) handleMousePoint(point.x, point.y)
    })
  }

  function onWindowMouseMove(event: MouseEvent) {
    if (!blockHandle.visible || !hoveredBlockDom || blockHandle.typeMenuOpen) return
    if (isPointInBlockHandleStickyArea(
      { x: event.clientX, y: event.clientY },
      hoveredBlockDom.getBoundingClientRect(),
      blockHandle.position,
    )) {
      clearHideTimer()
    }
  }

  function onMouseLeave() {
    if (blockHandle.typeMenuOpen) return
    clearHideTimer()
    hideTimer = setTimeout(() => {
      hideTimer = null
      if (!isOverHandle && !blockHandle.typeMenuOpen) blockHandle.visible = false
    }, 120)
  }

  // Touch has no hover, so a quick tap reveals the handle for the tapped block
  // (reusing the pointer geometry). Scrolls and long-press (native text
  // selection) are excluded by the movement/duration thresholds.
  function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) { touchStart = null; return }
    const touch = event.touches[0]
    touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchStart
    touchStart = null
    if (!start || blockHandle.isDragging) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
    if (moved > 10 || Date.now() - start.time > 400) return
    // Defer so ProseMirror finishes placing the caret and layout settles.
    window.setTimeout(() => handleMousePoint(touch.clientX, touch.clientY), 0)
  }

  function onHandleMouseEnter() {
    isOverHandle = true
    clearHideTimer()
  }

  function onHandleMouseLeave() {
    isOverHandle = false
    if (blockHandle.typeMenuOpen) return
    clearHideTimer()
    hideTimer = setTimeout(() => {
      hideTimer = null
      if (!isOverHandle && !blockHandle.typeMenuOpen) blockHandle.visible = false
    }, 120)
  }

  function mount() {
    const view = core.editorView
    if (!view) return
    if (currentDom === view.dom) return
    unmount()
    currentDom = view.dom
    view.dom.addEventListener('mousemove', onMouseMove as EventListener)
    view.dom.addEventListener('mouseleave', onMouseLeave)
    view.dom.addEventListener('touchstart', onTouchStart as EventListener, { passive: true })
    view.dom.addEventListener('touchend', onTouchEnd as EventListener, { passive: true })
    window.addEventListener('mousemove', onWindowMouseMove)
  }

  function unmount() {
    clearHideTimer()
    cleanupDrag()
    if (mouseMoveFrame !== null) {
      window.cancelAnimationFrame(mouseMoveFrame)
      mouseMoveFrame = null
    }
    pendingMousePoint = null
    if (currentDom) {
      currentDom.removeEventListener('mousemove', onMouseMove as EventListener)
      currentDom.removeEventListener('mouseleave', onMouseLeave)
      currentDom.removeEventListener('touchstart', onTouchStart as EventListener)
      currentDom.removeEventListener('touchend', onTouchEnd as EventListener)
      currentDom = null
    }
    window.removeEventListener('mousemove', onWindowMouseMove)
    touchStart = null
    isOverHandle = false
    blockHandle.visible = false
    blockHandle.typeMenuOpen = false
    blockHandle.hoveredBlockPos = null
    blockHandle.hoveredBlockTypeName = null
    blockHandle.hoveredBlockIconAttrs = null
    hoveredBlockDom = null
  }

  // ── Pointer-based block drag ─────────────────────────────────────────────
  // Native HTML5 DnD is janky on WebKitGTK (laggy drag image, unreliable move), so we
  // drive the drag ourselves: a transform-positioned ghost, our own drop indicator with
  // geometry hit-testing, and an explicit move transaction on release.
  let dragGhost: HTMLElement | null = null
  let dropIndicator: DropIndicator | null = null
  let geomCache: GeomCache | null = null
  let draggedNode: PMNode | null = null
  let dragFrom = 0
  let dragTo = 0
  let lastDropTarget: DropTarget | null = null
  let dragActive = false
  let dragPending = false
  let pendingBlockPos: number | null = null
  const pointerStart = { x: 0, y: 0 }
  const lastPointer = { x: 0, y: 0 }
  let scrollViewportRect: { top: number; bottom: number } | null = null
  let autoScrollDir = 0
  let autoScrollFrame: number | null = null

  function onHandlePointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    const view = core.editorView
    if (!view || blockHandle.hoveredBlockPos === null) return
    event.preventDefault()
    pendingBlockPos = blockHandle.hoveredBlockPos
    pointerStart.x = event.clientX
    pointerStart.y = event.clientY
    dragPending = true
    dragActive = false
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', cancelDrag)
    window.addEventListener('keydown', onDragKeyDown)
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragPending) return
    lastPointer.x = event.clientX
    lastPointer.y = event.clientY
    if (!dragActive) {
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
      if (moved < DRAG_THRESHOLD) return
      if (!beginDrag()) { cancelDrag(); return }
    }
    updateDrag(event.clientX, event.clientY)
    updateAutoScroll(event.clientY)
  }

  function beginDrag(): boolean {
    const view = core.editorView
    if (!view || pendingBlockPos === null) return false
    const node = view.state.doc.nodeAt(pendingBlockPos)
    if (!node) return false

    draggedNode = node
    dragFrom = pendingBlockPos
    dragTo = pendingBlockPos + node.nodeSize
    // Select the node so it reads as "picked up" while dragging.
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pendingBlockPos)))
    geomCache = buildGeomCache(view)

    const rect = geomCache.scrollEl.getBoundingClientRect()
    scrollViewportRect = { top: rect.top, bottom: rect.bottom }

    dropIndicator = createDropIndicator()
    dropIndicator.setColor(resolveAccentColor(view.dom as HTMLElement))

    dragGhost = document.createElement('div')
    dragGhost.textContent = node.textContent.trim().slice(0, 80) || '…'
    dragGhost.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'padding:4px 10px', 'border-radius:6px',
      'background:var(--surface-2, rgba(40,40,40,0.92))', 'color:var(--text-1, #fff)',
      'font-size:14px', 'font-family:inherit', 'white-space:nowrap', 'max-width:320px',
      'overflow:hidden', 'text-overflow:ellipsis', 'pointer-events:none',
      'box-shadow:0 2px 12px rgba(0,0,0,0.2)', 'z-index:9002', 'will-change:transform',
    ].join(';')
    document.body.appendChild(dragGhost)

    // Suppress accidental text selection while the pointer drags over editable content
    // (pointerdown.preventDefault doesn't stop the compatibility mousedown selection).
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    blockHandle.isDragging = true
    blockHandle.visible = false
    dragActive = true
    return true
  }

  function updateDrag(x: number, y: number) {
    if (dragGhost) dragGhost.style.transform = `translate(${x + 12}px, ${y + 12}px)`
    const view = core.editorView
    if (!view || !geomCache || !dropIndicator) return
    const target = resolveDropTarget(view, x, y, geomCache)
    if (target) {
      if (!sameTarget(lastDropTarget, target)) {
        lastDropTarget = target
        dropIndicator.show(target.rect, target.edge)
      }
    } else {
      lastDropTarget = null
      dropIndicator.hide()
    }
  }

  function updateAutoScroll(y: number) {
    if (!scrollViewportRect) return
    let dir = 0
    if (y < scrollViewportRect.top + AUTOSCROLL_EDGE) dir = -1
    else if (y > scrollViewportRect.bottom - AUTOSCROLL_EDGE) dir = 1
    autoScrollDir = dir
    if (dir !== 0 && autoScrollFrame === null) autoScrollFrame = window.requestAnimationFrame(autoScrollStep)
  }

  function autoScrollStep() {
    autoScrollFrame = null
    if (!dragActive || autoScrollDir === 0 || !geomCache) return
    geomCache.scrollEl.scrollTop += autoScrollDir * AUTOSCROLL_SPEED
    // Content moved under a possibly-stationary cursor — refresh the indicator.
    updateDrag(lastPointer.x, lastPointer.y)
    autoScrollFrame = window.requestAnimationFrame(autoScrollStep)
  }

  function onPointerUp(event: PointerEvent) {
    if (dragActive) performDrop(event.clientX, event.clientY)
    cleanupDrag()
  }

  function performDrop(x: number, y: number) {
    const view = core.editorView
    if (!view || !geomCache || !draggedNode) return
    const target = resolveDropTarget(view, x, y, geomCache)
    if (target) {
      const tr = buildDropTransaction(view.state, draggedNode, dragFrom, dragTo, target.action)
      if (tr) view.dispatch(tr)
    }
    view.focus()
  }

  function onDragKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') cancelDrag()
  }

  function cancelDrag() {
    cleanupDrag()
  }

  function cleanupDrag() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', cancelDrag)
    window.removeEventListener('keydown', onDragKeyDown)
    if (autoScrollFrame !== null) {
      window.cancelAnimationFrame(autoScrollFrame)
      autoScrollFrame = null
    }
    autoScrollDir = 0
    if (dragGhost) { dragGhost.remove(); dragGhost = null }
    if (dropIndicator) { dropIndicator.destroy(); dropIndicator = null }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    geomCache = null
    draggedNode = null
    lastDropTarget = null
    scrollViewportRect = null
    dragActive = false
    dragPending = false
    pendingBlockPos = null
    blockHandle.isDragging = false
  }

  function onTypeIconClick() {
    const nextOpen = !blockHandle.typeMenuOpen
    blockHandle.typeMenuOpen = nextOpen
    if (!nextOpen) return

    blockHandle.typeMenuPosition = {
      top: blockHandle.position.top + TYPE_MENU_OFFSET_Y,
      left: blockHandle.position.left,
    }

    void nextTick(() => {
      if (!blockHandle.typeMenuOpen) return
      updateTypeMenuPosition()
    })
  }

  function closeTypeMenu() {
    blockHandle.typeMenuOpen = false
  }

  function turnInto(commandId: string) {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null) return
    const selectionPos = resolveTurnIntoSelectionPos(view.state.doc, pos, view.state.selection.from)
    if (selectionPos === null) return
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionPos)))
    const cmd = core.commandRegistry.get(commandId)
    runGuardedCommand(() => {
      cmd?.(view.state, view.dispatch.bind(view))
    }, {
      event: 'block_turn_into_transform_error',
      message: 'Block transform command failed during document transform',
      workspacePath: core.workspacePath,
      payload: { commandId, pos },
    })
    view.focus()
    blockHandle.typeMenuOpen = false
  }

  function duplicateBlock() {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null) return
    const node = view.state.doc.nodeAt(pos)
    if (!node) return
    const copy = node.copy(node.content)
    view.dispatch(view.state.tr.insert(pos + node.nodeSize, copy).scrollIntoView())
    view.focus()
    blockHandle.typeMenuOpen = false
  }

  function insertBlockAbove() {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null) return
    const paragraph = view.state.schema.nodes.paragraph?.createAndFill()
    if (!paragraph) return
    const tr = view.state.tr.insert(pos, paragraph)
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView())
    view.focus()
    blockHandle.typeMenuOpen = false
  }

  function insertBlockBelow() {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null) return
    const node = view.state.doc.nodeAt(pos)
    if (!node) return
    const paragraph = view.state.schema.nodes.paragraph?.createAndFill()
    if (!paragraph) return
    const insertPos = pos + node.nodeSize
    const tr = view.state.tr.insert(insertPos, paragraph)
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView())
    view.focus()
    blockHandle.typeMenuOpen = false
  }

  function deleteBlock() {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null) return
    const tr = createDeleteBlockTransaction(view.state, pos)
    if (!tr) return
    view.dispatch(tr)
    view.focus()
    blockHandle.typeMenuOpen = false
    blockHandle.visible = false
  }

  function copyBlockRef() {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null) return
    const node = view.state.doc.nodeAt(pos)
    if (!node) return
    navigator.clipboard.writeText(node.textContent).catch(() => {})
    blockHandle.typeMenuOpen = false
  }

  return {
    blockHandle,
    mount,
    unmount,
    onHandlePointerDown,
    onTypeIconClick,
    onHandleMouseEnter,
    onHandleMouseLeave,
    onMenuMouseEnter: onHandleMouseEnter,
    onMenuMouseLeave: onHandleMouseLeave,
    closeTypeMenu,
    turnInto,
    duplicateBlock,
    insertBlockAbove,
    insertBlockBelow,
    deleteBlock,
    copyBlockRef,
  }
}
