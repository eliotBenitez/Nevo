import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { KanbanBoard, KanbanCard, KanbanPropertyDef, KanbanAutomation, KanbanLink, KanbanPropertyOption, KanbanCardField, KanbanBoardCardViewSettings } from '../types/kanban'
import { useWorkspaceStore } from './workspace'
import { getBoardColumns, getCardStatusValue, normalizeBoard, normalizeCard, normalizeViewSettings, serializeCardProperties } from '../features/databases/kanban/kanbanFields'

export const useKanbanStore = defineStore('kanban', () => {
  const workspaceStore = useWorkspaceStore()

  const boards = ref<Map<string, KanbanBoard>>(new Map())
  const cards = ref<Map<string, KanbanCard[]>>(new Map())
  const activeBoardId = ref<string | null>(null)
  const activeCardId = ref<string | null>(null)
  const isLoading = ref(false)
  const boardsError = ref<string | null>(null)
  const cardsError = ref<string | null>(null)
  const moveError = ref<string | null>(null)
  const cardsSaving = ref(false)

  const boardsList = computed(() => Array.from(boards.value.values()))
  const activeBoard = computed(() => activeBoardId.value ? boards.value.get(activeBoardId.value) ?? null : null)
  const activeCard = computed(() => {
    if (!activeCardId.value || !activeBoardId.value) return null
    return cards.value.get(activeBoardId.value)?.find(c => c.id === activeCardId.value) ?? null
  })

  function getPropertyDefinitions(board: Pick<KanbanBoard, 'propertyDefinitions'> | null | undefined): KanbanPropertyDef[] {
    return Array.isArray(board?.propertyDefinitions)
      ? board.propertyDefinitions.filter((property): property is KanbanPropertyDef =>
        !!property && typeof property.id === 'string' && typeof property.type === 'string')
      : []
  }

  function columnsForBoard(board: KanbanBoard): KanbanPropertyOption[] {
    return getBoardColumns(board)
  }

  function cardsForColumn(boardId: string, columnOptionId: string, statusPropertyId: string) {
    if (!statusPropertyId) return []
    const boardCards = cards.value.get(boardId) ?? []
    return boardCards
      .filter((card) => {
        return getCardStatusValue(card, { statusPropertyId }) === columnOptionId
      })
      .sort((a, b) => a.columnOrder - b.columnOrder)
  }

  async function loadBoards() {
    const backend = workspaceStore.backend
    boardsError.value = null
    if (!backend) {
      boards.value = new Map()
      return false
    }
    isLoading.value = true
    try {
      const list = await backend.kanbanListBoards()
      boards.value = new Map(list.map(b => {
        const board = normalizeBoard(b)
        return [board.id, board]
      }))
      return true
    } catch (error) {
      boardsError.value = formatKanbanError(error, 'Failed to load boards.')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function createBoard(title: string, icon = '🗂️', folderId: string | null = null) {
    const backend = workspaceStore.backend
    if (!backend) return null
    const board = await backend.kanbanCreateBoard(title, icon, folderId)
    const normalized = normalizeBoard(board)
    boards.value.set(normalized.id, normalized)
    return normalized
  }

  async function updateBoard(boardId: string, updates: { title?: string; icon?: string; viewSettings?: KanbanBoard['viewSettings'] }) {
    const backend = workspaceStore.backend
    if (!backend) return
    const board = await backend.kanbanUpdateBoard(boardId, updates)
    boards.value.set(board.id, normalizeBoard(board))
  }

  async function updateBoardViewSettings(boardId: string, nextBoardSettings: KanbanBoardCardViewSettings) {
    const current = boards.value.get(boardId)
    if (!current) return

    const nextViewSettings = normalizeViewSettings({
      ...current.viewSettings,
      board: {
        ...current.viewSettings?.board,
        ...nextBoardSettings,
      },
    })

    boards.value.set(boardId, {
      ...current,
      viewSettings: nextViewSettings,
    })

    await updateBoard(boardId, { viewSettings: nextViewSettings })
  }

  async function saveSchema(
    boardId: string,
    propertyDefinitions: KanbanPropertyDef[],
    columnRemap: Record<string, string> = {},
  ) {
    const backend = workspaceStore.backend
    if (!backend) return
    const board = await backend.kanbanSaveSchema(boardId, propertyDefinitions, columnRemap)
    boards.value.set(board.id, normalizeBoard(board))
    // Reload cards — migration may have changed column assignments
    await loadCards(boardId)
  }

  async function updateBoardColumns(
    boardId: string,
    columns: KanbanPropertyOption[],
    columnRemap: Record<string, string> = {},
  ) {
    const board = boards.value.get(boardId)
    if (!board) return
    const statusProp = getPropertyDefinitions(board).find(property => property.id === board.statusPropertyId)
    if (!statusProp) return
    await saveSchema(boardId, [
      {
        ...statusProp,
        options: columns,
      },
    ], columnRemap)
  }

  async function deleteBoard(boardId: string) {
    const backend = workspaceStore.backend
    if (!backend) return
    await backend.kanbanDeleteBoard(boardId)
    boards.value.delete(boardId)
    cards.value.delete(boardId)
    if (activeBoardId.value === boardId) {
      activeBoardId.value = null
      activeCardId.value = null
    }
  }

  async function loadCards(boardId: string) {
    const backend = workspaceStore.backend
    cardsError.value = null
    if (!backend) {
      cards.value.delete(boardId)
      return false
    }
    try {
      const board = boards.value.get(boardId)
      const list = await backend.kanbanListCards(boardId)
      cards.value.set(boardId, board ? list.map(card => normalizeCard(board, card)) : list)
      return true
    } catch (error) {
      cardsError.value = formatKanbanError(error, 'Failed to load cards.')
      return false
    }
  }

  async function createCard(boardId: string, title: string, columnOptionId: string) {
    const backend = workspaceStore.backend
    if (!backend) return null
    const board = boards.value.get(boardId)
    if (!board) return null
    const existing = cardsForColumn(boardId, columnOptionId, board.statusPropertyId)
    const order = existing.length
    const card = await backend.kanbanCreateCard(boardId, title, columnOptionId, board.statusPropertyId, order)
    const current = cards.value.get(boardId) ?? []
    cards.value.set(boardId, [...current, normalizeCard(board, card)])
    return card
  }

  async function updateCard(boardId: string, cardId: string, updates: {
    title?: string
    icon?: string
    content?: unknown
    properties?: Record<string, unknown>
    fields?: KanbanCardField[]
    columnOrder?: number
    progress?: number
    priority?: string
  }) {
    const backend = workspaceStore.backend
    if (!backend) return
    const board = boards.value.get(boardId)
    cardsSaving.value = true
    try {
      const card = await backend.kanbanUpdateCard(boardId, cardId, updates)
      const current = cards.value.get(boardId) ?? []
      const nextCard = board ? normalizeCard(board, card) : card
      cards.value.set(boardId, current.map(c => c.id === cardId ? nextCard : c))
    } finally {
      cardsSaving.value = false
    }
  }

  async function moveCard(boardId: string, cardId: string, newColumnOptionId: string, targetIndex: number) {
    const board = boards.value.get(boardId)
    const backend = workspaceStore.backend
    if (!board || !backend) return

    // Optimistic update for immediate visual feedback
    const prevCards = cards.value.get(boardId) ?? []
    const optimistic = prevCards.map(c => {
      if (c.id !== cardId) return c
      return {
        ...c,
        properties: serializeCardProperties(board, c, c.fields, newColumnOptionId),
        columnOrder: targetIndex,
      }
    })
    cards.value.set(boardId, optimistic)
    moveError.value = null

    try {
      const result = await backend.kanbanMoveCard(boardId, cardId, newColumnOptionId, targetIndex)
      cards.value.set(boardId, result)
    } catch (err) {
      // Rollback on failure
      cards.value.set(boardId, prevCards)
      moveError.value = String(err)
    }
  }

  async function deleteCard(boardId: string, cardId: string) {
    const backend = workspaceStore.backend
    if (!backend) return
    await backend.kanbanDeleteCard(boardId, cardId)
    const current = cards.value.get(boardId) ?? []
    cards.value.set(boardId, current.filter(c => c.id !== cardId))
    if (activeCardId.value === cardId) activeCardId.value = null
  }

  function openCard(cardId: string) {
    activeCardId.value = cardId
  }

  function closeCard() {
    activeCardId.value = null
  }

  function setWipCap(boardId: string, columnId: string, cap: number | null) {
    const board = boards.value.get(boardId)
    if (!board) return
    const wip = { ...(board.wip ?? {}) }
    if (cap === null) { delete wip[columnId] } else { wip[columnId] = cap }
    boards.value.set(boardId, { ...board, wip })
  }

  function addAutomation(boardId: string, automation: KanbanAutomation) {
    const board = boards.value.get(boardId)
    if (!board) return
    boards.value.set(boardId, { ...board, automations: [...(board.automations ?? []), automation] })
  }

  function updateAutomation(boardId: string, automationId: string, patch: Partial<KanbanAutomation>) {
    const board = boards.value.get(boardId)
    if (!board) return
    boards.value.set(boardId, {
      ...board,
      automations: (board.automations ?? []).map(a => a.id === automationId ? { ...a, ...patch } : a),
    })
  }

  function deleteAutomation(boardId: string, automationId: string) {
    const board = boards.value.get(boardId)
    if (!board) return
    boards.value.set(boardId, { ...board, automations: (board.automations ?? []).filter(a => a.id !== automationId) })
  }

  function linkCards(boardId: string, cardId: string, targetId: string, kind: KanbanLink['kind']) {
    const boardCards = cards.value.get(boardId)
    if (!boardCards) return
    cards.value.set(boardId, boardCards.map(c => {
      if (c.id !== cardId) return c
      const existing = c.links ?? []
      if (existing.some(l => l.cardId === targetId && l.kind === kind)) return c
      return { ...c, links: [...existing, { cardId: targetId, kind }] }
    }))
  }

  function unlinkCards(boardId: string, cardId: string, targetId: string, kind: KanbanLink['kind']) {
    const boardCards = cards.value.get(boardId)
    if (!boardCards) return
    cards.value.set(boardId, boardCards.map(c => {
      if (c.id !== cardId) return c
      return { ...c, links: (c.links ?? []).filter(l => !(l.cardId === targetId && l.kind === kind)) }
    }))
  }

  return {
    boards, cards, activeBoardId, activeCardId, isLoading, boardsError, cardsError, moveError, cardsSaving,
    boardsList, activeBoard, activeCard,
    columnsForBoard, cardsForColumn,
    loadBoards, createBoard, updateBoard, updateBoardViewSettings, saveSchema, updateBoardColumns, deleteBoard,
    loadCards, createCard, updateCard, moveCard, deleteCard,
    openCard, closeCard,
    setWipCap, addAutomation, updateAutomation, deleteAutomation, linkCards, unlinkCards,
  }
})

function formatKanbanError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallbackMessage
}
