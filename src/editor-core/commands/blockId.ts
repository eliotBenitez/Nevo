import type { EditorView } from 'prosemirror-view'
import { generateBlockId } from '../plugins/blockIds'

/**
 * Assigns a stable block id to the node at `pos` if it doesn't already have
 * one, and returns the id. Ids are lazy: most blocks never call this and
 * stay `id: null` forever (see `schema/blockIdAttr.ts`) — this is the single
 * entry point that turns a block into a reference target, meant for the
 * "create reference" flow (block-reference mark/resolver land separately).
 *
 * Idempotent: a second call on the same block returns the existing id
 * without dispatching another transaction.
 *
 * `pos` is the position immediately BEFORE the node, matching the
 * `nodeAt`/`setNodeMarkup` convention used by `commands/utils.ts`
 * (`findSelectedNode`, `createSetNodeAttrsCommand`).
 */
export function ensureBlockId(view: EditorView, pos: number): string {
  const node = view.state.doc.nodeAt(pos)
  // Nodes whose type never declared an `id` attr (see the curated set in
  // schema/*.ts) always lack the key — `'id' in node.attrs` is false for
  // them because prosemirror-model fills in every declared attr with its
  // default, so this also rules out non-referenceable node types.
  if (!node || !('id' in node.attrs)) return ''

  const existing = typeof node.attrs.id === 'string' && node.attrs.id ? node.attrs.id : null
  if (existing) return existing

  const id = generateBlockId()
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, id }))
  return id
}

/**
 * Ensures every direct child of the ProseMirror document has an id in one
 * transaction. Canvas calls this once on first open so assigning ids is atomic
 * and never changes document order or content.
 */
export function ensureTopLevelBlockIds(
  view: EditorView,
  options: { addToHistory?: boolean } = {},
): string[] {
  const ids: string[] = []
  const pending: Array<{ pos: number; id: string; attrs: Record<string, unknown> }> = []

  view.state.doc.forEach((node, offset) => {
    if (!('id' in node.attrs)) return
    const existing = typeof node.attrs.id === 'string' && node.attrs.id ? node.attrs.id : null
    const id = existing ?? generateBlockId()
    ids.push(id)
    if (!existing) pending.push({ pos: offset, id, attrs: node.attrs })
  })

  if (pending.length) {
    const tr = view.state.tr
    for (const block of pending) {
      tr.setNodeMarkup(block.pos, undefined, { ...block.attrs, id: block.id })
    }
    view.dispatch(options.addToHistory === false ? tr.setMeta('addToHistory', false) : tr)
  }
  return ids
}
