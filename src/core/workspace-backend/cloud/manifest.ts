// The cloud workspace manifest (folder/note tree) lives in the storage's
// `manifest` Yjs document as a single atomically-replaced value in a Y.Map.
// Atomic whole-manifest replacement (LWW per write) avoids JSON-merge
// corruption; note *content* is fine-grained via per-note Yjs docs.

import * as Y from 'yjs'
import type { WorkspaceManifest } from '../../../types/workspace'
import { CLOUD_LOCAL_ORIGIN } from './session'

const MANIFEST_KEY = 'data'

/** The Y.Map holding the manifest snapshot for a manifest Y.Doc. */
export function manifestMap(ydoc: Y.Doc): Y.Map<WorkspaceManifest> {
  return ydoc.getMap<WorkspaceManifest>('manifest')
}

export function emptyManifest(storageId: string, name: string, glyph: string, gradient: string): WorkspaceManifest {
  return {
    id: storageId,
    name,
    glyph,
    gradient,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    rootOrder: [],
    tree: [],
    rootNotes: [],
    trash: [],
  }
}

/** Read the current manifest snapshot, or null if not yet initialized. */
export function readManifest(map: Y.Map<WorkspaceManifest>): WorkspaceManifest | null {
  const data = map.get(MANIFEST_KEY)
  return data ? plainClone(data) : null
}

/** Deep clone to a plain, structured-cloneable object (strips Vue reactivity /
 *  any non-cloneable values before the data goes into Yjs). */
export function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Replace the whole manifest under a local-origin transaction. */
export function writeManifest(ydoc: Y.Doc, map: Y.Map<WorkspaceManifest>, manifest: WorkspaceManifest): void {
  ydoc.transact(() => {
    map.set(MANIFEST_KEY, plainClone(manifest))
  }, CLOUD_LOCAL_ORIGIN)
}

/**
 * Read-modify-write the manifest atomically and return the new snapshot.
 * `mutator` receives a mutable clone and may return a value to the caller.
 */
export function mutateManifest<T>(
  ydoc: Y.Doc,
  map: Y.Map<WorkspaceManifest>,
  mutator: (m: WorkspaceManifest) => T,
): { manifest: WorkspaceManifest; result: T } {
  const current = readManifest(map) ?? emptyManifest('', '', '', '')
  const result = mutator(current)
  writeManifest(ydoc, map, current)
  return { manifest: current, result }
}
