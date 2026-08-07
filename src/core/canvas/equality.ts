import type { CanvasConnector, CanvasElement, CanvasSnapshotV1 } from './types'

/**
 * Structural equality for plain JSON-like values (objects, arrays, primitives).
 * Snapshots are small (one frame plus a handful of elements/connectors), so a
 * naive recursive walk is cheap here and avoids the key-order false negatives
 * a `JSON.stringify` comparison would produce — `readCanvasSnapshot` (Yjs) and
 * `normalizeCanvasSnapshot` (plain object) build their fields in different
 * insertion order even when the resulting values are identical.
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray || a.length !== b.length) return false
    for (let index = 0; index < a.length; index += 1) {
      if (!jsonEqual(a[index], b[index])) return false
    }
    return true
  }

  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const aKeys = Object.keys(aRecord)
  const bKeys = Object.keys(bRecord)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false
    if (!jsonEqual(aRecord[key], bRecord[key])) return false
  }
  return true
}

function idMapsEqual<T>(a: Record<string, T>, b: Record<string, T>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!jsonEqual(a[key], b[key])) return false
  }
  return true
}

/**
 * Structural equality for canvas snapshots — used to skip re-emitting a
 * mirror change (and the note-dirty/save cascade it triggers) when the
 * canvas snapshot has not actually changed. Deliberately not a
 * `JSON.stringify` comparison; see `jsonEqual` above for why.
 */
export function canvasSnapshotsEqual(
  a: CanvasSnapshotV1 | undefined,
  b: CanvasSnapshotV1 | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.version !== b.version) return false
  if (!jsonEqual(a.frame, b.frame)) return false
  if (!idMapsEqual<CanvasElement>(a.elements, b.elements)) return false
  if (!idMapsEqual<CanvasConnector>(a.connectors, b.connectors)) return false
  if (a.order.length !== b.order.length) return false
  for (let index = 0; index < a.order.length; index += 1) {
    if (a.order[index] !== b.order[index]) return false
  }
  return true
}
