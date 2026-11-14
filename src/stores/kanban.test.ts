import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKanbanStore } from './kanban'
import type { KanbanAutomation, KanbanBoard, KanbanCard } from '../types/kanban'

const backend = vi.hoisted(() => ({
  kanbanListBoards: vi.fn(),
  kanbanListCards: vi.fn(),
  kanbanUpdateBoard: vi.fn(),
  kanbanMoveCard: vi.fn(),
  kanbanUpdateCard: vi.fn(),
}))
vi.mock('./workspace', () => ({ useWorkspaceStore: () => ({ backend }) }))
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
    expect(store.boardsError).toBe('read-only')
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
})
