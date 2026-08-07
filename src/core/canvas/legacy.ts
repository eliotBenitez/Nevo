import { finite, optionalId, record, size } from './primitives'
import type { CanvasBounds } from './types'

/** Pre-Phase-1 per-block layout. Only kept to migrate old canvas snapshots
 *  (JSON files and Yjs docs) into a single `CanvasDocumentFrame`. Never part
 *  of the live runtime model — see `src/core/canvas/frame.ts`. */
export interface LegacyCanvasLayout extends CanvasBounds {
  blockId: string
  zIndex: number
  locked?: boolean
  groupId?: string
  autoHeight?: boolean
}

function normalizeLegacyLayout(value: unknown, key: string): LegacyCanvasLayout | null {
  const source = record(value)
  const blockId = optionalId(source?.blockId) ?? optionalId(key)
  if (!source || !blockId) return null
  const layout: LegacyCanvasLayout = {
    blockId,
    x: finite(source.x),
    y: finite(source.y),
    width: size(source.width, 560),
    height: size(source.height, 180),
    zIndex: finite(source.zIndex, 0, -100_000, 100_000),
  }
  if (source.locked === true) layout.locked = true
  const groupId = optionalId(source.groupId)
  if (groupId) layout.groupId = groupId
  layout.autoHeight = source.autoHeight === false ? false : true
  return layout
}

export function parseLegacyLayouts(value: unknown): Record<string, LegacyCanvasLayout> {
  const source = record(value) ?? {}
  const layouts: Record<string, LegacyCanvasLayout> = {}
  for (const [key, candidate] of Object.entries(source)) {
    const layout = normalizeLegacyLayout(candidate, key)
    if (layout) layouts[layout.blockId] = layout
  }
  return layouts
}
