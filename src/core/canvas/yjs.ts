import * as Y from 'yjs'
import { createDefaultCanvasFrame, migrateLayoutsToFrame } from './frame'
import { parseLegacyLayouts, type LegacyCanvasLayout } from './legacy'
import { emptyCanvasSnapshot, normalizeCanvasSnapshot } from './normalize'
import type {
  CanvasConnector,
  CanvasDocumentFrame,
  CanvasElement,
  CanvasSnapshotV1,
} from './types'

/** Legacy per-block layout map. Only written/read for migrating notes that
 *  predate the single-document-frame model (see `frame.ts`, `legacy.ts`). */
export const CANVAS_LAYOUTS_KEY = 'canvas.layouts'
export const CANVAS_FRAME_KEY = 'canvas.frame'
export const CANVAS_ELEMENTS_KEY = 'canvas.elements'
export const CANVAS_CONNECTORS_KEY = 'canvas.connectors'
export const CANVAS_ORDER_KEY = 'canvas.order'
export const CANVAS_LOCAL_ORIGIN = Symbol('canvas-local-origin')
export const CANVAS_SETUP_ORIGIN = Symbol('canvas-setup-origin')

const CANVAS_FRAME_MAP_KEY = 'value'

export interface CanvasSharedTypes {
  frame: Y.Map<CanvasDocumentFrame>
  layouts: Y.Map<LegacyCanvasLayout>
  elements: Y.Map<CanvasElement>
  connectors: Y.Map<CanvasConnector>
  order: Y.Array<string>
}

export function getCanvasSharedTypes(ydoc: Y.Doc): CanvasSharedTypes {
  return {
    frame: ydoc.getMap<CanvasDocumentFrame>(CANVAS_FRAME_KEY),
    layouts: ydoc.getMap<LegacyCanvasLayout>(CANVAS_LAYOUTS_KEY),
    elements: ydoc.getMap<CanvasElement>(CANVAS_ELEMENTS_KEY),
    connectors: ydoc.getMap<CanvasConnector>(CANVAS_CONNECTORS_KEY),
    order: ydoc.getArray<string>(CANVAS_ORDER_KEY),
  }
}

export function readCanvasFrame(types: CanvasSharedTypes): CanvasDocumentFrame | undefined {
  return types.frame.get(CANVAS_FRAME_MAP_KEY)
}

export function writeCanvasFrame(types: CanvasSharedTypes, frame: CanvasDocumentFrame): void {
  types.frame.set(CANVAS_FRAME_MAP_KEY, frame)
}

export function readCanvasSnapshot(ydoc: Y.Doc): CanvasSnapshotV1 {
  const types = getCanvasSharedTypes(ydoc)
  const frame = readCanvasFrame(types)
  const value: Record<string, unknown> = {
    version: 1,
    elements: Object.fromEntries(types.elements.entries()),
    connectors: Object.fromEntries(types.connectors.entries()),
    order: types.order.toArray(),
  }
  if (frame) value.frame = frame
  else if (types.layouts.size > 0) value.layouts = Object.fromEntries(types.layouts.entries())
  return normalizeCanvasSnapshot(value) ?? emptyCanvasSnapshot()
}

function replaceMap<T>(target: Y.Map<T>, values: Record<string, T>): void {
  target.clear()
  for (const [key, value] of Object.entries(values)) target.set(key, value)
}

export function replaceCanvasSnapshot(
  ydoc: Y.Doc,
  snapshotValue: unknown,
  origin: unknown = CANVAS_LOCAL_ORIGIN,
): CanvasSnapshotV1 {
  const snapshot = normalizeCanvasSnapshot(snapshotValue) ?? emptyCanvasSnapshot()
  const types = getCanvasSharedTypes(ydoc)
  ydoc.transact(() => {
    writeCanvasFrame(types, snapshot.frame)
    replaceMap(types.elements, snapshot.elements)
    replaceMap(types.connectors, snapshot.connectors)
    types.order.delete(0, types.order.length)
    if (snapshot.order.length) types.order.insert(0, snapshot.order)
    if (types.layouts.size > 0) types.layouts.clear()
  }, origin)
  return snapshot
}

/** One-shot migration for docs created before the single-document-frame
 *  model: builds a frame from the legacy per-block layout map and clears it.
 *  Returns `false` (no-op) when a frame already exists or there is nothing to
 *  migrate. Phase 2 calls this when a canvas view attaches to a Y.Doc. */
export function migrateCanvasLayoutsIfNeeded(ydoc: Y.Doc, origin: unknown = CANVAS_LOCAL_ORIGIN): boolean {
  const types = getCanvasSharedTypes(ydoc)
  if (readCanvasFrame(types) || types.layouts.size === 0) return false
  const parsed = parseLegacyLayouts(Object.fromEntries(types.layouts.entries()))
  const frame = migrateLayoutsToFrame(parsed) ?? createDefaultCanvasFrame()
  ydoc.transact(() => {
    writeCanvasFrame(types, frame)
    types.layouts.clear()
  }, origin)
  return true
}

export function canvasSharedTypesAreEmpty(types: CanvasSharedTypes): boolean {
  return types.frame.size === 0
    && types.layouts.size === 0
    && types.elements.size === 0
    && types.connectors.size === 0
    && types.order.length === 0
}

export function addCanvasToUndoManager(undoManager: Y.UndoManager, types: CanvasSharedTypes): void {
  undoManager.addToScope([types.frame, types.elements, types.connectors, types.order])
  undoManager.trackedOrigins.add(CANVAS_LOCAL_ORIGIN)
}

export function runCanvasGesture(
  ydoc: Y.Doc,
  undoManager: Y.UndoManager | null,
  change: (types: CanvasSharedTypes) => void,
): void {
  undoManager?.stopCapturing()
  ydoc.transact(() => change(getCanvasSharedTypes(ydoc)), CANVAS_LOCAL_ORIGIN)
  undoManager?.stopCapturing()
}
