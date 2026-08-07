import type { Schema } from 'prosemirror-model'
import * as Y from 'yjs'
import { updateYFragment, yDocToProsemirrorJSON } from 'y-prosemirror'
import { readCanvasSnapshot, replaceCanvasSnapshot } from '../../core/canvas'
import { parseNoteContentToDoc } from '../serialization'

const Y_FRAGMENT_NAME = 'prosemirror'

/**
 * Replaces the known note shared types from a snapshot Y.Doc.
 *
 * Applying a snapshot update directly is additive in Yjs and can reintroduce
 * both current and historical content. This conversion instead materializes
 * the snapshot ProseMirror document and Canvas model, then updates the live
 * shared types in one transaction.
 */
export function hardRestoreKnownNoteTypes(
  live: Y.Doc,
  snapshot: Y.Doc,
  schema: Schema,
  origin: unknown,
): void {
  const content = yDocToProsemirrorJSON(snapshot, Y_FRAGMENT_NAME)
  const prosemirrorDoc = parseNoteContentToDoc(schema, content)
  const canvas = readCanvasSnapshot(snapshot)
  const fragment = live.getXmlFragment(Y_FRAGMENT_NAME)

  live.transact(() => {
    updateYFragment(live, fragment, prosemirrorDoc, {
      mapping: new Map(),
      isOMark: new Map(),
    })
    replaceCanvasSnapshot(live, canvas, origin)
  }, origin)
}
