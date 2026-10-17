import type { DatabaseBlockData, DbCellValue, DbField } from '../../types/database-block'
import { visibleRecords } from '../../editor-core/databaseFilterSort'

export function formatDbCellValue(value: DbCellValue, field: DbField): string {
  if (value === null || value === undefined) return ''
  if (field.type === 'select') {
    const id = typeof value === 'string' ? value : ''
    if (!id) return ''
    return field.options?.find(o => o.id === id)?.name ?? id
  }
  if (field.type === 'multi_select') {
    const ids = Array.isArray(value) ? value : []
    return ids.map(id => field.options?.find(o => o.id === id)?.name ?? id).join(', ')
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '✓' : ''
  return String(value)
}

export function databaseBlockRecords(data: DatabaseBlockData) {
  if (data.version !== 1) return []
  const view = data.views.find(v => v.id === data.activeView) ?? data.views[0]
  return view ? visibleRecords(data.records, view.filters, view.sorts, data.fields) : data.records
}
