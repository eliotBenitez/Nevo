import type { Node as PMNode, NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { CellSelection } from 'prosemirror-tables'
import type { TableInsertOptions } from './types'

function isCellNode(node: PMNode | null): boolean {
  return Boolean(node) && (node!.type.name === 'table_cell' || node!.type.name === 'table_header')
}

/** Resolve the document position of the cell targeted by the current selection. */
function findActiveCellPos(state: Parameters<Command>[0]): number | null {
  const sel = state.selection
  if (sel instanceof CellSelection) return sel.$anchorCell.pos
  const $from = sel.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
      return $from.before(depth)
    }
  }
  return null
}

/**
 * Sets (or clears, when value is null/empty) the `formula` attribute of the
 * active table cell. When a formula is set, the cell content is replaced with a
 * single empty paragraph so only the formula text is persisted — the computed
 * value is rendered on the fly by the table-formula plugin.
 */
export function createSetCellFormulaCommand(value: string | null): Command {
  return (state, dispatch) => {
    const cellPos = findActiveCellPos(state)
    if (cellPos === null) return false
    const cell = state.doc.nodeAt(cellPos)
    if (!isCellNode(cell) || !cell) return false
    if (!dispatch) return true

    const trimmed = value && value.trim() ? value.trim() : null
    let tr = state.tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, formula: trimmed })

    if (trimmed) {
      const paragraph = state.schema.nodes.paragraph?.createAndFill()
      if (paragraph) {
        tr = tr.replaceWith(cellPos + 1, cellPos + cell.nodeSize - 1, paragraph)
      }
    }

    dispatch(tr.scrollIntoView())
    return true
  }
}

export function createTableNode(
  tableType: NodeType,
  rowType: NodeType,
  cellType: NodeType,
  headerType: NodeType,
  options?: TableInsertOptions,
): PMNode | null {
  const rows = Math.max(1, options?.rows ?? 3)
  const cols = Math.max(1, options?.cols ?? 3)
  const withHeaderRow = options?.withHeaderRow ?? true

  const rowNodes: PMNode[] = []
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const cellNodes: PMNode[] = []
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      const type = withHeaderRow && rowIndex === 0 ? headerType : cellType
      const paragraph = type.schema.nodes.paragraph.createAndFill()
      if (!paragraph) return null
      cellNodes.push(type.createAndFill(null, paragraph) ?? type.create(null, paragraph))
    }
    rowNodes.push(rowType.createAndFill(null, cellNodes) ?? rowType.create(null, cellNodes))
  }

  return tableType.createAndFill(null, rowNodes) ?? tableType.create(null, rowNodes)
}

export function createInsertTableCommand(
  tableType: NodeType,
  rowType: NodeType,
  cellType: NodeType,
  headerType: NodeType,
  options?: TableInsertOptions,
): Command {
  return (state, dispatch) => {
    const table = createTableNode(tableType, rowType, cellType, headerType, options)
    if (!table) return false
    if (!dispatch) return true
    dispatch(state.tr.replaceSelectionWith(table, false).scrollIntoView())
    return true
  }
}
