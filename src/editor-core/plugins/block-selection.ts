import type { EditorState } from 'prosemirror-state'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

const key = new PluginKey<DecorationSet>('block-selection')

function buildDecorations(state: EditorState): DecorationSet {
  const { selection, doc } = state
  if (!(selection instanceof TextSelection) || selection.empty) return DecorationSet.empty

  const { from, to } = selection
  const ranges: Array<{ from: number, to: number }> = []

  // Iterate only top-level blocks intersecting the selection, with early exit.
  let offset = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    const nodeEnd = offset + child.nodeSize
    if (offset >= to) break
    if (nodeEnd > from) ranges.push({ from: offset, to: nodeEnd })
    offset = nodeEnd
  }

  if (ranges.length === 0) return DecorationSet.empty

  // For a single block: only decorate if it is fully covered by the selection
  if (ranges.length === 1) {
    const range = ranges[0]
    const blockContentStart = range.from + 1
    const blockContentEnd = range.to - 1
    if (from > blockContentStart || to < blockContentEnd) return DecorationSet.empty
  }

  const className = ranges.length > 1
    ? 'nv-block-selected nv-block-selection-range'
    : 'nv-block-selected'
  const decos: Decoration[] = ranges.map((range) => Decoration.node(range.from, range.to, { class: className }))

  return DecorationSet.create(doc, decos)
}

export function createBlockSelectionPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, state) => buildDecorations(state),
      apply: (tr, old, _oldState, newState) => (
        tr.docChanged || tr.selectionSet ? buildDecorations(newState) : old
      ),
    },
    props: {
      decorations(state) {
        return key.getState(state)
      },
    },
  })
}
