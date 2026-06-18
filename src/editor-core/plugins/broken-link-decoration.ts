import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

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
      apply(tr, prev, _oldState, newState) {
        // Recompute when the doc changed OR an explicit refresh meta was sent
        // (the existence check depends on external state, not the doc).
        if (tr.docChanged || tr.getMeta(brokenLinkPluginKey)) {
          return buildDecorations(newState.doc)
        }
        return prev
      },
    },
    props: {
      decorations(state) {
        return brokenLinkPluginKey.getState(state)
      },
    },
  })
}
