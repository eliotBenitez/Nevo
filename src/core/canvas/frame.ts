import { unionBounds } from './geometry'
import type { LegacyCanvasLayout } from './legacy'
import type { CanvasBounds, CanvasDocumentFrame } from './types'

export const DEFAULT_FRAME_WIDTH = 900
export const DEFAULT_FRAME_HEIGHT = 1200
export const MIN_FRAME_WIDTH = 320
export const COLLAPSED_FRAME_WIDTH = 320
export const COLLAPSED_FRAME_HEIGHT = 104

export function createDefaultCanvasFrame(): CanvasDocumentFrame {
  return {
    x: 0,
    y: 0,
    width: DEFAULT_FRAME_WIDTH,
    height: DEFAULT_FRAME_HEIGHT,
    zIndex: 0,
    autoHeight: true,
  }
}

/** Builds the initial document frame from a legacy per-block layout map by
 *  taking the union of all block bounds. Returns `null` for an empty map so
 *  the caller can fall back to `createDefaultCanvasFrame()`. */
export function migrateLayoutsToFrame(layouts: Record<string, LegacyCanvasLayout>): CanvasDocumentFrame | null {
  const bounds = unionBounds(Object.values(layouts))
  if (!bounds) return null
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(DEFAULT_FRAME_WIDTH, bounds.width),
    height: Math.max(DEFAULT_FRAME_HEIGHT, bounds.height),
    zIndex: 0,
    autoHeight: true,
  }
}

/** Resolves the frame's on-screen bounds for consumers that need actual
 *  geometry (camera fit, minimap, export, hit-testing) rather than the raw
 *  stored frame: a collapsed frame always renders at the fixed mini-card
 *  size, regardless of its stored/auto-height geometry; a manually resized
 *  frame (`autoHeight === false`) uses its stored height; an auto-height
 *  frame uses the measured content height instead, since the canvas store
 *  never stores a live-measured height (see `useCanvasFrameMetrics`). */
export function effectiveFrameBounds(frame: CanvasDocumentFrame, contentHeight: number): CanvasBounds {
  if (frame.collapsed) {
    return { x: frame.x, y: frame.y, width: COLLAPSED_FRAME_WIDTH, height: COLLAPSED_FRAME_HEIGHT }
  }
  const height = frame.autoHeight === false
    ? frame.height
    : Math.max(frame.height, contentHeight)
  return { x: frame.x, y: frame.y, width: frame.width, height }
}
