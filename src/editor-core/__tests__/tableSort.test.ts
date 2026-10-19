import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { CellSelection } from 'prosemirror-tables'
import { undo, history } from 'prosemirror-history'
import type { Node as PMNode } from 'prosemirror-model'
import { nevoBaseSchema as schema } from '../schema'
import { compareTableCellText, createSortTableColumnCommand } from '../commands/tableSort'
import { getTableMenuContext } from '../tableContext'

type CellSpec = string | { text: string; attrs: Record<string, unknown> }

function cell(type: 'table_cell' | 'table_header', spec: CellSpec): PMNode {
  const text = typeof spec === 'string' ? spec : spec.text
  const attrs = typeof spec === 'string' ? null : spec.attrs
  return schema.node(type, attrs, [schema.node('paragraph', null, text ? [schema.text(text)] : [])])
}

function buildState(header: string[] | null, body: CellSpec[][]): EditorState {
  const rows = [
    ...(header ? [schema.node('table_row', null, header.map((text) => cell('table_header', text)))] : []),
    ...body.map((row) => schema.node('table_row', null, row.map((spec) => cell('table_cell', spec)))),
  ]
  return EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('table', null, rows)]),
    plugins: [history()],
  })
}

function cellPositions(state: EditorState): number[] {
  const positions: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table_cell' || node.type.name === 'table_header') positions.push(pos)
    return true
  })
  return positions
}

function selectCell(state: EditorState, index: number): EditorState {
  return state.apply(state.tr.setSelection(CellSelection.create(state.doc, cellPositions(state)[index])))
}

function column(state: EditorState, col: number): string[] {
  const texts: string[] = []
  state.doc.firstChild!.forEach((row) => texts.push(row.child(col).textContent))
  return texts
}

function run(state: EditorState, direction: 'asc' | 'desc'): EditorState {
  let next = state
  const ok = createSortTableColumnCommand(direction)(state, (tr) => { next = state.apply(tr) })
  expect(ok).toBe(true)
  return next
}

describe('compareTableCellText', () => {
  it('compares numbers numerically, including comma decimals and spaces', () => {
    const values = ['10', '9', '1 234,5', '-3.25', '2,5']
    expect([...values].sort((a, b) => compareTableCellText(a, b, 'asc'))).toEqual(['-3.25', '2,5', '9', '10', '1 234,5'])
  })

  it('reads comma and dot thousands separators as numbers', () => {
    const values = ['999', '1,234', '5', '1,234.50', '1.000,5']
    expect([...values].sort((a, b) => compareTableCellText(a, b, 'asc'))).toEqual(['5', '999', '1.000,5', '1,234', '1,234.50'])
  })

  it('keeps empty values last in both directions', () => {
    const values = ['b', '', 'a']
    expect([...values].sort((a, b) => compareTableCellText(a, b, 'asc'))).toEqual(['a', 'b', ''])
    expect([...values].sort((a, b) => compareTableCellText(a, b, 'desc'))).toEqual(['b', 'a', ''])
  })

  it('uses natural order for mixed text', () => {
    const values = ['item 10', 'Item 2', 'item 1']
    expect([...values].sort((a, b) => compareTableCellText(a, b, 'asc'))).toEqual(['item 1', 'Item 2', 'item 10'])
  })
})

describe('createSortTableColumnCommand', () => {
  it('sorts body rows by the selected column and keeps the header row in place', () => {
    const state = selectCell(buildState(['Name', 'Qty'], [['pear', '10'], ['apple', '9'], ['fig', '']]), 3)
    const sorted = run(state, 'asc')
    expect(column(sorted, 0)).toEqual(['Name', 'apple', 'pear', 'fig'])
    expect(column(sorted, 1)).toEqual(['Qty', '9', '10', ''])

    const desc = run(sorted, 'desc')
    expect(column(desc, 1)).toEqual(['Qty', '10', '9', ''])
  })

  it('keeps the selected cell on its moved row so the menu stays open', () => {
    const state = selectCell(buildState(['Name'], [['b'], ['a']]), 1)
    const sorted = run(state, 'asc')
    expect(sorted.selection).toBeInstanceOf(CellSelection)
    expect(sorted.doc.nodeAt((sorted.selection as CellSelection).$anchorCell.pos)?.textContent).toBe('b')
    expect(getTableMenuContext(sorted)?.canSort).toBe(true)
  })

  it('sorts all rows when the table has no header row', () => {
    const sorted = run(selectCell(buildState(null, [['c'], ['a'], ['b']]), 0), 'asc')
    expect(column(sorted, 0)).toEqual(['a', 'b', 'c'])
  })

  it('is a single undoable step', () => {
    const state = selectCell(buildState(['N'], [['b'], ['a']]), 1)
    const sorted = run(state, 'asc')
    let restored = sorted
    undo(sorted, (tr) => { restored = sorted.apply(tr) })
    expect(column(restored, 0)).toEqual(['N', 'b', 'a'])
  })

  it('refuses tables with formulas or row spans, and reports it through the menu context', () => {
    const withFormula = selectCell(buildState(['N'], [['b'], [{ text: '', attrs: { formula: '=SUM(A1:A2)' } }]]), 1)
    expect(createSortTableColumnCommand('asc')(withFormula)).toBe(false)
    expect(getTableMenuContext(withFormula)?.canSort).toBe(false)

    const withRowspan = selectCell(buildState(['N'], [[{ text: 'b', attrs: { rowspan: 2 } }], []]), 1)
    expect(createSortTableColumnCommand('asc')(withRowspan)).toBe(false)
  })

  it('refuses a table with fewer than two body rows', () => {
    expect(createSortTableColumnCommand('asc')(selectCell(buildState(['N'], [['a']]), 1))).toBe(false)
  })
})
