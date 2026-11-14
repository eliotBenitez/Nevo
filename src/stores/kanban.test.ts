import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKanbanStore } from './kanban'
import type { KanbanAutomation, KanbanBoard, KanbanCard, KanbanTemplate } from '../types/kanban'

const backend = vi.hoisted(() => ({
  kanbanListBoards: vi.fn(),
  kanbanListCards: vi.fn(),
  kanbanUpdateBoard: vi.fn(),
  kanbanMoveCard: vi.fn(),
  kanbanUpdateCard: vi.fn(),
  kanbanCreateCard: vi.fn(),
}))
vi.mock('./workspace', () => ({ useWorkspaceStore: () => ({ backend }) }))
const notifications = vi.hoisted(() => ({ sendSystemNotification: vi.fn(async () => true) }))
vi.mock('../tauri/notifications', () => notifications)
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn(async () => undefined) } }))

function board(id: string, extra: Partial<KanbanBoard> = {}): KanbanBoard {
  return {
    id, title: id, icon: 'K', folderId: null, statusPropertyId: 'st', propertyDefinitions: [],
    createdAt: 't', updatedAt: 't', ...extra,
  } as KanbanBoard
}

describe('kanban store wip caps and automations', () => {
  const rule = { id: 'a1', trigger: 'status_change', action: 'notify', enabled: true } as const

  beforeEach(() => {
    setActivePinia(createPinia())
    backend.kanbanUpdateBoard.mockReset()
  })

  it('persists wip caps and automations through kanbanUpdateBoard', async () => {
    const store = useKanbanStore()
    store.boards = new Map([['b1', board('b1', { wip: { todo: 3 } })]])
    backend.kanbanUpdateBoard.mockImplementation(async (id: string, updates: Partial<KanbanBoard>) =>
      ({ ...store.boards.get(id)!, ...updates, updatedAt: 'saved' }))

    await store.setWipCap('b1', 'doing', 2)
    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { wip: { todo: 3, doing: 2 } })
    await store.setWipCap('b1', 'todo', null)
    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { wip: { doing: 2 } })

    await store.addAutomation('b1', rule)
    await store.updateAutomation('b1', 'a1', { enabled: false })
    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { automations: [{ ...rule, enabled: false }] })
    await store.deleteAutomation('b1', 'a1')
    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { automations: [] })

    expect(store.boards.get('b1')).toMatchObject({ wip: { doing: 2 }, automations: [], updatedAt: 'saved' })
  })

  it('a failed save does not roll back a later queued change that carries it', async () => {
    const store = useKanbanStore()
    store.boards = new Map([['b1', board('b1', { wip: {} })]])
    backend.kanbanUpdateBoard
      .mockRejectedValueOnce(new Error('busy'))
      .mockImplementationOnce(async (id: string, updates: Partial<KanbanBoard>) => ({ ...store.boards.get(id)!, ...updates }))

    const first = store.setWipCap('b1', 'todo', 1)
    const second = store.setWipCap('b1', 'doing', 2)
    await Promise.all([first, second])

    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { wip: { todo: 1, doing: 2 } })
    expect(store.boards.get('b1')?.wip).toEqual({ todo: 1, doing: 2 })
  })

  it('applies the change optimistically and rolls it back when saving fails', async () => {
    const store = useKanbanStore()
    store.boards = new Map([['b1', board('b1', { wip: { todo: 3 }, automations: [rule] })]])
    let reject!: (error: Error) => void
    backend.kanbanUpdateBoard.mockReturnValue(new Promise((_, r) => { reject = r }))

    const pending = store.setWipCap('b1', 'todo', 1)
    expect(store.boards.get('b1')?.wip).toEqual({ todo: 1 })
    reject(new Error('read-only'))
    await pending

    expect(store.boards.get('b1')).toMatchObject({ wip: { todo: 3 }, automations: [rule] })
    expect(store.boardSaveError).toBe('read-only')
    expect(store.boardsError).toBeNull()
  })
})

