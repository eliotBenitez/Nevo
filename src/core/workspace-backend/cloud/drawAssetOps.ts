// Pointers from a drawing block to its payload blob.
//
// Locally a drawing is written as `draw-<drawId>-<stamp>.json` in the assets
// directory, and "read the latest" means scanning that prefix for the newest
// file. A cloud workspace stores the payload as an encrypted relay asset, whose
// id is opaque and carries no name to scan — so the drawId → asset mapping is
// kept here, in the manifest document, and doubles as the latest-payload lookup
// that recovers a drawing whose note reference went stale.

import * as Y from 'yjs'
import { CLOUD_LOCAL_ORIGIN } from './session'

const DRAW_ASSETS_MAP = 'draw_assets'

function drawMap(ydoc: Y.Doc): Y.Map<string> {
  return ydoc.getMap<string>(DRAW_ASSETS_MAP)
}

/** The asset id holding a drawing's latest payload, if it has one. */
export function readDrawAssetId(ydoc: Y.Doc, drawId: string): string | null {
  const stored = drawMap(ydoc).get(drawId)
  return typeof stored === 'string' && stored ? stored : null
}

/** Points a drawing at a new payload, returning the id it replaced. */
export function writeDrawAssetId(ydoc: Y.Doc, drawId: string, assetId: string): string | null {
  const previous = readDrawAssetId(ydoc, drawId)
  ydoc.transact(() => {
    drawMap(ydoc).set(drawId, assetId)
  }, CLOUD_LOCAL_ORIGIN)
  return previous === assetId ? null : previous
}

export function deleteDrawAssetId(ydoc: Y.Doc, drawId: string): void {
  ydoc.transact(() => {
    drawMap(ydoc).delete(drawId)
  }, CLOUD_LOCAL_ORIGIN)
}
