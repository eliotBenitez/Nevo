import { Plugin } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'

/**
 * Generates a fresh stable block id. Mirrors the `crypto.randomUUID`-with-
 * fallback convention already used elsewhere in the codebase (see
 * `utils/draw/drawEngine.ts` `generateDrawId`, `types/database-block.ts`
 * `createDbId`) rather than importing one of those domain-specific
 * generators into editor-core's block-reference foundation.
 */
export function generateBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function collectBlockIdPositions(doc: PMNode): Map<string, number[]> {
  const positions = new Map<string, number[]>()
  doc.descendants((node, pos) => {
    const id = node.attrs.id
    if (typeof id !== 'string' || !id) return
    const existing = positions.get(id)
    if (existing) existing.push(pos)
    else positions.set(id, [pos])
  })
  return positions
}

/**
 * Re-keys duplicate block ids introduced by split/paste/duplicate.
 *
 * Ids are meant to be stable AND unique per block (see `commands/blockId.ts`
 * `ensureBlockId`), but a plain ProseMirror transaction copies a node's full
 * `attrs` — including `id` — when it splits or duplicates a referenceable
 * block (e.g. pressing Enter inside a heading that already has an id, or
 * pasting a copy of one elsewhere). Without this pass, two blocks could
 * silently end up pointing at the same reference target.
 *
 * The scan itself only inspects `attrs.id` (present on very few blocks,
 * since ids are assigned lazily — see `schema/blockIdAttr.ts`), so this is a
 * no-op for the common case where no block has an id yet. The FIRST
 * occurrence (lowest position) keeps its id; every later occurrence gets a
 * fresh one.
 */
export function createBlockIdRekeyPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null

      const positions = collectBlockIdPositions(newState.doc)
      const duplicates: { pos: number; node: PMNode }[] = []
      for (const posList of positions.values()) {
        if (posList.length < 2) continue
        for (const pos of posList.slice(1)) {
          const node = newState.doc.nodeAt(pos)
          if (node) duplicates.push({ pos, node })
        }
      }
      if (!duplicates.length) return null

      // setNodeMarkup only rewrites markup (type/attrs/marks), never node
      // size, so positions collected from `newState.doc` above stay valid
      // across all calls on the same transaction — no remapping needed.
      const tr = newState.tr
      for (const { pos, node } of duplicates) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: generateBlockId() })
      }
      return tr
    },
  })
}
