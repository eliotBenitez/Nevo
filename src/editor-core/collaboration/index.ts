import * as Y from 'yjs'
import { prosemirrorJSONToYDoc } from 'y-prosemirror'
import type { Schema } from 'prosemirror-model'

export const Y_FRAGMENT_NAME = 'prosemirror'

export function createYDocFromContent(schema: Schema, content: unknown): Y.Doc {
  return prosemirrorJSONToYDoc(schema, content as Record<string, unknown>, Y_FRAGMENT_NAME)
}

export function restoreYDocFromBinary(binary: Uint8Array): Y.Doc {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, binary)
  return ydoc
}

export function encodeYDocState(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(ydoc)
}
