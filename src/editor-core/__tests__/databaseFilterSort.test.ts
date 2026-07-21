import { describe, expect, it } from 'vitest'
import {
  applyFilters,
  applySort,
  buildFieldsById,
  operatorsForType,
  visibleRecords,
} from '../databaseFilterSort'
import type { DbField, DbFilterRule, DbRecord, DbSortRule } from '../../types/database-block'

function field(overrides: Partial<DbField> & Pick<DbField, 'id' | 'type'>): DbField {
  return { name: overrides.id, ...overrides }
}

function record(id: string, cells: DbRecord['cells']): DbRecord {
  return { id, cells }
}

function filterRule(overrides: Partial<DbFilterRule> & Pick<DbFilterRule, 'fieldId' | 'operator'>): DbFilterRule {
  return { id: `flt_${overrides.fieldId}_${overrides.operator}`, value: '', ...overrides }
}

function sortRule(fieldId: string, direction: DbSortRule['direction']): DbSortRule {
  return { id: `srt_${fieldId}`, fieldId, direction }
}

describe('operatorsForType', () => {
  it('returns the expected operator set per field type', () => {
    expect(operatorsForType('text')).toEqual(['contains', 'not_contains', 'is', 'is_not', 'is_empty', 'is_not_empty'])
    expect(operatorsForType('url')).toEqual(['contains', 'not_contains', 'is', 'is_not', 'is_empty', 'is_not_empty'])
    expect(operatorsForType('select')).toEqual(['is', 'is_not', 'is_empty', 'is_not_empty'])
    expect(operatorsForType('multi_select')).toEqual(['has_any', 'has_all', 'has_none', 'is_empty', 'is_not_empty'])
    expect(operatorsForType('number')).toEqual(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'is_empty', 'is_not_empty'])
    expect(operatorsForType('date')).toEqual(['is', 'before', 'after', 'is_empty', 'is_not_empty'])
    expect(operatorsForType('checkbox')).toEqual(['is'])
  })
})

describe('applyFilters', () => {
  const textField = field({ id: 'name', type: 'text' })
  const numberField = field({ id: 'age', type: 'number' })
  const selectField = field({
    id: 'status', type: 'select',
    options: [{ id: 'todo', name: 'Todo' }, { id: 'done', name: 'Done' }],
  })
  const multiField = field({
    id: 'tags', type: 'multi_select',
    options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
  })
  const dateField = field({ id: 'due', type: 'date' })
  const checkboxField = field({ id: 'active', type: 'checkbox' })

  const fields: DbField[] = [textField, numberField, selectField, multiField, dateField, checkboxField]
  const fieldsById = buildFieldsById(fields)

  const records: DbRecord[] = [
    record('r1', { name: 'Alice', age: 30, status: 'todo', tags: ['a', 'b'], due: '2024-01-10', active: true }),
    record('r2', { name: 'Bob', age: 20, status: 'done', tags: ['c'], due: '2024-02-05', active: false }),
    record('r3', { name: '', age: null, status: '', tags: [], due: '', active: false }),
  ]

  it('text: contains matches substrings case-insensitively', () => {
    const rule = filterRule({ fieldId: 'name', operator: 'contains', value: 'ali' })
    expect(applyFilters(records, [rule], fieldsById).map(r => r.id)).toEqual(['r1'])
  })

  it('text: is matches exact value', () => {
    const rule = filterRule({ fieldId: 'name', operator: 'is', value: 'bob' })
    expect(applyFilters(records, [rule], fieldsById).map(r => r.id)).toEqual(['r2'])
  })

  it('text: is_empty matches blank values', () => {
    const rule = filterRule({ fieldId: 'name', operator: 'is_empty' })
    expect(applyFilters(records, [rule], fieldsById).map(r => r.id)).toEqual(['r3'])
  })

  it('number: gt and lte compare numerically', () => {
    const gtRule = filterRule({ fieldId: 'age', operator: 'gt', value: '25' })
    expect(applyFilters(records, [gtRule], fieldsById).map(r => r.id)).toEqual(['r1'])

    const lteRule = filterRule({ fieldId: 'age', operator: 'lte', value: '20' })
    expect(applyFilters(records, [lteRule], fieldsById).map(r => r.id)).toEqual(['r2'])
  })

  it('select: is / is_not match by option id', () => {
    const isRule = filterRule({ fieldId: 'status', operator: 'is', value: 'todo' })
    expect(applyFilters(records, [isRule], fieldsById).map(r => r.id)).toEqual(['r1'])

    const isNotRule = filterRule({ fieldId: 'status', operator: 'is_not', value: 'todo' })
    expect(applyFilters(records, [isNotRule], fieldsById).map(r => r.id)).toEqual(['r2', 'r3'])
  })

  it('multi_select: has_any / has_all / has_none', () => {
    const hasAny = filterRule({ fieldId: 'tags', operator: 'has_any', value: ['b', 'c'] })
    expect(applyFilters(records, [hasAny], fieldsById).map(r => r.id)).toEqual(['r1', 'r2'])

    const hasAll = filterRule({ fieldId: 'tags', operator: 'has_all', value: ['a', 'b'] })
    expect(applyFilters(records, [hasAll], fieldsById).map(r => r.id)).toEqual(['r1'])

    const hasNone = filterRule({ fieldId: 'tags', operator: 'has_none', value: ['a'] })
    expect(applyFilters(records, [hasNone], fieldsById).map(r => r.id)).toEqual(['r2', 'r3'])
  })

  it('date: before / after compare by day', () => {
    const before = filterRule({ fieldId: 'due', operator: 'before', value: '2024-02-01' })
    expect(applyFilters(records, [before], fieldsById).map(r => r.id)).toEqual(['r1'])

    const after = filterRule({ fieldId: 'due', operator: 'after', value: '2024-01-15' })
    expect(applyFilters(records, [after], fieldsById).map(r => r.id)).toEqual(['r2'])
  })

  it('checkbox: is matches boolean state', () => {
    const isTrue = filterRule({ fieldId: 'active', operator: 'is', value: 'true' })
    expect(applyFilters(records, [isTrue], fieldsById).map(r => r.id)).toEqual(['r1'])

    const isFalse = filterRule({ fieldId: 'active', operator: 'is', value: 'false' })
    expect(applyFilters(records, [isFalse], fieldsById).map(r => r.id)).toEqual(['r2', 'r3'])
  })

  it('returns all records when there are no active rules', () => {
    const emptyValueRule = filterRule({ fieldId: 'name', operator: 'contains', value: '' })
    expect(applyFilters(records, [emptyValueRule], fieldsById).map(r => r.id)).toEqual(['r1', 'r2', 'r3'])
  })
})

