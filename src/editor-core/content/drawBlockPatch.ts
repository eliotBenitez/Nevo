import type { BlockNode } from '../../types/note'

export interface DrawBlockPatchAttrs {
  src: string
  svgPreview: string
}

export interface DrawBlockPatchResult {
  content: BlockNode
  changed: boolean
}

function patchNode(node: BlockNode, drawId: string, attrs: DrawBlockPatchAttrs): { node: BlockNode; changed: boolean } {
  if (node.type === 'draw_block' && node.attrs?.drawId === drawId) {
    return {
      node: { ...node, attrs: { ...node.attrs, ...attrs } },
      changed: true,
    }
  }

  if (!node.content || node.content.length === 0) return { node, changed: false }

  let changed = false
  const nextContent = node.content.map((child) => {
    if (changed) return child
    const result = patchNode(child, drawId, attrs)
    if (result.changed) changed = true
    return result.node
  })
  if (!changed) return { node, changed: false }
  return { node: { ...node, content: nextContent }, changed: true }
}

/**
 * Patches a `draw_block`'s `src`/`svgPreview` attributes inside a
 * `NoteDocument['content']` JSON tree, without a live `EditorView`. Mirrors
 * the semantics of the removed `updateDrawBlockAttrsInYDoc` (find the first
 * matching node by `drawId`, report whether anything changed) but operates
 * on the plain JSON tree that is `note.content` — the note's authoritative
 * body once the full-screen drawing canvas has unmounted the note editor
 * (see `useDrawNoteSync.ts`).
 *
 * Structurally shares every subtree that doesn't contain the target node —
 * only the path down to the matched node is rebuilt — so this stays cheap
 * even for a large document with one small drawing.
 */
export function patchDrawBlockInContent(
  content: BlockNode,
  drawId: string,
  attrs: DrawBlockPatchAttrs,
): DrawBlockPatchResult {
  const result = patchNode(content, drawId, attrs)
  return { content: result.node, changed: result.changed }
}