describe('kanban store automations execution', () => {
  const statuses = { statusPropertyId: 'st', propertyDefinitions: [{ id: 'st', name: 'Status', type: 'select', order: 0, options: [
    { id: 'todo', name: 'To Do' }, { id: 'doing', name: 'Doing' }, { id: 'done', name: 'Done' },
  ] }] } as Partial<KanbanBoard>
  const moveRule = (id: string, from: string, to: string): KanbanAutomation =>
    ({ id, trigger: 'status_change', triggerValue: from, action: 'move_to', actionValue: to, enabled: true })

  let server: KanbanCard[]

  function setup(automations: KanbanAutomation[]) {
    const store = useKanbanStore()
    store.boards = new Map([['b1', board('b1', { ...statuses, automations })]])
    server = [{ id: 'c1', boardId: 'b1', title: 'C', content: { type: 'doc', content: [] }, properties: { st: 'todo' }, fields: [], columnOrder: 0, createdAt: 't', updatedAt: 't' } as KanbanCard]
    store.cards = new Map([['b1', server]])
    backend.kanbanMoveCard.mockImplementation(async (_b: string, id: string, to: string, index: number) => {
      server = server.map(c => c.id === id ? { ...c, properties: { ...c.properties, st: to }, columnOrder: index } : c)
      return server
    })
    backend.kanbanUpdateCard.mockImplementation(async (_b: string, id: string, updates: Partial<KanbanCard>) => {
      server = server.map(c => c.id === id ? { ...c, ...updates } : c)
      return server.find(c => c.id === id)
    })
    backend.kanbanUpdateBoard.mockImplementation(async (id: string, updates: Partial<KanbanBoard>) => ({ ...store.boards.get(id)!, ...updates }))
    return store
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    backend.kanbanUpdateBoard.mockReset()
    backend.kanbanMoveCard.mockReset()
    backend.kanbanUpdateCard.mockReset()
    notifications.sendSystemNotification.mockReset()
    notifications.sendSystemNotification.mockResolvedValue(true)
  })

  it('runs move_to and add_tag after a card enters a column and persists the run count', async () => {
    const store = setup([
      moveRule('a1', 'doing', 'done'),
      { id: 'a2', trigger: 'status_change', triggerValue: 'doing', action: 'add_tag', actionValue: 'hot', enabled: true },
    ])
    await store.moveCard('b1', 'c1', 'doing', 0)

    const result = store.cards.get('b1')![0]
    expect(result.properties.st).toBe('done')
    expect(result.fields[0]).toMatchObject({ name: 'tags', type: 'multi_select' })
    const saved = store.boards.get('b1')!.automations!
    expect(saved.map(a => a.runCount)).toEqual([1, 1])
    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { automations: saved })
  })

  it('stops a cyclic pair of rules after each fired once', async () => {
    const store = setup([moveRule('a', 'doing', 'todo'), moveRule('b', 'todo', 'doing')])
    await store.moveCard('b1', 'c1', 'doing', 0)

    expect(backend.kanbanMoveCard).toHaveBeenCalledTimes(3) // the user's move + each rule once
    expect(store.boards.get('b1')!.automations!.map(a => a.runCount)).toEqual([1, 1])
  })

  it('keeps the move when an automation write fails', async () => {
    const store = setup([moveRule('a1', 'doing', 'done')])
    backend.kanbanMoveCard
      .mockImplementationOnce(async (_b: string, id: string, to: string) => {
        server = server.map(c => c.id === id ? { ...c, properties: { st: to } } : c)
        return server
      })
      .mockRejectedValueOnce(new Error('disk full'))
    await store.moveCard('b1', 'c1', 'doing', 0)

    expect(store.cards.get('b1')![0].properties.st).toBe('doing')
    expect(store.moveError).toBeNull()
  })

  describe('due date rules', () => {
    const now = new Date(2026, 10, 14, 12)
    const dueRule = (patch: Partial<KanbanAutomation> = {}): KanbanAutomation =>
      ({ id: 'd1', trigger: 'due_date_near', triggerValue: '3', action: 'add_tag', actionValue: 'soon', enabled: true, ...patch })
    const withDue = (store: ReturnType<typeof useKanbanStore>, due: string) => {
      server = server.map(c => ({ ...c, fields: [{ id: 'f', name: 'Due', type: 'date', value: due, order: 0 }] }))
      store.cards = new Map([['b1', server]])
    }

    it('tags the card and persists firedFor plus runCount in one board write', async () => {
      const store = setup([dueRule()])
      withDue(store, '2026-11-15')
      await store.runDueDateAutomations('b1', now)

      expect(backend.kanbanUpdateCard).toHaveBeenCalledTimes(1)
      expect(backend.kanbanUpdateBoard).toHaveBeenCalledTimes(1)
      expect(store.boards.get('b1')!.automations![0]).toMatchObject({ firedFor: { c1: '2026-11-15' }, runCount: 1 })

      await store.runDueDateAutomations('b1', now)
      expect(backend.kanbanUpdateCard).toHaveBeenCalledTimes(1)
      expect(backend.kanbanUpdateBoard).toHaveBeenCalledTimes(1)
    })

    it('notifies after the card writes and survives a failing notification', async () => {
      const store = setup([dueRule(), dueRule({ id: 'd2', action: 'notify', actionValue: undefined })])
      withDue(store, '2026-11-15')
      notifications.sendSystemNotification.mockRejectedValueOnce(new Error('denied'))
      await store.runDueDateAutomations('b1', now)

      expect(backend.kanbanUpdateCard).toHaveBeenCalledTimes(1)
      expect(notifications.sendSystemNotification).toHaveBeenCalledTimes(1)
      expect(notifications.sendSystemNotification.mock.calls[0]).toEqual(['b1', expect.stringContaining('C')])
      expect(store.boards.get('b1')!.automations!.map(a => a.firedFor)).toEqual([{ c1: '2026-11-15' }, { c1: '2026-11-15' }])
    })

    it('checks due dates right after a card edit changes its fields', async () => {
      const store = setup([dueRule({ action: 'notify', actionValue: undefined })])
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const pad = (n: number) => String(n).padStart(2, '0')
      const due = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`
      await store.updateCard('b1', 'c1', { fields: [{ id: 'f', name: 'Due', type: 'date', value: due, order: 0 }] })

      expect(notifications.sendSystemNotification).toHaveBeenCalledTimes(1)
      expect(store.boards.get('b1')!.automations![0].firedFor).toEqual({ c1: due })
    })

    it('fires once when passes overlap or the firedFor save fails', async () => {
      const store = setup([dueRule({ action: 'notify', actionValue: undefined })])
      withDue(store, '2026-11-15')
      backend.kanbanUpdateBoard.mockRejectedValue(new Error('read-only'))

      await Promise.all([store.runDueDateAutomations('b1', now), store.runDueDateAutomations('b1', now)])
      await store.runDueDateAutomations('b1', now)

      expect(notifications.sendSystemNotification).toHaveBeenCalledTimes(1)
    })

    it('skips the due date pass after a card edit that keeps its due date', async () => {
      const store = setup([dueRule({ action: 'notify', actionValue: undefined })])
      withDue(store, '2026-11-15')
      await store.updateCard('b1', 'c1', { title: 'Renamed', fields: server[0].fields })

      expect(notifications.sendSystemNotification).not.toHaveBeenCalled()
    })

    it('notifies from event triggers and prunes deleted cards', async () => {
      const store = setup([
        { id: 'n1', trigger: 'status_change', triggerValue: 'doing', action: 'notify', enabled: true },
        dueRule({ firedFor: { gone: '2026-11-01' } }),
      ])
      await store.moveCard('b1', 'c1', 'doing', 0)
      expect(notifications.sendSystemNotification).toHaveBeenCalledTimes(1)

      await store.runDueDateAutomations('b1', now)
      expect(store.boards.get('b1')!.automations![1].firedFor).toEqual({})
    })
  })
})

describe('kanban store templates', () => {
  const template = {
    id: 't1', name: 'Bug', icon: 'B',
    card: { priority: 'high', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
  } as KanbanTemplate

  beforeEach(() => {
    setActivePinia(createPinia())
    backend.kanbanUpdateBoard.mockReset()
    backend.kanbanUpdateCard.mockReset()
    backend.kanbanCreateCard.mockReset()
  })

  it('persists added and deleted templates', async () => {
    const store = useKanbanStore()
    store.boards = new Map([['b1', board('b1')]])
    backend.kanbanUpdateBoard.mockImplementation(async (id: string, updates: Partial<KanbanBoard>) => ({ ...store.boards.get(id)!, ...updates }))

    await store.addTemplate('b1', template)
    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { templates: [template] })
    await store.deleteTemplate('b1', 't1')
    expect(backend.kanbanUpdateBoard).toHaveBeenLastCalledWith('b1', { templates: [] })
    expect(store.boards.get('b1')?.templates).toEqual([])
  })

  it('creates a card and applies the template snapshot through kanbanUpdateCard', async () => {
    const store = useKanbanStore()
    store.boards = new Map([['b1', board('b1', { templates: [template] })]])
    const created = { id: 'c1', boardId: 'b1', title: 'New', content: { type: 'doc', content: [] }, properties: { st: 'todo' }, fields: [], columnOrder: 0, createdAt: 't', updatedAt: 't' }
    backend.kanbanCreateCard.mockResolvedValue(created)
    backend.kanbanUpdateCard.mockImplementation(async (_b: string, _c: string, updates: object) => ({ ...created, ...updates }))

    const card = await store.createCardFromTemplate('b1', 'New', 'todo', 't1')

    expect(backend.kanbanUpdateCard).toHaveBeenCalledWith('b1', 'c1', { content: template.card!.content, priority: 'high' })
    expect(card).toMatchObject({ id: 'c1', priority: 'high' })
  })
})
