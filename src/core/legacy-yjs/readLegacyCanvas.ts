import * as Y from 'yjs'
import { emptyCanvasSnapshot, normalizeCanvasSnapshot } from '../canvas/normalize'
import type {
  CanvasConnector,
  CanvasDocumentFrame,
  CanvasElement,
  CanvasSnapshotV1,
} from '../canvas/types'
import type { LegacyCanvasLayout } from '../canvas/legacy'

/**
 * Standalone copy of the canvas-snapshot read side of `src/core/canvas/yjs.ts`
 * (`readCanvasSnapshot` plus the legacy `canvas.layouts` map), kept for the
 * one-time legacy `.yjs` -> `note.json` migration in `migrateWorkspaceYjs.ts`.
 * Normalization is NOT duplicated — it reuses `normalizeCanvasSnapshot` /
 * `emptyCanvasSnapshot` from `../canvas/normalize`, which already knows how to
 * fold a legacy `layouts` map into a `CanvasDocumentFrame`.
 */
const CANVAS_LAYOUTS_KEY = 'canvas.layouts'
const CANVAS_FRAME_KEY = 'canvas.frame'
const CANVAS_ELEMENTS_KEY = 'canvas.elements'
const CANVAS_CONNECTORS_KEY = 'canvas.connectors'
const CANVAS_ORDER_KEY = 'canvas.order'
const CANVAS_FRAME_MAP_KEY = 'value'

interface LegacyCanvasSharedTypes {
  frame: Y.Map<CanvasDocumentFrame>
  layouts: Y.Map<LegacyCanvasLayout>
  elements: Y.Map<CanvasElement>
  connectors: Y.Map<CanvasConnector>
  order: Y.Array<string>
}

function getLegacyCanvasSharedTypes(ydoc: Y.Doc): LegacyCanvasSharedTypes {
  return {
    frame: ydoc.getMap<CanvasDocumentFrame>(CANVAS_FRAME_KEY),
    layouts: ydoc.getMap<LegacyCanvasLayout>(CANVAS_LAYOUTS_KEY),
    elements: ydoc.getMap<CanvasElement>(CANVAS_ELEMENTS_KEY),
    connectors: ydoc.getMap<CanvasConnector>(CANVAS_CONNECTORS_KEY),
    order: ydoc.getArray<string>(CANVAS_ORDER_KEY),
  }
}

/** Mirrors `canvasSharedTypesAreEmpty` from `../canvas/yjs.ts` — a Y.Doc whose
 *  canvas shared types were never touched (a note that has never been opened
 *  in Canvas mode) must not produce a snapshot at all. Returning a default
 *  empty snapshot in that case would fabricate a `canvas` value on every
 *  plain note and clobber a stale-but-real `note.canvas` mirror that the
 *  Y.Doc simply never had a chance to overwrite. */
function legacyCanvasSharedTypesAreEmpty(types: LegacyCanvasSharedTypes): boolean {
  return types.frame.size === 0
    && types.layouts.size === 0
    && types.elements.size === 0
    && types.connectors.size === 0
    && types.order.length === 0
}

/**
 * Reads the canvas snapshot out of a persisted note Y.Doc, the same way the
 * live editor's `readCanvasSnapshot` does. Returns `undefined` when the
 * canvas shared types hold nothing at all (note never opened in Canvas mode)
 * so the migration can tell "no canvas data in this Y.Doc" apart from "an
 * actual (possibly empty) canvas snapshot".
 */
export function readLegacyCanvasSnapshot(ydoc: Y.Doc): CanvasSnapshotV1 | undefined {
  const types = getLegacyCanvasSharedTypes(ydoc)
  if (legacyCanvasSharedTypesAreEmpty(types)) return undefined

  const frame = types.frame.get(CANVAS_FRAME_MAP_KEY)
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
