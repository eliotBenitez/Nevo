import type { DbCellValue, DbField } from '../../../../types/database-block'

export function formatCellValue(field: DbField, value: DbCellValue, t: (key: string) => string): string {
  if (value === null || value === undefined) return ''
  switch (field.type) {
    case 'checkbox':
      return value === true ? t('database.cell.checked') : t('database.cell.unchecked')
    case 'select': {
      const option = field.options?.find(item => item.id === value)
      return option?.name ?? ''
    }
    case 'multi_select': {
      const ids = Array.isArray(value) ? value : []
      return ids
        .map(id => field.options?.find(item => item.id === id)?.name)
        .filter((name): name is string => Boolean(name))
        .join(', ')
    }
    case 'number':
      return typeof value === 'number' ? String(value) : ''
    default:
      return typeof value === 'string' ? value : ''
  }
}

export function isValuePresent(value: DbCellValue): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return value === true
  return true
}
