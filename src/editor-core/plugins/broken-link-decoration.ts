import { Plugin, PluginKey } from 'prosemirror-state'
import type { Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { MarkType, Node as PMNode, Slice } from 'prosemirror-model'

/** A plugin that marks `internal_link` marks pointing at non-existent notes
 *  with a CSS class (`.is-broken`) so they can be visually distinguished,
 *  Obsidian-style. The existence check is delegated to an injected callback so
 *  the core layer stays free of store dependencies; the callback is re-queried
 *  on every doc change AND whenever an explicit "refresh" transaction is
 *  dispatched (e.g. when the workspace tree mutates).
 *
 *  Refresh signal: dispatch a transaction carrying the meta key with any value
 *  to force the decorations to be recomputed against the latest `exists`. */
export const brokenLinkPluginKey = new PluginKey<DecorationSet>('nevo-broken-link-decoration')

export interface BrokenLinkPluginOptions {
  /** Returns true when the given noteId still exists in the workspace.
   *  Always returning true disables the decoration entirely. */
  exists: (noteId: string) => boolean
}

/**
 * Cheap pre-check: could this transaction possibly have added, removed, or
 * repositioned an `internal_link`-marked text run? Mirrors the
 * `collectRemovedAssetSrcs` pattern in `useEditorCore.ts`: only scan the changed
 * ranges (old-doc side for removed/resolved marks, inserted slice / mark steps for
 * new ones) instead of walking the entire document on every keystroke. Plain text
 * edits anywhere outside an internal_link run — the overwhelming majority of
 * keystrokes — never touch these ranges, so the full `buildDecorations` scan is
 * skipped for them.
 */
function transactionTouchesInternalLink(prevDoc: PMNode, tr: Transaction, internalLinkType: MarkType): boolean {
  const hasMark = (node: PMNode) => node.isText && internalLinkType.isInSet(node.marks)
  let doc = prevDoc
  for (const step of tr.steps) {
    const anyStep = step as unknown as { slice?: Slice; mark?: { type: MarkType } }
    if (anyStep.mark && anyStep.mark.type === internalLinkType) return true

    const stepMap = step.getMap()
    let touched = false
    stepMap.forEach((oldStart, oldEnd) => {
      if (touched || oldEnd <= oldStart) return
      doc.nodesBetween(oldStart, oldEnd, (node) => {
        if (touched) return false
        if (hasMark(node)) { touched = true; return false }
        return true
      })
    })
    if (touched) return true

    if (anyStep.slice) {
      let found = false
      anyStep.slice.content.descendants((node) => {
        if (found) return false
        if (hasMark(node)) { found = true; return false }
        return true
      })
      if (found) return true
    }

    const result = step.apply(doc)
    if (result.doc) doc = result.doc
  }
  return false
}

export function createBrokenLinkDecorationPlugin(options: BrokenLinkPluginOptions): Plugin {
  const exists = options.exists

  function buildDecorations(doc: import('prosemirror-model').Node): DecorationSet {
    const internalLinkType = doc.type.schema.marks.internal_link
    if (!internalLinkType) return DecorationSet.empty

    const decorations: Decoration[] = []
    doc.descendants((node, pos) => {
      if (!node.isText) return
      const mark = internalLinkType.isInSet(node.marks)
      if (!mark) return
      const noteId = String(mark.attrs.noteId ?? '')
      if (!noteId) return
      if (exists(noteId)) return
      decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'is-broken' }))
    })

    return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty
  }

  return new Plugin({
    key: brokenLinkPluginKey,
    state: {
      init(_, instance) {
        return buildDecorations(instance.doc)
      },
      apply(tr, prev, oldState, newState) {
        // Explicit refresh meta: the existence check depends on external state, not
        // the doc, so always recompute fully.
        if (tr.getMeta(brokenLinkPluginKey)) {
          return buildDecorations(newState.doc)
        }
        if (!tr.docChanged) return prev
        const internalLinkType = newState.schema.marks.internal_link
        if (!internalLinkType) return DecorationSet.empty
        if (!transactionTouchesInternalLink(oldState.doc, tr, internalLinkType)) {
          return prev.map(tr.mapping, newState.doc)
        }
        return buildDecorations(newState.doc)
      },
    },
    props: {
      decorations(state) {
        return brokenLinkPluginKey.getState(state)
      },
    },
  })
}
