import { describe, it, expect, beforeAll } from 'vitest'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc } from '../serialization'
import {
  loadHyperformula,
  computeGrid,
  computeTableValues,
  computeBlockTableValues,
} from '../tableFormula'
import type { BlockNode } from '../../types/note'

function cell(text: string, formula?: string): BlockNode {
  return {
    type: 'table_cell',
    ...(formula ? { attrs: { formula } } : {}),
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  }
}

function tableDoc(rows: BlockNode[][]): BlockNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: rows.map((cells) => ({ type: 'table_row', content: cells })),
      },
    ],
  }
}

describe('table formula engine', () => {
  beforeAll(async () => {
    await loadHyperformula()
  })

  it('computes a grid with numbers and a SUM formula', () => {
    const result = computeGrid([
      [10, 20],
      ['=SUM(A1:B1)', null],
    ])
    expect(result.get('1:0')).toEqual({ value: '30', error: false })
  })

  it('resolves A1/B1 references and arithmetic', () => {
    const result = computeGrid([
      [3, 4],
      ['=A1*B1+1', null],
    ])
    expect(result.get('1:0')?.value).toBe('13')
  })

  it('flags errors (division by zero)', () => {
    const result = computeGrid([['=1/0']])
    const res = result.get('0:0')
    expect(res?.error).toBe(true)
    expect(res?.value).toContain('#')
  })

  it('computes values over a ProseMirror table node', () => {
    const doc = parseNoteContentToDoc(
      nevoBaseSchema,
      tableDoc([
        [cell('5'), cell('7')],
        [cell('', '=SUM(A1:B1)'), cell('')],
      ]),
    )

    let tableNode: typeof doc | null = null
    let tablePos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        tableNode = node as typeof doc
        tablePos = pos
        return false
      }
      return true
    })

    expect(tableNode).not.toBeNull()
    const results = computeTableValues(tableNode!, tablePos + 1)
    expect(results).toHaveLength(1)
    expect(results[0].value).toBe('12')
    expect(results[0].error).toBe(false)
  })

  it('computes values over a table BlockNode for export', () => {
    const table = tableDoc([
      [cell('2'), cell('8')],
      [cell('', '=A1+B1'), cell('')],
    ]).content![0]

    const values = computeBlockTableValues(table)
    expect(values.get('1:0')?.value).toBe('10')
  })
})
