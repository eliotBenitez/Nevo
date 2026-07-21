import {
  createDbId,
  type DbCellValue,
  type DbField,
  type DbFieldType,
  type DbFilterOperator,
  type DbFilterRule,
  type DbRecord,
  type DbSortRule,
} from '../types/database-block'

export function operatorsForType(type: DbFieldType): DbFilterOperator[] {
  switch (type) {
    case 'text':
    case 'url':
      return ['contains', 'not_contains', 'is', 'is_not', 'is_empty', 'is_not_empty']
    case 'select':
      return ['is', 'is_not', 'is_empty', 'is_not_empty']
    case 'multi_select':
      return ['has_any', 'has_all', 'has_none', 'is_empty', 'is_not_empty']
    case 'number':
      return ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'is_empty', 'is_not_empty']
    case 'date':
      return ['is', 'before', 'after', 'is_empty', 'is_not_empty']
    case 'checkbox':
      return ['is']
    default:
      return ['is_empty', 'is_not_empty']
  }
}

export function operatorNeedsValue(operator: DbFilterOperator): boolean {
  return operator !== 'is_empty' && operator !== 'is_not_empty'
}

export function defaultOperatorFor(type: DbFieldType): DbFilterOperator {
  return operatorsForType(type)[0]
}

export function defaultValueFor(type: DbFieldType): string | string[] {
  if (type === 'multi_select') return []
  if (type === 'checkbox') return 'true'
  return ''
}

export function createFilterRule(field: DbField): DbFilterRule {
  const operator = defaultOperatorFor(field.type)
  return { id: createDbId('flt'), fieldId: field.id, operator, value: defaultValueFor(field.type) }
}

export function createSortRule(field: DbField): DbSortRule {
  return { id: createDbId('srt'), fieldId: field.id, direction: 'asc' }
}

function getRawValue(record: DbRecord, field: DbField): DbCellValue {
  const value = record.cells[field.id]
  if (value === undefined) return field.type === 'multi_select' ? [] : null
  return value
}

function isEmptyRaw(value: DbCellValue): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function asString(value: DbCellValue): string {
  return typeof value === 'string' ? value : value === null ? '' : String(value)
}

function asArray(value: DbCellValue): string[] {
  return Array.isArray(value) ? value : []
}

function asNumber(value: DbCellValue): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isNaN(n) ? null : n
  }
  return null
}

function dayStamp(value: string): number {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return NaN
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function matchesFilter(record: DbRecord, rule: DbFilterRule, fieldsById: Map<string, DbField>): boolean {
  const field = fieldsById.get(rule.fieldId)
  if (!field) return true
  const raw = getRawValue(record, field)

  if (rule.operator === 'is_empty') return isEmptyRaw(raw)
  if (rule.operator === 'is_not_empty') return !isEmptyRaw(raw)

  switch (field.type) {
    case 'text':
    case 'url': {
      const haystack = asString(raw).toLocaleLowerCase()
      const needle = asString(rule.value as string).toLocaleLowerCase()
      switch (rule.operator) {
        case 'contains': return haystack.includes(needle)
        case 'not_contains': return !haystack.includes(needle)
        case 'is': return haystack === needle
        case 'is_not': return haystack !== needle
        default: return true
      }
    }
    case 'select': {
      const current = asString(raw)
      const target = asString(rule.value as string)
      if (rule.operator === 'is') return current === target
      if (rule.operator === 'is_not') return current !== target
      return true
    }
    case 'multi_select': {
      const current = asArray(raw)
      const target = asArray(rule.value)
      switch (rule.operator) {
        case 'has_any': return target.length === 0 || target.some(value => current.includes(value))
        case 'has_all': return target.every(value => current.includes(value))
        case 'has_none': return !target.some(value => current.includes(value))
        default: return true
      }
    }
    case 'number': {
      const current = asNumber(raw)
      if (current === null) return false
      const target = Number(rule.value)
      if (Number.isNaN(target)) return true
      switch (rule.operator) {
        case 'eq': return current === target
        case 'neq': return current !== target
        case 'gt': return current > target
        case 'lt': return current < target
        case 'gte': return current >= target
        case 'lte': return current <= target
        default: return true
      }
    }
    case 'date': {
      const current = dayStamp(asString(raw))
      const target = dayStamp(asString(rule.value as string))
      if (Number.isNaN(current) || Number.isNaN(target)) return false
      switch (rule.operator) {
        case 'is': return current === target
        case 'before': return current < target
        case 'after': return current > target
        default: return true
      }
    }
    case 'checkbox': {
      const current = raw === true
      return current === (rule.value === 'true')
    }
    default:
      return true
  }
}

export function isRuleActive(rule: DbFilterRule): boolean {
  if (!operatorNeedsValue(rule.operator)) return true
  if (Array.isArray(rule.value)) return rule.value.length > 0
  return rule.value.trim() !== ''
}

export function applyFilters(records: DbRecord[], rules: DbFilterRule[], fieldsById: Map<string, DbField>): DbRecord[] {
  const active = rules.filter(isRuleActive)
  if (!active.length) return records
  return records.filter(record => active.every(rule => matchesFilter(record, rule, fieldsById)))
}

interface SortKey {
  empty: boolean
  key: number | string
}

function getSortKey(record: DbRecord, field: DbField): SortKey {
  const raw = getRawValue(record, field)
  switch (field.type) {
    case 'number': {
      const n = asNumber(raw)
      return n === null ? { empty: true, key: 0 } : { empty: false, key: n }
    }
    case 'date': {
      const stamp = new Date(asString(raw)).getTime()
      return Number.isNaN(stamp) ? { empty: true, key: 0 } : { empty: false, key: stamp }
    }
    case 'checkbox':
      return { empty: false, key: raw === true ? 1 : 0 }
    case 'multi_select': {
      const arr = asArray(raw)
      return { empty: arr.length === 0, key: arr.join(', ').toLocaleLowerCase() }
    }
    case 'select': {
      const value = asString(raw)
      if (!value) return { empty: true, key: '' }
      const option = field.options?.find(item => item.id === value)
      return { empty: false, key: (option?.name ?? value).toLocaleLowerCase() }
    }
    default: {
      const value = asString(raw)
      return { empty: value.trim() === '', key: value.toLocaleLowerCase() }
    }
  }
}

function compareKey(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export function applySort(records: DbRecord[], rules: DbSortRule[], fieldsById: Map<string, DbField>): DbRecord[] {
  const active = rules.filter(rule => fieldsById.has(rule.fieldId))
  if (!active.length) return records
  return [...records].sort((a, b) => {
    for (const rule of active) {
      const field = fieldsById.get(rule.fieldId)!
      const ka = getSortKey(a, field)
      const kb = getSortKey(b, field)
      if (ka.empty && kb.empty) continue
      if (ka.empty) return 1
      if (kb.empty) return -1
      const cmp = compareKey(ka.key, kb.key)
      if (cmp !== 0) return rule.direction === 'desc' ? -cmp : cmp
    }
    return 0
  })
}

export function buildFieldsById(fields: DbField[]): Map<string, DbField> {
  return new Map(fields.map(field => [field.id, field]))
}

export function visibleRecords(records: DbRecord[], filters: DbFilterRule[], sorts: DbSortRule[], fields: DbField[]): DbRecord[] {
  const fieldsById = buildFieldsById(fields)
  return applySort(applyFilters(records, filters, fieldsById), sorts, fieldsById)
}
