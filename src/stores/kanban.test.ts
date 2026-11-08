import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKanbanStore } from './kanban'
import type { KanbanBoard, KanbanCard } from '../types/kanban'

const backend = vi.hoisted(() => ({
  kanbanListBoards: vi.fn(),
  kanbanListCards: vi.fn(),
  kanbanUpdateBoard: vi.fn(),
}))
vi.mock('./workspace', () => ({ useWorkspaceStore: () => ({ backend }) }))

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
