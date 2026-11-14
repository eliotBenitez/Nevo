import { describe, expect, it } from 'vitest'
import type { KanbanAutomation, KanbanBoard, KanbanCard, KanbanCardField } from '../../../types/kanban'
import { applyTagsToFields, bumpRunCount, planAutomations, weeklyRunCount } from './kanbanAutomations'

const board = (automations: KanbanAutomation[]): KanbanBoard => ({
  id: 'b', title: 'B', icon: 'K', folderId: null, statusPropertyId: 'st',
  propertyDefinitions: [{ id: 'st', name: 'Status', type: 'select', order: 0, options: [
    { id: 'todo', name: 'To Do' }, { id: 'doing', name: 'Doing' }, { id: 'done', name: 'Done' },
  ] }],
  automations, createdAt: 't', updatedAt: 't',
})

const checklist = (checked: boolean[]) => ({
  type: 'doc',
  content: checked.map(c => ({ type: 'checklist_item', attrs: { checked: c } })),
})

const card = (status: string, content: unknown = { type: 'doc', content: [] }): KanbanCard => ({
  id: 'c', boardId: 'b', title: 'C', content, properties: { st: status }, fields: [], columnOrder: 0, createdAt: 't', updatedAt: 't',
} as KanbanCard)

const rule = (patch: Partial<KanbanAutomation>): KanbanAutomation =>
  ({ id: 'r1', trigger: 'status_change', triggerValue: 'doing', action: 'move_to', actionValue: 'done', enabled: true, ...patch })

describe('planAutomations', () => {
  it('fires status_change by column id and by case-insensitive name', () => {
    const none = new Set<string>()
    expect(planAutomations(board([rule({})]), card('todo'), card('doing'), none)).toMatchObject({ firedIds: ['r1'], status: 'done' })
    expect(planAutomations(board([rule({ triggerValue: 'DOING', actionValue: 'done' })]), card('todo'), card('doing'), none)).toMatchObject({ firedIds: ['r1'], status: 'done' })
    expect(planAutomations(board([rule({})]), card('todo'), card('todo'), none).firedIds).toEqual([])
    expect(planAutomations(board([rule({})]), card('doing'), card('doing'), none).firedIds).toEqual([])
  })

  it('fires subtasks_done only on the transition to 100%', () => {
    const b = board([rule({ trigger: 'subtasks_done', triggerValue: undefined, action: 'set_progress', actionValue: undefined })])
    const none = new Set<string>()
    expect(planAutomations(b, card('todo', checklist([true, false])), card('todo', checklist([true, true])), none)).toMatchObject({ firedIds: ['r1'], progress: 100 })
    expect(planAutomations(b, null, card('todo', checklist([true])), none).firedIds).toEqual(['r1'])
    expect(planAutomations(b, card('todo', checklist([true, true])), card('todo', checklist([true, true])), none).firedIds).toEqual([])
  })

  it('skips disabled, deferred and already fired rules', () => {
    const none = new Set<string>()
    expect(planAutomations(board([rule({ enabled: false })]), card('todo'), card('doing'), none).firedIds).toEqual([])
    expect(planAutomations(board([rule({ action: 'notify' })]), card('todo'), card('doing'), none).firedIds).toEqual([])
    expect(planAutomations(board([rule({ trigger: 'due_date_near' })]), card('todo'), card('doing'), none).firedIds).toEqual([])
    expect(planAutomations(board([rule({})]), card('todo'), card('doing'), new Set(['r1'])).firedIds).toEqual([])
  })

  it('does not fire move_to into the column the card is already in', () => {
    expect(planAutomations(board([rule({ actionValue: 'doing' })]), card('todo'), card('doing'), new Set()).firedIds).toEqual([])
  })

  it('collects tags', () => {
    expect(planAutomations(board([rule({ action: 'add_tag', actionValue: ' urgent ' })]), card('todo'), card('doing'), new Set()))
      .toMatchObject({ firedIds: ['r1'], addTags: ['urgent'] })
  })

  it('skips actions that would change nothing', () => {
    const tagged = { ...card('doing'), fields: [{ id: 'f', name: 'Tags', type: 'multi_select', value: ['o'], options: [{ id: 'o', name: 'Urgent' }], order: 0 }] } as KanbanCard
    expect(planAutomations(board([rule({ action: 'add_tag', actionValue: 'urgent' })]), card('todo'), tagged, new Set()).firedIds).toEqual([])
    const full = { ...card('doing'), progress: 100 }
    expect(planAutomations(board([rule({ action: 'set_progress', actionValue: undefined })]), card('todo'), full, new Set()).firedIds).toEqual([])
  })
})

describe('applyTagsToFields', () => {
  const tags = (value: string[]): KanbanCardField => ({
    id: 'f', name: 'Tags', type: 'multi_select', value, order: 0, options: [{ id: 'o1', name: 'Urgent' }],
  })

  it('reuses an existing option by name', () => {
    const [field] = applyTagsToFields([tags([])], ['urgent'])
    expect(field.value).toEqual(['o1'])
    expect(field.options).toHaveLength(1)
    expect(applyTagsToFields([field], ['URGENT'])[0].value).toEqual(['o1'])
  })

  it('creates a new option', () => {
    const [field] = applyTagsToFields([tags(['o1'])], ['later'])
    expect(field.options?.map(o => o.name)).toEqual(['Urgent', 'later'])
    expect(field.value).toHaveLength(2)
  })

  it('creates the tags field when missing', () => {
    const fields = applyTagsToFields([], ['urgent'])
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'tags', type: 'multi_select', order: 0 })
    expect(fields[0].options?.[0].name).toBe('urgent')
  })
})

describe('weekly run count', () => {
  it('increments within a week and resets on a new one', () => {
    const a = rule({})
    const wed = new Date(2026, 10, 11)
    const first = bumpRunCount(a, wed)
    expect(first).toMatchObject({ runCount: 1, runWeek: '2026-11-09' })
    expect(bumpRunCount(first, new Date(2026, 10, 15)).runCount).toBe(2)
    expect(bumpRunCount(first, new Date(2026, 10, 16))).toMatchObject({ runCount: 1, runWeek: '2026-11-16' })
    expect(weeklyRunCount(first, wed)).toBe(1)
    expect(weeklyRunCount(first, new Date(2026, 10, 16))).toBe(0)
  })
})
