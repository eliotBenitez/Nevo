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

type YXmlChild = Y.XmlElement | Y.XmlFragment | Y.XmlText | Y.XmlHook

function findBlockElementByAttr(nodes: YXmlChild[], nodeName: string, attrName: string, attrValue: string): Y.XmlElement | null {
  for (const node of nodes) {
    if (node instanceof Y.XmlElement) {
      if (node.nodeName === nodeName && node.getAttribute(attrName) === attrValue) {
        return node
      }
      const found = findBlockElementByAttr(node.toArray(), nodeName, attrName, attrValue)
      if (found) return found
    }
  }
  return null
}

/**
 * Patch a `draw_block`'s attributes directly inside a persisted Y.Doc, without a
 * live `EditorView`. The full-screen canvas unmounts the editor pane, so the
 * usual `setNodeMarkup` path is unavailable; this lets the canvas write the
 * saved `src`/`svgPreview` straight into the note's source-of-truth Y.Doc so it
 * survives an app exit straight from the canvas (and keeps the asset referenced
 * against GC). Returns true if a matching node was found and updated.
 */
export function updateDrawBlockAttrsInYDoc(
  ydoc: Y.Doc,
  drawId: string,
  attrs: Record<string, string>,
): boolean {
  const fragment = ydoc.getXmlFragment(Y_FRAGMENT_NAME)
  const target = findBlockElementByAttr(fragment.toArray(), 'draw_block', 'drawId', drawId)
  if (!target) return false
  ydoc.transact(() => {
    for (const [key, value] of Object.entries(attrs)) target.setAttribute(key, value)
  })
  return true
}
