import { nextTick, reactive } from 'vue'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorCore } from './useEditorCore'
import { runGuardedCommand } from './prosemirrorErrors'
import { ensureBlockId } from '../../../editor-core/commands/blockId'
import { encodeBlockRef } from '../../../core/blockRef/resolveBlockRef'
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
import {
  type BlockHandleBounds,
  type BlockHandleMenuSize,
  TYPE_MENU_MARGIN,
  TYPE_MENU_OFFSET_Y,
  TYPE_MENU_ALIGN_BOTTOM_OFFSET,
  BLOCK_HANDLE_WIDTH,
  BLOCK_HANDLE_HEIGHT,
  BLOCK_HANDLE_BOUNDARY_MARGIN,
  BLOCK_HANDLE_TOP_OFFSET,
  BLOCK_HANDLE_LEFT_OFFSET,
  DRAG_THRESHOLD,
  AUTOSCROLL_EDGE,
  AUTOSCROLL_SPEED,
  clamp,
  extractBlockIconAttrs,
  resolveBlockHandlePosition,
  isPointInBlockHandleStickyArea,
  resolveBlockTypeMenuPosition,
  resolveTurnIntoSelectionPos,
  createDeleteBlockTransaction,
  resolveBlockPosFromResolvedPos,
  resolveActiveBlockPos,
} from './blockHandlePosition'

export {
  type BlockHandleBounds,
  type BlockHandleMenuSize,
  TYPE_MENU_MARGIN,
  TYPE_MENU_OFFSET_Y,
  TYPE_MENU_ALIGN_BOTTOM_OFFSET,
  BLOCK_HANDLE_WIDTH,
  BLOCK_HANDLE_HEIGHT,
  BLOCK_HANDLE_BOUNDARY_MARGIN,
  BLOCK_HANDLE_TOP_OFFSET,
  BLOCK_HANDLE_LEFT_OFFSET,
  DRAG_THRESHOLD,
  AUTOSCROLL_EDGE,
  AUTOSCROLL_SPEED,
  clamp,
  extractBlockIconAttrs,
  resolveBlockHandlePosition,
  isPointInBlockHandleStickyArea,
  resolveBlockTypeMenuPosition,
  resolveTurnIntoSelectionPos,
  createDeleteBlockTransaction,
  resolveBlockPosFromResolvedPos,
  resolveActiveBlockPos,
}

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