describe('applySort', () => {
  const numberField = field({ id: 'age', type: 'number' })
  const textField = field({ id: 'name', type: 'text' })
  const fields: DbField[] = [numberField, textField]
  const fieldsById = buildFieldsById(fields)

  const records: DbRecord[] = [
    record('r1', { name: 'Charlie', age: 40 }),
    record('r2', { name: 'Alice', age: null }),
    record('r3', { name: 'Bob', age: 10 }),
  ]

  it('sorts ascending, placing empty values last', () => {
    const sorted = applySort(records, [sortRule('age', 'asc')], fieldsById)
    expect(sorted.map(r => r.id)).toEqual(['r3', 'r1', 'r2'])
  })

  it('sorts descending, still placing empty values last', () => {
    const sorted = applySort(records, [sortRule('age', 'desc')], fieldsById)
    expect(sorted.map(r => r.id)).toEqual(['r1', 'r3', 'r2'])
  })

  it('sorts by text field alphabetically', () => {
    const sorted = applySort(records, [sortRule('name', 'asc')], fieldsById)
    expect(sorted.map(r => r.id)).toEqual(['r2', 'r3', 'r1'])
  })

  it('returns records unchanged when no sort rules reference known fields', () => {
    const sorted = applySort(records, [sortRule('missing', 'asc')], fieldsById)
    expect(sorted.map(r => r.id)).toEqual(['r1', 'r2', 'r3'])
  })
})

describe('visibleRecords', () => {
  const numberField = field({ id: 'age', type: 'number' })
  const fields: DbField[] = [numberField]

  const records: DbRecord[] = [
    record('r1', { age: 40 }),
    record('r2', { age: 10 }),
    record('r3', { age: 25 }),
  ]

  it('applies filters then sort together', () => {
    const filters: DbFilterRule[] = [filterRule({ fieldId: 'age', operator: 'gte', value: '10' })]
    const sorts: DbSortRule[] = [sortRule('age', 'asc')]
    const result = visibleRecords(records, filters, sorts, fields)
    expect(result.map(r => r.id)).toEqual(['r2', 'r3', 'r1'])
  })
})
