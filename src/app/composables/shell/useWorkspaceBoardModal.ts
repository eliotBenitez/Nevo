import { reactive, type Ref } from 'vue'

export interface UseWorkspaceBoardModalOptions {
  mobileSidebarOpen: Ref<boolean>
  openBoard: (boardId: string) => void
}

// State of the kanban board create/rename/delete dialog and the actions that open it.
export function useWorkspaceBoardModal({ mobileSidebarOpen, openBoard }: UseWorkspaceBoardModalOptions) {
  const boardModal = reactive<{
    open: boolean
    mode: 'create' | 'rename' | 'delete'
    boardId?: string
    boardTitle?: string
    boardIcon?: string
  }>({ open: false, mode: 'create' })

  function createBoard() {
    mobileSidebarOpen.value = false
    boardModal.mode = 'create'
    boardModal.boardId = undefined
    boardModal.open = true
  }
  function onBoardCreated(boardId: string) {
    boardModal.open = false
    openBoard(boardId)
  }
  function onBoardAction(payload: { action: 'rename' | 'delete'; boardId: string; boardTitle: string; boardIcon: string }) {
    boardModal.mode = payload.action
    boardModal.boardId = payload.boardId
    boardModal.boardTitle = payload.boardTitle
    boardModal.boardIcon = payload.boardIcon
    boardModal.open = true
  }

  return { boardModal, createBoard, onBoardCreated, onBoardAction }
}
