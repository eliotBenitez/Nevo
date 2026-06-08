// Cloud kanban state: all boards + their cards stored as one atomically-replaced
// value in the manifest Yjs doc's `kanban` map (LWW, mirrors the manifest tree).

import type {
  KanbanBoard, KanbanCard, KanbanPropertyDef,
} from '../../../types/kanban'
import type { BlockNode } from '../../../types/note'
import type { KanbanBoardUpdate, KanbanCardUpdate } from '../types'
import { createKanbanId } from '../../../features/databases/kanban/kanbanFields'

export interface KanbanState {
  boards: KanbanBoard[]
  cards: Record<string, KanbanCard[]>
}

export function emptyKanbanState(): KanbanState {
  return { boards: [], cards: {} }
}

const EMPTY_DOC: BlockNode = { type: 'doc', content: [{ type: 'paragraph' }] }

export function defaultBoard(title: string, icon: string, folderId: string | null): KanbanBoard {
  const statusId = createKanbanId()
  const now = new Date().toISOString()
  return {
    id: createKanbanId(),
    title,
    icon,
    folderId,
    statusPropertyId: statusId,
    propertyDefinitions: [{
      id: statusId,
      name: 'Status',
      type: 'select',
      order: 0,
      options: [
        { id: createKanbanId(), name: 'To Do' },
        { id: createKanbanId(), name: 'In Progress' },
        { id: createKanbanId(), name: 'Done' },
      ],
    }],
    createdAt: now,
    updatedAt: now,
  }
}

export function defaultCard(boardId: string, title: string, columnValue: string, statusPropertyId: string, columnOrder: number): KanbanCard {
  const now = new Date().toISOString()
  return {
    id: createKanbanId(),
    boardId,
    title,
    content: structuredClone(EMPTY_DOC),
    properties: { [statusPropertyId]: columnValue },
    fields: [],
    columnOrder,
    createdAt: now,
    updatedAt: now,
  }
}

export function findBoard(state: KanbanState, boardId: string): KanbanBoard | undefined {
  return state.boards.find(b => b.id === boardId)
}

export function patchBoard(state: KanbanState, boardId: string, updates: KanbanBoardUpdate): KanbanBoard | null {
  const board = findBoard(state, boardId)
  if (!board) return null
  Object.assign(board, updates, { updatedAt: new Date().toISOString() })
  return board
}

export function removeBoard(state: KanbanState, boardId: string): void {
  state.boards = state.boards.filter(b => b.id !== boardId)
  delete state.cards[boardId]
}

export function saveSchema(state: KanbanState, boardId: string, propertyDefinitions: KanbanPropertyDef[], columnRemap: Record<string, string>): KanbanBoard | null {
  const board = findBoard(state, boardId)
  if (!board) return null
  board.propertyDefinitions = propertyDefinitions
  // Apply any column id remap to the cards' status values.
  if (Object.keys(columnRemap).length) {
    const list = state.cards[boardId] ?? []
    for (const card of list) {
      const cur = card.properties[board.statusPropertyId]
      if (typeof cur === 'string' && columnRemap[cur]) {
        card.properties[board.statusPropertyId] = columnRemap[cur]
      }
    }
  }
  board.updatedAt = new Date().toISOString()
  return board
}

export function patchCard(state: KanbanState, boardId: string, cardId: string, updates: KanbanCardUpdate): KanbanCard | null {
  const list = state.cards[boardId] ?? []
  const card = list.find(c => c.id === cardId)
  if (!card) return null
  Object.assign(card, updates, { updatedAt: new Date().toISOString() })
  return card
}

export function removeCard(state: KanbanState, boardId: string, cardId: string): void {
  state.cards[boardId] = (state.cards[boardId] ?? []).filter(c => c.id !== cardId)
}

export function moveCard(state: KanbanState, boardId: string, cardId: string, toColumnOptionId: string, targetIndex: number): KanbanCard[] {
  const board = findBoard(state, boardId)
  const list = state.cards[boardId] ?? []
  const card = list.find(c => c.id === cardId)
  if (board && card) {
    card.properties[board.statusPropertyId] = toColumnOptionId
    card.columnOrder = targetIndex
    card.updatedAt = new Date().toISOString()
  }
  return list
}
