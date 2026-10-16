import { Fragment, type Node as PMNode } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { CellSelection, TableMap } from 'prosemirror-tables'

export type TableSortDirection = 'asc' | 'desc'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Parses "1 234,5", "-3.25", "12%" as numbers; anything else is compared as text. */
function parseNumber(text: string): number | null {
  const compact = text.replace(/[\s%]/g, '')
  const normalized = /^-?\d+,\d+$/.test(compact) ? compact.replace(',', '.') : compact
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  return Number(normalized)
}

/** Empty values always sort last, regardless of direction. */
export function compareTableCellText(a: string, b: string, direction: TableSortDirection): number {
  if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1)
  const numA = parseNumber(a)
  const numB = parseNumber(b)
  const result = numA !== null && numB !== null ? numA - numB : collator.compare(a, b)
  return direction === 'asc' ? result : -result
}

function isHeaderRow(row: PMNode): boolean {
  let allHeaders = row.childCount > 0
  row.forEach((cell) => {
    if (cell.type.name !== 'table_header') allHeaders = false
  })
  return allHeaders
}

/**
 * Reorders the body rows of the table around the selected cell by that cell's
 * column. Leading header rows stay in place. Refuses tables with row spans
 * (rows are not independent) or formulas (A1-style references would point at
 * different rows after sorting).
 */
export function createSortTableColumnCommand(direction: TableSortDirection): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof CellSelection)) return false
    const $cell = sel.$anchorCell
    const table = $cell.node(-1)
    const tableStart = $cell.start(-1)
    if (table.type.name !== 'table') return false

    let blocked = false
    table.descendants((node) => {
      if (node.attrs.rowspan > 1 || node.attrs.formula) blocked = true
      return !blocked && node.type.name === 'table_row'
    })
    if (blocked) return false

    const map = TableMap.get(table)
    const column = map.findCell($cell.pos - tableStart).left
    const rows: PMNode[] = []
    table.forEach((row) => rows.push(row))
    let headerCount = 0
    while (headerCount < rows.length && isHeaderRow(rows[headerCount])) headerCount += 1
    if (rows.length - headerCount < 2) return false
    if (!dispatch) return true

    const keyOf = (rowIndex: number) => {
      const cellPos = map.map[rowIndex * map.width + column]
      return table.nodeAt(cellPos)?.textContent.trim() ?? ''
    }
    const body = rows.slice(headerCount).map((row, i) => ({ row, index: headerCount + i, key: keyOf(headerCount + i) }))
    const sorted = [...body].sort((a, b) => compareTableCellText(a.key, b.key, direction))
    if (sorted.every((entry, i) => entry === body[i])) return true

    const activeRow = map.findCell($cell.pos - tableStart).top
    const tablePos = tableStart - 1
    const nextTable = table.copy(Fragment.from([...rows.slice(0, headerCount), ...sorted.map((entry) => entry.row)]))
    const tr = state.tr.replaceWith(tablePos, tablePos + table.nodeSize, nextTable)

    // Keep the same cell selected, now at its sorted row, so the table menu stays open.
    const newRowIndex = activeRow < headerCount ? activeRow : headerCount + sorted.findIndex((entry) => entry.index === activeRow)
    const rowOffset = $cell.pos - tableStart - map.positionAt(activeRow, 0, table)
    const newCellPos = tableStart + TableMap.get(nextTable).positionAt(newRowIndex, 0, nextTable) + rowOffset
    tr.setSelection(CellSelection.create(tr.doc, newCellPos))

    dispatch(tr.scrollIntoView())
    return true
  }
}
