import { detectDelimiter, inferColumnType, parseCsv } from '../../csv/parseCsv'
import {
  createDbId,
  defaultViewStyle,
  type DatabaseBlockDataV2,
  type DbCellValue,
  type DbField,
  type DbFieldOption,
  type DbFieldType,
  type DbRecord,
} from '../../../types/database-block'

function cellFor(
  raw: string,
  type: DbFieldType,
  optionMap: Map<string, DbFieldOption>,
  optionColor?: (index: number) => string,
): DbCellValue {
  const trimmed = raw.trim()
  if (type === 'number') return trimmed === '' || Number.isNaN(Number(trimmed)) ? null : Number(trimmed)
  if (type === 'checkbox') return /^(true|yes)$/i.test(trimmed)
  if (type === 'date') return trimmed || null
  if (type === 'select') {
    if (!trimmed) return null
    let option = [...optionMap.values()].find(value => value.name === trimmed)
    if (!option) {
      option = { id: createDbId('opt'), name: trimmed, color: optionColor?.(optionMap.size) }
      optionMap.set(option.id, option)
    }
    return option.id
  }
  if (type === 'multi_select') {
    if (!trimmed) return []
    return trimmed.split(',').map(value => value.trim()).filter(Boolean).map(value => {
      let option = [...optionMap.values()].find(item => item.name === value)
      if (!option) {
        option = { id: createDbId('opt'), name: value, color: optionColor?.(optionMap.size) }
        optionMap.set(option.id, option)
      }
      return option.id
    })
  }
  return trimmed
}

export function buildCsvFieldsAndRecords(
  columns: string[],
  rows: string[][],
  types: DbFieldType[],
  optionColor?: (index: number) => string,
): { fields: DbField[]; records: DbRecord[] } {
  const fieldIds = columns.map(() => createDbId('f'))
  const optionMaps = columns.map(() => new Map<string, DbFieldOption>())
  const records = rows.map(row => ({
    id: createDbId('r'),
    cells: Object.fromEntries(columns.map((_column, index) => [
      fieldIds[index],
      cellFor(row[index] ?? '', types[index] ?? 'text', optionMaps[index], optionColor),
    ])),
  }))
  const fields = columns.map((name, index) => {
    const type = types[index] ?? 'text'
    const field: DbField = { id: fieldIds[index], name: name || `Column ${index + 1}`, type, width: 180 }
    if (type === 'select' || type === 'multi_select') field.options = [...optionMaps[index].values()]
    return field
  })
  return { fields, records }
}

function inferNotionType(values: string[]): DbFieldType {
  const samples = values.map(value => value.trim()).filter(Boolean)
  if (samples.length > 0 && samples.every(value => /^https?:\/\/\S+$/i.test(value))) return 'url'
  return inferColumnType(values)
}

export function parseNotionCsv(content: string): { fields: DbField[]; records: DbRecord[] } {
  const parsed = parseCsv(content, detectDelimiter(content))
  if (!parsed.headers.length) throw new Error('CSV has no columns')
  const types = parsed.headers.map((_header, index) => inferNotionType(parsed.rows.map(row => row[index] ?? '')))
  return buildCsvFieldsAndRecords(parsed.headers, parsed.rows, types)
}

export function createDatabaseMetadata(title: string, fields: DbField[], rowCount: number): DatabaseBlockDataV2 {
  const viewId = createDbId('v')
  return {
    version: 2,
    databaseId: createDbId('database'),
    rowCount,
    title,
    fields,
    activeView: viewId,
    views: [{ id: viewId, name: 'Table', type: 'table', filters: [], sorts: [], style: defaultViewStyle() }],
  }
}
