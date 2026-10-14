import type { Node } from 'prosemirror-model'
import type { EditorState } from 'prosemirror-state'
import { AllSelection, Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { Decoration, DecorationSet } from 'prosemirror-view'

const key = new PluginKey<DecorationSet>('block-selection')

function topLevelRanges(doc: Node, from: number, to: number): Array<{ from: number, to: number }> {
  const ranges: Array<{ from: number, to: number }> = []

  // Iterate only top-level blocks intersecting the selection, with early exit.
  let offset = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const nodeEnd = offset + doc.child(i).nodeSize
    if (offset >= to) break
    if (nodeEnd > from) ranges.push({ from: offset, to: nodeEnd })
    offset = nodeEnd
  }
  return ranges
}

function buildDecorations(state: EditorState): DecorationSet {
  const { selection, doc } = state
  // Ctrl+A twice yields an AllSelection, which must look like a block selection too.
  if (!(selection instanceof TextSelection || selection instanceof AllSelection) || selection.empty) {
    return DecorationSet.empty
  }

  const { from, to } = selection
  const ranges = topLevelRanges(doc, from, to)

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

// A multi-block selection is shown as whole blocks, so copy/cut must take whole blocks too.
function copyWholeBlocks(view: EditorView, event: ClipboardEvent): boolean {
  const { selection, doc } = view.state
  const data = event.clipboardData
  if (!data || !(selection instanceof TextSelection) || selection.empty) return false

  const ranges = topLevelRanges(doc, selection.from, selection.to)
  if (ranges.length < 2) return false

  const from = ranges[0].from
  const to = ranges[ranges.length - 1].to
  const { dom, text } = view.serializeForClipboard(doc.slice(from, to))
  event.preventDefault()
  data.clearData()
  data.setData('text/html', dom.innerHTML)
  data.setData('text/plain', text)
  if (event.type === 'cut') {
    view.dispatch(view.state.tr.delete(from, to).scrollIntoView().setMeta('uiEvent', 'cut'))
  }
  return true
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
      handleDOMEvents: {
        copy: copyWholeBlocks,
        cut: copyWholeBlocks,
      },
    },
  })
}
