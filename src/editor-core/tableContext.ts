import type { EditorState } from 'prosemirror-state'
import { CellSelection, isInTable, mergeCells, selectedRect, splitCell } from 'prosemirror-tables'

export interface NevoTableMenuContext {
  inTable: boolean
  tablePos: number
  rows: number
  cols: number
  selectedRows: number
  selectedCols: number
  canMerge: boolean
  canSplit: boolean
  isMergedCell: boolean
  activeCell: {
    pos: number
    align: string | null
    background: string | null
    borderColor: string | null
    textColor: string | null
    padding: string | null
    formula: string | null
    isHeader: boolean
  } | null
}

function toStringAttr(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.trim() ? value : null
}

export function getTableMenuContext(state: EditorState): NevoTableMenuContext | null {
  if (!isInTable(state)) return null
  if (!(state.selection instanceof CellSelection)) return null

  try {
    const rect = selectedRect(state)
    const tablePos = rect.tableStart - 1
    const selectedRows = Math.max(1, rect.bottom - rect.top)
    const selectedCols = Math.max(1, rect.right - rect.left)

    const cellPos = state.selection.$anchorCell.pos
    const cellNode = typeof cellPos === 'number' ? state.doc.nodeAt(cellPos) : null

    return {
      inTable: true,
      tablePos,
      rows: rect.map.height,
      cols: rect.map.width,
      selectedRows,
      selectedCols,
      canMerge: mergeCells(state),
      canSplit: splitCell(state),
      isMergedCell: Boolean(cellNode && (cellNode.attrs.colspan > 1 || cellNode.attrs.rowspan > 1)),
      activeCell: cellNode && typeof cellPos === 'number'
        ? {
            pos: cellPos,
            align: toStringAttr(cellNode.attrs.align),
            background: toStringAttr(cellNode.attrs.background),
            borderColor: toStringAttr(cellNode.attrs.borderColor),
            textColor: toStringAttr(cellNode.attrs.textColor),
            padding: toStringAttr(cellNode.attrs.padding),
            formula: toStringAttr(cellNode.attrs.formula),
            isHeader: cellNode.type.name === 'table_header',
          }
        : null,
    }
  } catch {
    return null
  }
}
