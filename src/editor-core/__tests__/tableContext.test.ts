import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { CellSelection } from 'prosemirror-tables'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { getTableMenuContext } from '../tableContext'

function buildTableState(): { state: EditorState; cellPositions: number[] } {
  const schema = nevoBaseSchema
  const core = createCoreCommands(schema)
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph')]),
  })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))
  const result = core.insertTable({ rows: 2, cols: 2 })(
    state,
    (tr) => { state = state.apply(tr) },
  )
  if (!result) throw new Error('table insertion failed')

  const cellPositions: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
      cellPositions.push(pos)
    }
    return true
  })
  return { state, cellPositions }
}

describe('getTableMenuContext', () => {
  it('returns null outside of a table', () => {
    const schema = nevoBaseSchema
    const state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('hi')])]),
    })
    expect(getTableMenuContext(state)).toBeNull()
  })

  it('returns null for a plain caret inside a cell (menu is right-click only)', () => {
    const { state, cellPositions } = buildTableState()
    // A plain caret click (TextSelection) inside a cell must NOT open the
    // menu — only a CellSelection (set by the right-click handler) does.
    const caretState = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, cellPositions[1] + 1)),
    )
    expect(getTableMenuContext(caretState)).toBeNull()
  })

  it('exposes the menu context for a single-cell CellSelection (right-click)', () => {
    const { state, cellPositions } = buildTableState()
    // The contextmenu handler places a single-cell CellSelection on the
    // clicked cell; that is the trigger for the formatting menu.
    const selState = state.apply(
      state.tr.setSelection(CellSelection.create(state.doc, cellPositions[1])),
    )

    const context = getTableMenuContext(selState)
    expect(context).not.toBeNull()
    expect(context!.inTable).toBe(true)
    expect(context!.rows).toBe(2)
    expect(context!.cols).toBe(2)
    expect(context!.selectedRows).toBe(1)
    expect(context!.selectedCols).toBe(1)
    expect(context!.canMerge).toBe(false)
    expect(context!.activeCell).not.toBeNull()
    expect(context!.activeCell!.pos).toBe(cellPositions[1])
  })

  it('reports the multi-cell selection span and enables merge for CellSelection', () => {
    const { state, cellPositions } = buildTableState()
    const selState = state.apply(
      state.tr.setSelection(CellSelection.create(state.doc, cellPositions[0], cellPositions[1])),
    )

    const context = getTableMenuContext(selState)
    expect(context).not.toBeNull()
    expect(context!.selectedRows).toBe(1)
    expect(context!.selectedCols).toBe(2)
    expect(context!.canMerge).toBe(true)
  })
})
