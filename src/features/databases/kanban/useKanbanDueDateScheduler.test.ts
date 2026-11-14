import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { DUE_DATE_PASS_INTERVAL_MS, useKanbanDueDateScheduler } from './useKanbanDueDateScheduler'

const kanban = vi.hoisted(() => ({ store: null as any }))
const workspace = vi.hoisted(() => ({ store: null as any }))
vi.mock('../../../stores/kanban', () => ({ useKanbanStore: () => kanban.store }))
vi.mock('../../../stores/workspace', () => ({ useWorkspaceStore: () => workspace.store }))
vi.mock('../../../utils/logger', () => ({ appLogger: { error: vi.fn(async () => undefined) } }))

const dueRule = { id: 'r', trigger: 'due_date_near', action: 'notify', enabled: true }
const boardWith = (id: string, automations: unknown[]) => [id, { id, automations }] as const

describe('useKanbanDueDateScheduler', () => {
  let enabled = ref(true)

  beforeEach(() => {
    vi.useFakeTimers()
    enabled = ref(true)
    workspace.store = reactive({ activePath: '/ws' })
    kanban.store = reactive({
      boards: new Map([boardWith('b1', [dueRule]), boardWith('b2', [{ ...dueRule, trigger: 'subtasks_done' }])]),
      cards: new Map<string, unknown[]>(),
      loadCards: vi.fn(async (id: string) => { kanban.store.cards.set(id, []); return true }),
      runDueDateAutomations: vi.fn(async () => undefined),
    })
  })
  afterEach(() => vi.useRealTimers())

  it('runs after boards load, only for boards with due-date rules, then on the interval', async () => {
    const scope = effectScope()
    scope.run(() => useKanbanDueDateScheduler(enabled))
    kanban.store.boards = new Map([boardWith('b1', [dueRule]), boardWith('b2', [])])
    await vi.advanceTimersByTimeAsync(0)
    expect(kanban.store.loadCards).toHaveBeenCalledTimes(1)
    expect(kanban.store.runDueDateAutomations).toHaveBeenCalledTimes(1)
    expect(kanban.store.runDueDateAutomations).toHaveBeenCalledWith('b1')

    await vi.advanceTimersByTimeAsync(DUE_DATE_PASS_INTERVAL_MS)
    expect(kanban.store.runDueDateAutomations).toHaveBeenCalledTimes(2)
    expect(kanban.store.loadCards).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('never overlaps passes', async () => {
    let release!: () => void
    kanban.store.runDueDateAutomations.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
    const scope = effectScope()
    scope.run(() => useKanbanDueDateScheduler(enabled))
    kanban.store.boards = new Map([boardWith('b1', [dueRule])])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(DUE_DATE_PASS_INTERVAL_MS)
    expect(kanban.store.runDueDateAutomations).toHaveBeenCalledTimes(1)
    release()
    await vi.advanceTimersByTimeAsync(DUE_DATE_PASS_INTERVAL_MS)
    expect(kanban.store.runDueDateAutomations).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('stops when disposed or disabled', async () => {
    const scope = effectScope()
    scope.run(() => useKanbanDueDateScheduler(enabled))
    enabled.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(DUE_DATE_PASS_INTERVAL_MS * 2)
    expect(kanban.store.runDueDateAutomations).not.toHaveBeenCalled()

    enabled.value = true
    await nextTick()
    scope.stop()
    await vi.advanceTimersByTimeAsync(DUE_DATE_PASS_INTERVAL_MS * 2)
    expect(kanban.store.runDueDateAutomations).not.toHaveBeenCalled()
  })
})
