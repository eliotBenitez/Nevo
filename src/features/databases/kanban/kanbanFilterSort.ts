import type {
  KanbanBoard,
  KanbanCard,
  KanbanCardPriority,
  KanbanPropertyType,
} from '../../../types/kanban'
import {
  createKanbanId,
  findCardField,
  getBoardColumns,
  getCardFieldDescriptors,
  getCardStatusValue,
} from './kanbanFields'

export const FIELD_TITLE = '__title'
export const FIELD_STATUS = '__status'
export const FIELD_PRIORITY = '__priority'
export const FIELD_PROGRESS = '__progress'
export const FIELD_CREATED = '__created'
export const FIELD_UPDATED = '__updated'

export type KanbanFilterOperator =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'is_empty'
  | 'is_not_empty'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'before'
  | 'after'
  | 'has_any'
  | 'has_all'
  | 'has_none'

export type KanbanSortDirection = 'asc' | 'desc'

export interface KanbanFilterRule {
  id: string
  fieldId: string
  operator: KanbanFilterOperator
  value: string | string[]
}

export interface KanbanSortRule {
  id: string
  fieldId: string
  direction: KanbanSortDirection
}

export interface KanbanFilterFieldOption {
  id: string
  name: string
  color?: string
}

export interface KanbanFilterField {
  id: string
  name: string
  type: KanbanPropertyType
  options?: KanbanFilterFieldOption[]
}

export interface KanbanFilterSortContext {
  board: Pick<KanbanBoard, 'statusPropertyId' | 'propertyDefinitions'>
  fieldsById: Map<string, KanbanFilterField>
  statusIndex: Map<string, number>
}

export const PRIORITY_KEYS: KanbanCardPriority[] = ['none', 'low', 'medium', 'high', 'urgent']
const PRIORITY_RANK: Record<KanbanCardPriority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
}

export function getFilterableFields(
  board: Pick<KanbanBoard, 'statusPropertyId' | 'propertyDefinitions'>,
  cards: KanbanCard[],
  labels: {
    title: string
    status: string
    priority: string
    progress: string
    created: string
    updated: string
    priorityLevels: Record<KanbanCardPriority, string>
  },
): KanbanFilterField[] {
  const statusOptions = getBoardColumns(board).map(option => ({
    id: option.id,
    name: option.name,
    color: option.color,
  }))

  const builtins: KanbanFilterField[] = [
    { id: FIELD_TITLE, name: labels.title, type: 'text' },
    { id: FIELD_STATUS, name: labels.status, type: 'select', options: statusOptions },
    {
      id: FIELD_PRIORITY,
      name: labels.priority,
      type: 'select',
      options: PRIORITY_KEYS.map(key => ({ id: key, name: labels.priorityLevels[key] })),
    },
    { id: FIELD_PROGRESS, name: labels.progress, type: 'number' },
    { id: FIELD_CREATED, name: labels.created, type: 'date' },
    { id: FIELD_UPDATED, name: labels.updated, type: 'date' },
  ]

  const custom = getCardFieldDescriptors(cards).map<KanbanFilterField>(descriptor => ({
    id: descriptor.id,
    name: descriptor.name,
    type: descriptor.type,
    options: descriptor.options?.map(option => ({ id: option.id, name: option.name, color: option.color })),
  }))

  return [...builtins, ...custom]
}

export function buildFilterSortContext(
  board: Pick<KanbanBoard, 'statusPropertyId' | 'propertyDefinitions'>,
  fields: KanbanFilterField[],
): KanbanFilterSortContext {
  const statusIndex = new Map<string, number>()
  getBoardColumns(board).forEach((option, index) => statusIndex.set(option.id, index))
  return {
    board,
    fieldsById: new Map(fields.map(field => [field.id, field])),
    statusIndex,
  }
}

