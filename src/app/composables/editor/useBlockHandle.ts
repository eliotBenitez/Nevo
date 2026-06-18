import { nextTick, reactive } from 'vue'
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorCore } from './useEditorCore'
import { appLogger } from '../../../utils/logger'
import { isProseMirrorTransformError } from './prosemirrorErrors'

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
const BLOCK_HANDLE_BOUNDARY_MARGIN = 4
const BLOCK_HANDLE_TOP_OFFSET = 3
const BLOCK_HANDLE_LEFT_OFFSET = 28

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

    // Sticky corridor: when moving toward the currently shown handle (which sits in the
    // gap to the left of the active block), keep it instead of recomputing. Without this,
    // crossing into a neighbouring column while reaching the handle makes it jump away.
    if (blockHandle.visible && hoveredBlockDom && !blockHandle.typeMenuOpen) {
      const rect = hoveredBlockDom.getBoundingClientRect()
      const corridorLeft = blockHandle.position.left - BLOCK_HANDLE_BOUNDARY_MARGIN
      if (clientY >= rect.top && clientY <= rect.bottom && clientX >= corridorLeft && clientX <= rect.right) {
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

  function onMouseLeave() {
    if (blockHandle.typeMenuOpen) return
    clearHideTimer()
    hideTimer = setTimeout(() => {
      hideTimer = null
      if (!isOverHandle && !blockHandle.typeMenuOpen) blockHandle.visible = false
    }, 120)
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
  }

  function unmount() {
    clearHideTimer()
    if (mouseMoveFrame !== null) {
      window.cancelAnimationFrame(mouseMoveFrame)
      mouseMoveFrame = null
    }
    pendingMousePoint = null
    if (currentDom) {
      currentDom.removeEventListener('mousemove', onMouseMove as EventListener)
      currentDom.removeEventListener('mouseleave', onMouseLeave)
      currentDom = null
    }
    isOverHandle = false
    blockHandle.visible = false
    blockHandle.typeMenuOpen = false
    blockHandle.hoveredBlockPos = null
    blockHandle.hoveredBlockTypeName = null
    blockHandle.hoveredBlockIconAttrs = null
    hoveredBlockDom = null
  }

  let dragGhost: HTMLElement | null = null

  function onDragStart(event: DragEvent) {
    const view = core.editorView
    const pos = blockHandle.hoveredBlockPos
    if (!view || pos === null || !event.dataTransfer) return

    const nodeSelection = NodeSelection.create(view.state.doc, pos)
    view.dispatch(view.state.tr.setSelection(nodeSelection))

    const slice = nodeSelection.content()
    const { dom: clipDom, text } = view.serializeForClipboard(slice)
    event.dataTransfer.clearData()
    event.dataTransfer.setData('text/html', clipDom.innerHTML)
    event.dataTransfer.setData('text/plain', text)
    event.dataTransfer.effectAllowed = 'move'

    dragGhost = document.createElement('div')
    dragGhost.textContent = text.trim().slice(0, 80) || '…'
    Object.assign(dragGhost.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0',
      padding: '4px 10px',
      borderRadius: '6px',
      background: 'var(--surface-2, rgba(255,255,255,0.08))',
      color: 'var(--text-1)',
      fontSize: '14px',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap',
      maxWidth: '320px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      pointerEvents: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
    })
    document.body.appendChild(dragGhost)
    event.dataTransfer.setDragImage(dragGhost, -12, 14)

    ;(view as unknown as { dragging: { slice: typeof slice; move: boolean; node: NodeSelection } | null }).dragging = {
      slice,
      move: true,
      node: nodeSelection,
    }
    blockHandle.isDragging = true
  }

  function onDragEnd() {
    const view = core.editorView
    if (view) {
      ;(view as unknown as { dragging: null }).dragging = null
    }
    if (dragGhost) {
      dragGhost.remove()
      dragGhost = null
    }
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
    try {
      cmd?.(view.state, view.dispatch.bind(view))
    } catch (error) {
      if (!isProseMirrorTransformError(error)) throw error
      void appLogger.warn({
        source: 'frontend.editor',
        event: 'block_turn_into_transform_error',
        message: 'Block transform command failed during document transform',
        workspacePath: core.workspacePath,
        error,
        payload: { commandId, pos },
      })
      view.focus()
      blockHandle.typeMenuOpen = false
      return
    }
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
    const paragraph = view.state.schema.nodes.paragraph.createAndFill()
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
    const paragraph = view.state.schema.nodes.paragraph.createAndFill()
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
    onDragStart,
    onDragEnd,
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
