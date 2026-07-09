import { describe, expect, it, beforeAll } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createTableFormulaPlugin, tableFormulaKey } from '../plugins/table-formula'
import { loadHyperformula } from '../tableFormula'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc } from '../serialization'
import type { BlockNode } from '../../types/note'

function cell(text: string, formula?: string): BlockNode {
  return {
    type: 'table_cell',
    ...(formula ? { attrs: { formula } } : {}),
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  }
}

function tableBlock(rows: BlockNode[][]): BlockNode {
  return { type: 'table', content: rows.map((cells) => ({ type: 'table_row', content: cells })) }
}

function mount(doc: BlockNode) {
  const parsed = parseNoteContentToDoc(nevoBaseSchema, doc)
  const state = EditorState.create({
    schema: nevoBaseSchema,
    doc: parsed,
    plugins: [createTableFormulaPlugin()],
  })
  const el = document.createElement('div')
  document.body.appendChild(el)
  let view: EditorView
  // eslint-disable-next-line prefer-const
  view = new EditorView(el, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)) },
  })
  return { view, destroy: () => { view.destroy(); el.remove() } }
}

function findText(doc: import('prosemirror-model').Node, text: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found !== -1) return false
    if (node.isText && node.text === text) found = pos
    return true
  })
  return found
}

function widgetValues(view: EditorView): string[] {
  const state = tableFormulaKey.getState(view.state)!
  return state.decorations
    .find()
    .map((d) => d.spec?.key as string | undefined)
    .filter((key): key is string => typeof key === 'string' && key.startsWith('formula-'))
    .map((key) => key.split('-')[2])
}

describe('table-formula plugin (incremental recompute)', () => {
  beforeAll(async () => {
    await loadHyperformula()
  })

  it('produces no decorations and does not throw when the document has no formula tables', () => {
    const doc: BlockNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }] }
    const { view, destroy } = mount(doc)
    try {
      view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1))
      const state = tableFormulaKey.getState(view.state)!
      expect(state.hasFormulaTables).toBe(false)
      expect(state.decorations.find()).toHaveLength(0)
    } finally {
      destroy()
    }
  })

  it('recomputes only the touched table, leaving an untouched formula table unchanged', () => {
    const doc: BlockNode = {
      type: 'doc',
      content: [
        tableBlock([[cell('2'), cell('3')], [cell('', '=A1+B1'), cell('')]]),
        tableBlock([[cell('10'), cell('20')], [cell('', '=A1+B1'), cell('')]]),
      ],
    }
    const { view, destroy } = mount(doc)
    try {
      const before = widgetValues(view)
      expect(before).toContain('5') // table 1: 2+3
      expect(before).toContain('30') // table 2: 10+20

      // Edit a numeric cell in the first table only.
      const pos = findText(view.state.doc, '2')
      const tr = view.state.tr.insertText('0', pos, pos + 1) // "2" -> "0" -> 0+3 = 3
      view.dispatch(tr)

      const after = widgetValues(view)
      expect(after).toContain('3') // table 1 recomputed: 0+3
      expect(after).toContain('30') // table 2 untouched, value preserved
      expect(after).not.toContain('5')
    } finally {
      destroy()
    }
  })
})