export interface UseBlockHandleOptions {
  getHandleBoundaryEl?: () => HTMLElement | null
  getTypeMenuBoundaryEl?: () => HTMLElement | null
  getTypeMenuEl?: () => HTMLElement | null
  /** Active note id, needed to encode a `nevo://block/<noteId>/<blockId>`
   *  reference token for `copyBlockRef`. Absent (e.g. an unsaved/no-app-context
   *  preview) makes copyBlockRef a no-op rather than emitting a broken token. */
  getCurrentNoteId?: () => string | null
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

function isEditorFocused(view: { hasFocus?: () => boolean; dom?: Node } | null | undefined): boolean {
  if (!view) return false
  if (typeof view.hasFocus === 'function') {
    return view.hasFocus()
  }
  return Boolean(view.dom && view.dom.contains(document.activeElement))
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

  let currentDom: HTMLElement | null = null
  let isOverHandle = false
  let isHoveringAnotherBlock = false
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let focusOutTimer: ReturnType<typeof setTimeout> | null = null
  let mouseMoveFrame: number | null = null
  let pendingMousePoint: { x: number; y: number } | null = null
  let coarseTapStart: { pointerId: number; x: number; y: number; time: number } | null = null

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

  function clearFocusOutTimer() {
    if (focusOutTimer !== null) {
      clearTimeout(focusOutTimer)
      focusOutTimer = null
    }
  }

  function showForBlock(pos: number): boolean {
    const view = core.editorView
    if (!view || blockHandle.isDragging) return false

    const blockNode = view.state.doc.nodeAt(pos)
    if (!blockNode) return false

    const blockDomRaw = view.nodeDOM(pos)
    let blockDom: HTMLElement | null = null
    if (blockDomRaw instanceof HTMLElement) {
      blockDom = blockDomRaw
    } else if (blockDomRaw instanceof Text) {
      blockDom = blockDomRaw.parentElement
    }

    if (!blockDom) return false

    const blockRect = blockDom.getBoundingClientRect()
    if (blockRect.width === 0 && blockRect.height === 0) return false

    const handleBounds = options.getHandleBoundaryEl?.()?.getBoundingClientRect()
    const nextPosition = resolveBlockHandlePosition(blockRect, handleBounds)

    if (
      blockHandle.visible
      && blockHandle.hoveredBlockPos === pos
      && hoveredBlockDom === blockDom
      && !blockHandle.typeMenuOpen
      && blockHandle.position.top === nextPosition.top
      && blockHandle.position.left === nextPosition.left
    ) {
      clearHideTimer()
      return true
    }

    clearHideTimer()
    blockHandle.visible = true
    blockHandle.hoveredBlockPos = pos
    blockHandle.hoveredBlockTypeName = blockNode.type.name
    blockHandle.hoveredBlockIconAttrs = extractBlockIconAttrs(blockNode)
    hoveredBlockDom = blockDom
    blockHandle.position = nextPosition
    return true
  }

  function updateActiveBlock(): boolean {
    const view = core.editorView
    if (!view || view.isDestroyed || blockHandle.isDragging || blockHandle.typeMenuOpen) return false

    // If currently hovering over another block with the mouse, hover takes priority
    if (isHoveringAnotherBlock) return false

    if (!isEditorFocused(view)) {
      if (!isOverHandle) {
        blockHandle.visible = false
      }
      return false
    }

    const activePos = resolveActiveBlockPos(view.state)
    if (activePos !== null) {
      return showForBlock(activePos)
    }

    if (!isOverHandle) {
      blockHandle.visible = false
    }
    return false
  }

  function reposition() {
    if (!blockHandle.visible || blockHandle.isDragging) return
    if (blockHandle.hoveredBlockPos !== null) {
      showForBlock(blockHandle.hoveredBlockPos)
    }
    if (blockHandle.typeMenuOpen) {
      updateTypeMenuPosition()
    }
  }

  function handleMousePoint(clientX: number, clientY: number) {
    const view = core.editorView
    if (!view || blockHandle.isDragging) return

    // Sticky corridor: when moving toward the currently shown handle (which sits in the
    // gap to the left of the block), keep it instead of recomputing. Without this,
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
      hoveredBlockPos = resolveBlockPosFromResolvedPos($pos, view.state.schema)
      if (hoveredBlockPos === null && view.state.doc.nodeAt(posResult.pos) !== null) {
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
      if (!blockHandle.typeMenuOpen) {
        isHoveringAnotherBlock = false
        if (isEditorFocused(view)) {
          updateActiveBlock()
        } else if (!isOverHandle) {
          blockHandle.visible = false
        }
      }
      return
    }

    const activePos = resolveActiveBlockPos(view.state)
    isHoveringAnotherBlock = activePos !== null && hoveredBlockPos !== activePos

    showForBlock(hoveredBlockPos)
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
      if (isOverHandle || blockHandle.typeMenuOpen) return
      isHoveringAnotherBlock = false
      const view = core.editorView
      if (isEditorFocused(view)) {
        updateActiveBlock()
      } else if (!isOverHandle) {
        blockHandle.visible = false
      }
    }, 120)
  }

  // Touch has no hover. Pointer Events work consistently in the Android
  // webview, including node views that suppress compatibility touch events.
  function onEditorPointerDown(event: PointerEvent) {
    if (
      !event.isPrimary
      || (event.pointerType !== 'touch' && event.pointerType !== 'pen')
      || event.button !== 0
    ) {
      coarseTapStart = null
      return
    }
    coarseTapStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    }
  }

  function onEditorPointerUp(event: PointerEvent) {
    const start = coarseTapStart
    coarseTapStart = null
    if (!start || blockHandle.isDragging) return
    if (event.pointerId !== start.pointerId) return
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved > 10 || Date.now() - start.time > 400) return
    // Defer so ProseMirror finishes placing the caret and layout settles.
    window.setTimeout(() => handleMousePoint(event.clientX, event.clientY), 0)
  }

  function onEditorPointerCancel() {
    coarseTapStart = null
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
      if (isOverHandle || blockHandle.typeMenuOpen) return
      isHoveringAnotherBlock = false
      const view = core.editorView
      if (isEditorFocused(view)) {
        updateActiveBlock()
      } else {
        blockHandle.visible = false
      }
    }, 120)
  }

  function onEditorFocusIn() {
    clearFocusOutTimer()
    isHoveringAnotherBlock = false
    updateActiveBlock()
  }

  function onEditorFocusOut(event: FocusEvent) {
    const related = event.relatedTarget as Node | null
    if (related && (options.getHandleBoundaryEl?.()?.contains(related) || options.getTypeMenuEl?.()?.contains(related))) {
      return
    }
    clearFocusOutTimer()
    focusOutTimer = setTimeout(() => {
      focusOutTimer = null
      if (!isEditorFocused(core.editorView) && !blockHandle.typeMenuOpen && !isOverHandle) {
        blockHandle.visible = false
      }
    }, 120)
  }

  function onDocumentSelectionChange() {
    const view = core.editorView
    if (!view || view.isDestroyed || !isEditorFocused(view)) return
    isHoveringAnotherBlock = false
    updateActiveBlock()
  }

  function onEditorKeyUp() {
    isHoveringAnotherBlock = false
    updateActiveBlock()
  }

  function mount() {
    const view = core.editorView
    if (!view) return
    if (currentDom === view.dom) return
    unmount()
    currentDom = view.dom as HTMLElement
    view.dom.addEventListener('mousemove', onMouseMove as EventListener)
    view.dom.addEventListener('mouseleave', onMouseLeave)
    view.dom.addEventListener('pointerdown', onEditorPointerDown as EventListener, { passive: true, capture: true })
    view.dom.addEventListener('pointerup', onEditorPointerUp as EventListener, { passive: true, capture: true })
    view.dom.addEventListener('pointercancel', onEditorPointerCancel as EventListener, { passive: true, capture: true })
    view.dom.addEventListener('focusin', onEditorFocusIn as EventListener)
    view.dom.addEventListener('focusout', onEditorFocusOut as EventListener)
    view.dom.addEventListener('keyup', onEditorKeyUp as EventListener)
    window.addEventListener('mousemove', onWindowMouseMove)
    document.addEventListener('selectionchange', onDocumentSelectionChange)

    if (isEditorFocused(view)) {
      updateActiveBlock()
    }
  }

  function unmount() {
    clearHideTimer()
    clearFocusOutTimer()
    cleanupDrag()
    if (mouseMoveFrame !== null) {
      window.cancelAnimationFrame(mouseMoveFrame)
      mouseMoveFrame = null
    }
    pendingMousePoint = null
    if (currentDom) {
      currentDom.removeEventListener('mousemove', onMouseMove as EventListener)
      currentDom.removeEventListener('mouseleave', onMouseLeave)
      currentDom.removeEventListener('pointerdown', onEditorPointerDown as EventListener, true)
      currentDom.removeEventListener('pointerup', onEditorPointerUp as EventListener, true)
      currentDom.removeEventListener('pointercancel', onEditorPointerCancel as EventListener, true)
      currentDom.removeEventListener('focusin', onEditorFocusIn as EventListener)
      currentDom.removeEventListener('focusout', onEditorFocusOut as EventListener)
      currentDom.removeEventListener('keyup', onEditorKeyUp as EventListener)
      currentDom = null
    }
    window.removeEventListener('mousemove', onWindowMouseMove)
    document.removeEventListener('selectionchange', onDocumentSelectionChange)
    coarseTapStart = null
    isOverHandle = false
    isHoveringAnotherBlock = false
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
      'background:var(--surface-overlay, rgba(40,40,40,0.92))', 'color:var(--text-primary, #fff)',
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
    if (isEditorFocused(core.editorView)) {
      updateActiveBlock()
    } else {
      blockHandle.visible = false
    }
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
    isHoveringAnotherBlock = false
    void nextTick(() => {
      updateActiveBlock()
    })
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
    isHoveringAnotherBlock = false
    void nextTick(() => {
      updateActiveBlock()
    })
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
    blockHandle.visible = false
    isHoveringAnotherBlock = false
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
    blockHandle.visible = false
    isHoveringAnotherBlock = false
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
    isHoveringAnotherBlock = false
    void nextTick(() => {
      updateActiveBlock()
    })
  }

  /**
   * "Copy block reference" (block-handle action). Assigns/reads a stable
   * block id via `ensureBlockId` (idempotent — a second copy of the same
   * block reuses its id) and writes a `nevo://block/<noteId>/<blockId>`
   * token to the clipboard, meant to be pasted elsewhere to create a
   * `block_embed` transclusion (see `usePasteHandling.ts`). No-op when the
   * block's node type never declared an `id` attr (non-referenceable, e.g.
   * `note_embed`/`image_block`) or the active note id is unavailable.
   */
  function copyBlockRef() {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null) return
    const noteId = options.getCurrentNoteId?.()
    if (!noteId) return
    const blockId = ensureBlockId(view, pos)
    if (!blockId) return
    navigator.clipboard.writeText(encodeBlockRef({ noteId, blockId })).catch(() => {})
    blockHandle.typeMenuOpen = false
  }

  return {
    blockHandle,
    mount,
    unmount,
    updateActiveBlock,
    reposition,
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
