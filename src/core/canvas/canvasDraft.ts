import { CANVAS_SNAPSHOT_VERSION, type CanvasConnector, type CanvasDocumentFrame, type CanvasElement, type CanvasSnapshotV1 } from './types'

/**
 * Mutable per-commit draft handed to `CanvasStore.commit()` (see
 * `canvasStore.ts`). Mirrors the subset of the Yjs `Y.Map`/`Y.Array` APIs the
 * canvas mutation bodies (`useCanvasElements`, `useCanvasP1Elements`,
 * `useCanvasDocument`) were written against, so porting them off Yjs was a
 * mechanical parameter swap rather than a rewrite:
 * - `elements`/`connectors` are plain `Map`s — a superset of the `Y.Map`
 *   methods (`get`/`set`/`delete`/`has`/`entries`/`values`/`keys`/`forEach`)
 *   those call sites use.
 * - `order` is a small `Y.Array`-shaped wrapper (`CanvasDraftOrder` below),
 *   since `Y.Array`'s `push`/`insert`/`delete` signatures have no native
 *   `Array` equivalent.
 * - `frame` is a plain, wholesale-replaced value: no mutation body reads or
 *   writes it through a map-like accessor (it was always `Y.Map` with a
 *   single `'value'` key), so a direct property is the simpler and more
 *   idiomatic match here.
 */
export interface CanvasDraft {
  frame: CanvasDocumentFrame
  elements: Map<string, CanvasElement>
  connectors: Map<string, CanvasConnector>
  order: CanvasDraftOrder
}

/** `Y.Array<string>`-shaped wrapper around a plain string array. */
export class CanvasDraftOrder {
  private items: string[]

  constructor(items: readonly string[]) {
    this.items = [...items]
  }

  get length(): number {
    return this.items.length
  }

  toArray(): string[] {
    return [...this.items]
  }

  push(ids: readonly string[]): void {
    this.items.push(...ids)
  }

  insert(index: number, ids: readonly string[]): void {
    this.items.splice(index, 0, ...ids)
  }

  delete(index: number, count: number): void {
    this.items.splice(index, count)
  }
}

export function createCanvasDraft(snapshot: CanvasSnapshotV1): CanvasDraft {
  return {
    frame: { ...snapshot.frame },
    elements: new Map(Object.entries(snapshot.elements)),
    connectors: new Map(Object.entries(snapshot.connectors)),
    order: new CanvasDraftOrder(snapshot.order),
  }
}

/** Reads a draft back into snapshot-shaped JSON. Not yet normalized/validated
 *  — the caller (`CanvasStore.commit`) runs it through `normalizeCanvasSnapshot`. */
export function readCanvasDraft(draft: CanvasDraft): CanvasSnapshotV1 {
  return {
    version: CANVAS_SNAPSHOT_VERSION,
    frame: draft.frame,
    elements: Object.fromEntries(draft.elements),
    connectors: Object.fromEntries(draft.connectors),
    order: draft.order.toArray(),
  }
}
