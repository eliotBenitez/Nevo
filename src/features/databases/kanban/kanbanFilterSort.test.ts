import { describe, it, expect } from 'vitest'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import {
  applyFilters,
  applySort,
  buildFilterSortContext,
  createFilterRule,
  createSortRule,
  getFilterableFields,
  isRuleActive,
  operatorsForType,
  FIELD_TITLE,
  FIELD_PRIORITY,
  FIELD_STATUS,
  type KanbanFilterRule,
} from './kanbanFilterSort'

const labels = {
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  progress: 'Progress',
  created: 'Created',
  updated: 'Updated',
  priorityLevels: { none: 'None', low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' },
}

const board: KanbanBoard = {
  id: 'b1',
  title: 'Board',
  icon: '',
  folderId: null,
  statusPropertyId: 'status',
  propertyDefinitions: [
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      order: 0,
      options: [
        { id: 'todo', name: 'To do' },
        { id: 'doing', name: 'Doing' },
        { id: 'done', name: 'Done' },
      ],
    },
  ],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}

function makeCard(over: Partial<KanbanCard>): KanbanCard {
  return {
    id: over.id ?? 'c',
    boardId: 'b1',
    title: over.title ?? '',
    content: { type: 'doc', content: [] } as KanbanCard['content'],
    properties: over.properties ?? {},
    fields: over.fields ?? [],
    columnOrder: over.columnOrder ?? 0,
    createdAt: over.createdAt ?? '2024-01-01',
    updatedAt: over.updatedAt ?? '2024-01-01',
    priority: over.priority,
    progress: over.progress,
    ...over,
  }
}

const cards: KanbanCard[] = [
  makeCard({ id: 'a', title: 'Alpha task', properties: { status: 'todo' }, priority: 'high', progress: 20 }),
  makeCard({ id: 'b', title: 'Beta work', properties: { status: 'doing' }, priority: 'low', progress: 80 }),
  makeCard({ id: 'c', title: 'Gamma alpha', properties: { status: 'done' }, priority: 'urgent', progress: 50 }),
]

function ctxFor(cardSet: KanbanCard[] = cards) {
  const fields = getFilterableFields(board, cardSet, labels)
  return { fields, ctx: buildFilterSortContext(board, fields) }
}

describe('kanbanFilterSort', () => {
  it('builds builtin + custom filterable fields', () => {
    const { fields } = ctxFor()
    const ids = fields.map(f => f.id)
    expect(ids).toContain(FIELD_TITLE)
    expect(ids).toContain(FIELD_STATUS)
    expect(ids).toContain(FIELD_PRIORITY)
    const status = fields.find(f => f.id === FIELD_STATUS)
    expect(status?.options?.map(o => o.id)).toEqual(['todo', 'doing', 'done'])
  })

  it('filters text contains', () => {
    const { ctx } = ctxFor()
    const rule: KanbanFilterRule = { id: 'r', fieldId: FIELD_TITLE, operator: 'contains', value: 'alpha' }
    const result = applyFilters(cards, [rule], ctx)
    expect(result.map(c => c.id)).toEqual(['a', 'c'])
  })

  it('filters select status is', () => {
    const { ctx } = ctxFor()
    const rule: KanbanFilterRule = { id: 'r', fieldId: FIELD_STATUS, operator: 'is', value: 'doing' }
    expect(applyFilters(cards, [rule], ctx).map(c => c.id)).toEqual(['b'])
  })

  it('filters number progress gte', () => {
    const { ctx } = ctxFor()
    const rule: KanbanFilterRule = { id: 'r', fieldId: 'builtin', operator: 'gte', value: '50' }
    // use progress field id
    const progressRule: KanbanFilterRule = { ...rule, fieldId: '__progress' }
    expect(applyFilters(cards, [progressRule], ctx).map(c => c.id).sort()).toEqual(['b', 'c'])
  })

  it('ignores empty-valued rules', () => {
    const { ctx } = ctxFor()
    const rule: KanbanFilterRule = { id: 'r', fieldId: FIELD_TITLE, operator: 'contains', value: '   ' }
    expect(isRuleActive(rule)).toBe(false)
    expect(applyFilters(cards, [rule], ctx)).toHaveLength(3)
  })

  it('sorts by priority ascending and descending', () => {
    const { ctx } = ctxFor()
    const asc = applySort(cards, [{ id: 's', fieldId: FIELD_PRIORITY, direction: 'asc' }], ctx)
    expect(asc.map(c => c.id)).toEqual(['b', 'a', 'c'])
    const desc = applySort(cards, [{ id: 's', fieldId: FIELD_PRIORITY, direction: 'desc' }], ctx)
    expect(desc.map(c => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts by title alphabetically', () => {
    const { ctx } = ctxFor()
    const sorted = applySort(cards, [{ id: 's', fieldId: FIELD_TITLE, direction: 'asc' }], ctx)
    expect(sorted.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('creates default rules for a field', () => {
    const { fields } = ctxFor()
    const titleField = fields.find(f => f.id === FIELD_TITLE)!
    const rule = createFilterRule(titleField)
    expect(rule.operator).toBe(operatorsForType('text')[0])
    const sortRule = createSortRule(titleField)
    expect(sortRule.direction).toBe('asc')
  })
})
