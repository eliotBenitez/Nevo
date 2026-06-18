import type { Node as PMNode } from 'prosemirror-model'
import { TableMap } from 'prosemirror-tables'
import type { HyperFormula as HyperFormulaClass } from 'hyperformula'
import type { BlockNode } from '../types/note'

// hyperformula (~heavy parser/engine) is loaded lazily on first use so it stays
// out of the initial bundle. Callers that compute synchronously (recalc plugin,
// export serializers) must ensure the module is loaded first via loadHyperformula()
// / isHyperformulaLoaded(). The open-source build is unlocked with the GPLv3 key.
type RawCell = string | number | boolean | null
type HyperFormulaCtorType = typeof HyperFormulaClass

let HyperFormulaCtor: HyperFormulaCtorType | null = null
let loadPromise: Promise<void> | null = null

const LICENSE_KEY = 'gpl-v3'

export function isHyperformulaLoaded(): boolean {
  return HyperFormulaCtor !== null
}

export function loadHyperformula(): Promise<void> {
  if (HyperFormulaCtor) return Promise.resolve()
  if (!loadPromise) {
    loadPromise = import('hyperformula').then((mod) => {
      HyperFormulaCtor = mod.HyperFormula
    })
  }
  return loadPromise
}

export interface FormulaCellResult {
  value: string
  error: boolean
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  // Trim floating-point noise (e.g. 0.1 + 0.2) without forcing trailing zeros.
  const rounded = Number(value.toFixed(10))
  return String(rounded)
}

function formatCellValue(value: unknown): FormulaCellResult {
  if (value === null || value === undefined) return { value: '', error: false }
  if (typeof value === 'number') return { value: formatNumber(value), error: false }
  if (typeof value === 'boolean') return { value: value ? 'TRUE' : 'FALSE', error: false }
  // DetailedCellError exposes a `.value` like '#DIV/0!' / '#REF!'.
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return { value: String((value as { value: unknown }).value), error: true }
  }
  return { value: String(value), error: false }
}

/** Parse the visible text of a non-formula cell into a typed spreadsheet value. */
function parseLiteral(text: string): RawCell {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Keep numeric cells as real numbers so SUM/AVERAGE etc. operate on them.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

function normalizeFormula(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith('=') ? trimmed : `=${trimmed}`
}

/**
 * Low-level core: evaluate a rectangular grid where each cell is either a literal
 * value or a formula string (starting with `=`). Returns a map keyed by
 * `${row}:${col}` holding the computed result for every formula cell. Requires
 * hyperformula to be loaded; returns an empty map otherwise.
 */
export function computeGrid(grid: RawCell[][]): Map<string, FormulaCellResult> {
  const result = new Map<string, FormulaCellResult>()
  if (!HyperFormulaCtor) return result
  if (grid.length === 0) return result

  let engine: HyperFormulaClass | null = null
  try {
    engine = HyperFormulaCtor.buildFromArray(grid, { licenseKey: LICENSE_KEY })
    for (let row = 0; row < grid.length; row += 1) {
      const cols = grid[row]
      for (let col = 0; col < cols.length; col += 1) {
        const raw = cols[col]
        if (typeof raw !== 'string' || !raw.startsWith('=')) continue
        const cellValue = engine.getCellValue({ sheet: 0, row, col })
        result.set(`${row}:${col}`, formatCellValue(cellValue))
      }
    }
  } catch {
    // A malformed grid should not crash the editor; formula cells just stay blank.
  } finally {
    engine?.destroy()
  }
  return result
}

export interface TableFormulaResult {
  /** Absolute document position of the cell node (before it). */
  cellPos: number
  value: string
  error: boolean
}

/**
 * Build an A1 grid from a ProseMirror `table` node and evaluate its formula
 * cells. `tableStart` is the position just inside the table node (tablePos + 1).
 * Merged cells (colspan/rowspan) put their value in the top-left slot; covered
 * slots stay empty (best-effort for v1).
 */
export function computeTableValues(table: PMNode, tableStart: number): TableFormulaResult[] {
  if (!isHyperformulaLoaded()) return []

  let map: TableMap
  try {
    map = TableMap.get(table)
  } catch {
    return []
  }

  const { width, height } = map
  const grid: RawCell[][] = Array.from({ length: height }, () => Array<RawCell>(width).fill(null))
  const formulaCells: { row: number; col: number; cellPos: number }[] = []
  const seen = new Set<number>()

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const offset = map.map[row * width + col]
      if (seen.has(offset)) continue
      seen.add(offset)
      const cell = table.nodeAt(offset)
      if (!cell) continue
      const formula = typeof cell.attrs.formula === 'string' ? cell.attrs.formula.trim() : ''
      if (formula) {
        grid[row][col] = normalizeFormula(formula)
        formulaCells.push({ row, col, cellPos: tableStart + offset })
      } else {
        grid[row][col] = parseLiteral(cell.textContent)
      }
    }
  }

  const computed = computeGrid(grid)
  return formulaCells.map(({ row, col, cellPos }) => {
    const res = computed.get(`${row}:${col}`) ?? { value: '', error: false }
    return { cellPos, value: res.value, error: res.error }
  })
}

function blockTextContent(node: BlockNode): string {
  if (typeof node.text === 'string') return node.text
  const children = node.content ?? []
  let text = ''
  for (const child of children) text += blockTextContent(child)
  return text
}

/**
 * Export-time variant: evaluate the formula cells of a `table` BlockNode (JSON).
 * Keyed by `${rowIndex}:${cellIndexWithinRow}`. Colspan/rowspan are ignored here
 * (naive row/column indexing), which is acceptable for export and matches the
 * common no-merge case. Requires hyperformula to be loaded.
 */
export function computeBlockTableValues(table: BlockNode): Map<string, FormulaCellResult> {
  const out = new Map<string, FormulaCellResult>()
  if (!isHyperformulaLoaded()) return out

  const rows = table.content ?? []
  const grid: RawCell[][] = []
  const formulaPositions: { row: number; col: number }[] = []

  rows.forEach((row, r) => {
    const cells = row.content ?? []
    const gridRow: RawCell[] = []
    cells.forEach((cell, c) => {
      const formula = typeof cell.attrs?.formula === 'string' ? cell.attrs.formula.trim() : ''
      if (formula) {
        gridRow.push(normalizeFormula(formula))
        formulaPositions.push({ row: r, col: c })
      } else {
        gridRow.push(parseLiteral(blockTextContent(cell)))
      }
    })
    grid.push(gridRow)
  })

  const computed = computeGrid(grid)
  for (const { row, col } of formulaPositions) {
    out.set(`${row}:${col}`, computed.get(`${row}:${col}`) ?? { value: '', error: false })
  }
  return out
}
