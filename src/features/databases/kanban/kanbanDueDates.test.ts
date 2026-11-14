import { describe, expect, it } from 'vitest'
import type { KanbanAutomation, KanbanBoard, KanbanCard } from '../../../types/kanban'
import { cardDueDate, dueWindowDays, isDueNear, markFired, planDueDateAutomations, pruneFiredFor } from './kanbanDueDates'
import { planAutomations } from './kanbanAutomations'

const now = new Date(2026, 10, 14, 15, 30)

const rule = (patch: Partial<KanbanAutomation> = {}): KanbanAutomation =>
  ({ id: 'r1', trigger: 'due_date_near', triggerValue: '3', action: 'notify', enabled: true, ...patch })

const board = (automations: KanbanAutomation[]): KanbanBoard => ({
  id: 'b', title: 'B', icon: 'K', folderId: null, statusPropertyId: 'st', propertyDefinitions: [],
  automations, createdAt: 't', updatedAt: 't',
})

const card = (id: string, dates: Record<string, string> = {}): KanbanCard => ({
  id, boardId: 'b', title: id, content: { type: 'doc', content: [] }, properties: {}, columnOrder: 0, createdAt: 't', updatedAt: 't',
  fields: Object.entries(dates).map(([name, value], order) => ({ id: name, name, type: 'date', value, order })),
} as KanbanCard)

describe('due date window', () => {
  it('is inclusive from today to today + N and skips overdue dates', () => {
    expect(isDueNear('2026-11-14', now, 3)).toBe(true)
    expect(isDueNear('2026-11-17', now, 3)).toBe(true)
    expect(isDueNear('2026-11-18', now, 3)).toBe(false)
    expect(isDueNear('2026-11-13', now, 3)).toBe(false)
  })

  it('parses days with a default and bounds', () => {
    expect(dueWindowDays({})).toBe(3)
    expect(dueWindowDays({ triggerValue: '7' })).toBe(7)
    expect(dueWindowDays({ triggerValue: '0' })).toBe(3)
    expect(dueWindowDays({ triggerValue: '31' })).toBe(3)
  })

  it('reads the YYYY-MM-DD prefix of the first or named date field', () => {
    const c = card('c', { Start: '2026-11-01', Due: '2026-11-16T10:00:00Z' })
    expect(cardDueDate(c)).toBe('2026-11-01')
    expect(cardDueDate(c, ' due ')).toBe('2026-11-16')
    expect(cardDueDate(c, 'missing')).toBeNull()
    expect(cardDueDate(card('x'))).toBeNull()
  })
})

describe('planDueDateAutomations', () => {
  it('matches cards in the window and honours firedFor', () => {
    const cards = [card('a', { Due: '2026-11-15' }), card('b', { Due: '2026-11-30' }), card('c')]
    expect(planDueDateAutomations(board([rule()]), cards, now)).toMatchObject([{ cardId: 'a', ruleId: 'r1', dueDate: '2026-11-15', plan: { notify: true } }])
    expect(planDueDateAutomations(board([rule({ firedFor: { a: '2026-11-15' } })]), cards, now)).toEqual([])
    expect(planDueDateAutomations(board([rule({ firedFor: { a: '2026-11-14' } })]), cards, now)).toHaveLength(1)
  })

  it('uses the named date field and ignores disabled rules', () => {
    const cards = [card('a', { Start: '2026-11-15', Due: '2026-12-25' })]
    expect(planDueDateAutomations(board([rule({ dateField: 'due' })]), cards, now)).toEqual([])
    expect(planDueDateAutomations(board([rule({ dateField: 'start' })]), cards, now)).toHaveLength(1)
    expect(planDueDateAutomations(board([rule({ enabled: false })]), cards, now)).toEqual([])
  })

  it('is not event-driven', () => {
    expect(planAutomations(board([rule()]), card('a'), card('a', { Due: '2026-11-15' }), new Set()).firedIds).toEqual([])
  })

  it('plans notify for event triggers too', () => {
    const b = board([rule({ trigger: 'subtasks_done', triggerValue: undefined })])
    const checked = (v: boolean) => ({ ...card('a'), content: { type: 'doc', content: [{ type: 'checklist_item', attrs: { checked: v } }] } }) as KanbanCard
    expect(planAutomations(b, checked(false), checked(true), new Set())).toMatchObject({ firedIds: ['r1'], notify: true })
  })
})

describe('firedFor bookkeeping', () => {
  it('marks, re-arms on a new date and prunes deleted cards', () => {
    const live = new Set(['a', 'b'])
    const first = markFired(rule({ firedFor: { gone: '2026-11-01' } }), 'a', '2026-11-15', live)
    expect(first.firedFor).toEqual({ a: '2026-11-15' })
    expect(markFired(first, 'a', '2026-11-16', live).firedFor).toEqual({ a: '2026-11-16' })
    expect(pruneFiredFor(first, live)).toBe(first)
  })
})