export function operatorsForType(type: KanbanPropertyType): KanbanFilterOperator[] {
  switch (type) {
    case 'text':
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

export function operatorNeedsValue(operator: KanbanFilterOperator): boolean {
  return operator !== 'is_empty' && operator !== 'is_not_empty'
}

export function defaultOperatorFor(type: KanbanPropertyType): KanbanFilterOperator {
  return operatorsForType(type)[0]
}

export function defaultValueFor(type: KanbanPropertyType): string | string[] {
  if (type === 'multi_select') return []
  if (type === 'checkbox') return 'true'
  return ''
}

export function createFilterRule(field: KanbanFilterField): KanbanFilterRule {
  const operator = defaultOperatorFor(field.type)
  return {
    id: createKanbanId(),
    fieldId: field.id,
    operator,
    value: defaultValueFor(field.type),
  }
}

export function createSortRule(field: KanbanFilterField): KanbanSortRule {
  return { id: createKanbanId(), fieldId: field.id, direction: 'asc' }
}

type RawValue = string | string[] | number | boolean | null

function getRawValue(card: KanbanCard, field: KanbanFilterField, ctx: KanbanFilterSortContext): RawValue {
  switch (field.id) {
    case FIELD_TITLE:
      return card.title ?? ''
    case FIELD_STATUS:
      return getCardStatusValue(card, ctx.board)
    case FIELD_PRIORITY:
      return card.priority ?? 'none'
    case FIELD_PROGRESS:
      return typeof card.progress === 'number' ? card.progress : null
    case FIELD_CREATED:
      return card.createdAt ?? ''
    case FIELD_UPDATED:
      return card.updatedAt ?? ''
    default: {
      const cardField = findCardField(card, { id: field.id })
      if (!cardField) return field.type === 'multi_select' ? [] : null
      return cardField.value as RawValue
    }
  }
}

function isEmptyRaw(value: RawValue): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function asString(value: RawValue): string {
  return typeof value === 'string' ? value : value === null ? '' : String(value)
}

function asArray(value: RawValue): string[] {
  return Array.isArray(value) ? value : []
}

function dayStamp(value: string): number {
  const date = new Date(value)
  if (isNaN(date.getTime())) return NaN
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function matchesFilter(card: KanbanCard, rule: KanbanFilterRule, ctx: KanbanFilterSortContext): boolean {
  const field = ctx.fieldsById.get(rule.fieldId)
  if (!field) return true
  const raw = getRawValue(card, field, ctx)

  if (rule.operator === 'is_empty') return isEmptyRaw(raw)
  if (rule.operator === 'is_not_empty') return !isEmptyRaw(raw)

  switch (field.type) {
    case 'text': {
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
      if (typeof raw !== 'number') return false
      const target = Number(rule.value)
      if (isNaN(target)) return true
      switch (rule.operator) {
        case 'eq': return raw === target
        case 'neq': return raw !== target
        case 'gt': return raw > target
        case 'lt': return raw < target
        case 'gte': return raw >= target
        case 'lte': return raw <= target
        default: return true
      }
    }
    case 'date': {
      const current = dayStamp(asString(raw))
      const target = dayStamp(asString(rule.value as string))
      if (isNaN(current) || isNaN(target)) return false
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

export function isRuleActive(rule: KanbanFilterRule): boolean {
  if (!operatorNeedsValue(rule.operator)) return true
  if (Array.isArray(rule.value)) return rule.value.length > 0
  return rule.value.trim() !== ''
}

export function applyFilters(cards: KanbanCard[], rules: KanbanFilterRule[], ctx: KanbanFilterSortContext): KanbanCard[] {
  const active = rules.filter(isRuleActive)
  if (!active.length) return cards
  return cards.filter(card => active.every(rule => matchesFilter(card, rule, ctx)))
}

interface SortKey {
  empty: boolean
  key: number | string
}

function getSortKey(card: KanbanCard, field: KanbanFilterField, ctx: KanbanFilterSortContext): SortKey {
  const raw = getRawValue(card, field, ctx)
  if (field.id === FIELD_PRIORITY) {
    const rank = PRIORITY_RANK[(raw as KanbanCardPriority) ?? 'none'] ?? 0
    return { empty: rank === 0, key: rank }
  }
  if (field.id === FIELD_STATUS) {
    const index = ctx.statusIndex.get(asString(raw))
    return { empty: index === undefined, key: index ?? 0 }
  }

  switch (field.type) {
    case 'number': {
      if (typeof raw !== 'number') return { empty: true, key: 0 }
      return { empty: false, key: raw }
    }
    case 'date': {
      const stamp = new Date(asString(raw)).getTime()
      return isNaN(stamp) ? { empty: true, key: 0 } : { empty: false, key: stamp }
    }
    case 'checkbox':
      return { empty: false, key: raw === true ? 1 : 0 }
    case 'multi_select': {
      const arr = asArray(raw)
      return { empty: arr.length === 0, key: arr.length }
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

export function applySort(cards: KanbanCard[], rules: KanbanSortRule[], ctx: KanbanFilterSortContext): KanbanCard[] {
  const active = rules.filter(rule => ctx.fieldsById.has(rule.fieldId))
  if (!active.length) return cards
  return [...cards].sort((a, b) => {
    for (const rule of active) {
      const field = ctx.fieldsById.get(rule.fieldId)!
      const ka = getSortKey(a, field, ctx)
      const kb = getSortKey(b, field, ctx)
      if (ka.empty && kb.empty) continue
      if (ka.empty) return 1
      if (kb.empty) return -1
      const cmp = compareKey(ka.key, kb.key)
      if (cmp !== 0) return rule.direction === 'desc' ? -cmp : cmp
    }
    return 0
  })
}
