import type { Node as PMNode, NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { TableInsertOptions } from './types'

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
