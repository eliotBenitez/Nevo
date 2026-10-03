import { NodeSelection, Selection, TextSelection } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { Node as PMNode, ResolvedPos, Schema } from 'prosemirror-model'

export interface BlockHandleBounds {
  top: number
  right: number
  bottom: number
  left: number
}

export interface BlockHandleMenuSize {
  width: number
  height: number
}

export const TYPE_MENU_MARGIN = 12
export const TYPE_MENU_OFFSET_Y = 28
export const TYPE_MENU_ALIGN_BOTTOM_OFFSET = 6
export const BLOCK_HANDLE_WIDTH = 32
export const BLOCK_HANDLE_HEIGHT = 22
export const BLOCK_HANDLE_BOUNDARY_MARGIN = 4
export const BLOCK_HANDLE_TOP_OFFSET = 3
export const BLOCK_HANDLE_LEFT_OFFSET = 28
export const DRAG_THRESHOLD = 4
export const AUTOSCROLL_EDGE = 48
export const AUTOSCROLL_SPEED = 14

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Extracts only the primitive attrs the block-handle icon depends on, so Vue
 *  can track a small stable shape instead of a deep ProseMirror node. */
export function extractBlockIconAttrs(node: PMNode): { level?: number; kind?: string } | null {
  if (node.type.name === 'heading') return { level: node.attrs.level }
  if (node.type.name === 'media_block') return { kind: node.attrs.kind }
  return null
}

export function resolveBlockHandlePosition(
  blockRect: Pick<DOMRect, 'top' | 'left'>,
  bounds?: Pick<DOMRect, 'left'> | null,
) {
  const preferredLeft = blockRect.left - BLOCK_HANDLE_LEFT_OFFSET
  const maxLeft = blockRect.left
  const minLeft = bounds ? bounds.left + BLOCK_HANDLE_WIDTH + BLOCK_HANDLE_BOUNDARY_MARGIN : preferredLeft

  return {
    top: blockRect.top + BLOCK_HANDLE_TOP_OFFSET,
    left: Math.min(Math.max(preferredLeft, minLeft), maxLeft),
  }
}

export function isPointInBlockHandleStickyArea(
  point: { x: number; y: number },
  blockRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>,
  handlePosition: { top: number; left: number },
) {
  const handleLeft = handlePosition.left - BLOCK_HANDLE_WIDTH
  const left = Math.min(handleLeft, blockRect.left) - BLOCK_HANDLE_BOUNDARY_MARGIN
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

/** Resolves the top-level or structural container block position from a resolved document position. */
export function resolveBlockPosFromResolvedPos($pos: ResolvedPos, schema: Schema): number | null {
  const callout = schema.nodes.callout
  const column = schema.nodes.column
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
    return $pos.before(calloutDepth)
  } else if (columnDepth !== null) {
    if ($pos.depth > columnDepth) {
      return $pos.before(columnDepth + 1)
    } else {
      const columnNode = $pos.node(columnDepth)
      if (columnNode.childCount > 0) {
        const idx = Math.min($pos.index(columnDepth), columnNode.childCount - 1)
        return $pos.posAtIndex(idx, columnDepth)
      }
    }
  } else if ($pos.depth >= 1) {
    return $pos.before(1)
  }
  return null
}

/** Resolves the active block pos based on the current selection in EditorState. */
export function resolveActiveBlockPos(state: EditorState): number | null {
  const { selection, schema, doc } = state
  if (selection instanceof NodeSelection) {
    const node = doc.nodeAt(selection.from)
    if (node && node.isBlock) return selection.from
  }
  const $from = selection.$head ?? selection.$from
  if ($from) {
    const pos = resolveBlockPosFromResolvedPos($from, schema)
    if (pos !== null) return pos
  }
  return null
}
