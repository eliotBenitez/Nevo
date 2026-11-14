import { onScopeDispose, watch, type Ref } from 'vue'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import { appLogger } from '../../../utils/logger'

export const DUE_DATE_PASS_INTERVAL_MS = 30 * 60 * 1000

// Due-date rules are time-driven, so while a workspace is open we re-check them
// after each board load and then periodically.
export function useKanbanDueDateScheduler(enabled: Readonly<Ref<boolean>>) {
  const kanbanStore = useKanbanStore()
  const workspaceStore = useWorkspaceStore()
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false

  async function runPass() {
    const workspacePath = workspaceStore.activePath
    if (running || !enabled.value || !workspacePath) return
    running = true
    try {
      for (const board of [...kanbanStore.boards.values()]) {
        if (workspaceStore.activePath !== workspacePath) break
        if (!board.automations?.some(a => a.enabled && a.trigger === 'due_date_near')) continue
        if (!kanbanStore.cards.has(board.id) && !await kanbanStore.loadCards(board.id)) continue
        await kanbanStore.runDueDateAutomations(board.id)
      }
    } catch (error) {
      await appLogger.error({ source: 'frontend.kanban', event: 'due_date_pass', message: 'Due date automation pass failed', error })
    } finally {
      running = false
    }
  }

  function stop() {
    clearInterval(timer)
    timer = undefined
  }

  watch(
    () => [enabled.value, workspaceStore.activePath] as const,
    ([on, path]) => {
      stop()
      if (on && path) timer = setInterval(() => { void runPass() }, DUE_DATE_PASS_INTERVAL_MS)
    },
    { immediate: true },
  )
  // loadBoards replaces the Map, so this fires right after boards load (also on workspace change).
  watch(() => kanbanStore.boards, () => { void runPass() })

  onScopeDispose(stop)
}
