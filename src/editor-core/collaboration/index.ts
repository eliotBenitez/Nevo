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

/**
 * Resolve the Y.Doc for a note from its persisted bytes, with corruption
 * recovery. Extracted from the editor setup path so the fallback logic is
 * unit-testable and cannot silently lose a note:
 *  - non-empty `bytes` → restore; if restoration throws, or the restored doc's
 *    prosemirror fragment is unreadable, fall back to seeding from `content` so
 *    a corrupt `.yjs` never blocks opening the note;
 *  - empty `bytes` → seed a fresh Y.Doc from `content`;
 *  - if even seeding throws (e.g. malformed content), return `null` so the
 *    caller can degrade to non-Yjs mode instead of crashing.
 */
export function loadOrCreateYDoc(schema: Schema, content: unknown, bytes: Uint8Array): Y.Doc | null {
  if (bytes.length > 0) {
    try {
      const ydoc = restoreYDocFromBinary(bytes)
      try {
        ydoc.getXmlFragment(Y_FRAGMENT_NAME)
        return ydoc
      } catch {
        ydoc.destroy()
      }
    } catch {
      /* Unreadable update payload — fall through to seeding from content. */
    }
  }
  try {
    return createYDocFromContent(schema, content)
  } catch {
    return null
  }
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
