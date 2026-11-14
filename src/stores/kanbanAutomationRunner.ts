import type { Ref } from 'vue'
import type { KanbanBoard, KanbanCard } from '../types/kanban'
import type { KanbanBoardUpdate } from '../core/workspace-backend/types'
import type { WorkspaceBackend } from '../core/workspace-backend'
import { cloneCardFields, getCardStatusValue, normalizeCard, serializeCardProperties } from '../features/databases/kanban/kanbanFields'
import { applyTagsToFields, bumpRunCount, planAutomations, type AutomationPlan } from '../features/databases/kanban/kanbanAutomations'
import { markFired, planDueDateAutomations, pruneFiredFor } from '../features/databases/kanban/kanbanDueDates'
import { formatAutomationTrigger } from '../features/databases/kanban/kanbanAutomationLabels'
import { i18n } from '../i18n'
import { sendSystemNotification } from '../tauri/notifications'
import { appLogger } from '../utils/logger'

export interface AutomationRunnerDeps {
  getBackend: () => WorkspaceBackend | null
  boards: Ref<Map<string, KanbanBoard>>
  cards: Ref<Map<string, KanbanCard[]>>
  persistBoardMeta: (boardId: string, patch: (board: KanbanBoard) => Pick<KanbanBoardUpdate, 'wip' | 'automations'>) => Promise<void>
  touchBoardUpdatedAt: (boardId: string) => void
}

const MAX_CHAIN_STEPS = 3

// Executes board automation rules. Writes go straight to the backend so a rule's own
// changes never re-trigger rules; the user's change that started a run is already saved.
export function createAutomationRunner({ getBackend, boards, cards, persistBoardMeta, touchBoardUpdatedAt }: AutomationRunnerDeps) {
  async function logFailure(event: string, message: string, error: unknown) {
    await appLogger.error({ source: 'frontend.kanban', event, message, error })
  }

  async function notifyForPlan(board: KanbanBoard, card: KanbanCard, plan: AutomationPlan) {
    if (!plan.notify) return
    const translate = i18n.global.t as (key: string, params?: Record<string, unknown>) => string
    for (const automation of board.automations ?? []) {
      if (automation.action !== 'notify' || !plan.firedIds.includes(automation.id)) continue
      try {
        await sendSystemNotification(board.title, `${card.title} · ${formatAutomationTrigger(board, automation, translate)}`)
      } catch (error) {
        await logFailure('notify_automation', 'Failed to send an automation notification', error)
      }
    }
  }

  async function applyPlan(boardId: string, board: KanbanBoard, card: KanbanCard, plan: AutomationPlan): Promise<KanbanCard> {
    const backend = getBackend()
    if (!backend) return card
    let next = card
    let wrote = false
    if (plan.status !== undefined) {
      const index = (cards.value.get(boardId) ?? [])
        .filter(c => c.id !== card.id && getCardStatusValue(c, board) === plan.status).length
      const result = await backend.kanbanMoveCard(boardId, card.id, plan.status, index)
      cards.value.set(boardId, result)
      next = result.find(c => c.id === card.id) ?? card
      wrote = true
    }
    if (plan.addTags.length || plan.progress !== undefined) {
      const fields = applyTagsToFields(cloneCardFields(next), plan.addTags)
      const saved = await backend.kanbanUpdateCard(boardId, card.id, {
        fields,
        properties: serializeCardProperties(board, next, fields, getCardStatusValue(next, board)),
        progress: plan.progress,
      })
      next = normalizeCard(board, saved)
      cards.value.set(boardId, (cards.value.get(boardId) ?? []).map(c => c.id === card.id ? next : c))
      wrote = true
    }
    if (wrote) touchBoardUpdatedAt(boardId)
    await notifyForPlan(board, next, plan)
    return next
  }

  async function runAutomations(boardId: string, before: KanbanCard, after: KanbanCard) {
    const board = boards.value.get(boardId)
    if (!board?.automations?.some(a => a.enabled)) return
    const fired = new Set<string>()
    const applied = new Set<string>()
    try {
      let previous = before
      let current = after
      for (let step = 0; step < MAX_CHAIN_STEPS; step++) {
        const plan = planAutomations(board, previous, current, fired)
        if (!plan.firedIds.length) break
        plan.firedIds.forEach(id => fired.add(id))
        const next = await applyPlan(boardId, board, current, plan)
        plan.firedIds.forEach(id => applied.add(id))
        previous = current
        current = next
      }
    } catch (error) {
      await logFailure('run_automations', 'Failed to apply board automations', error)
    }
    if (!applied.size) return
    const now = new Date()
    await persistBoardMeta(boardId, b => ({
      automations: (b.automations ?? []).map(a => applied.has(a.id) ? bumpRunCount(a, now) : a),
    }))
  }

  // One due-date pass per board at a time: a second pass started mid-run (scheduler vs. a
  // card save) would plan from the same firedFor and fire the same matches again.
  const dueDateRuns = new Map<string, Promise<void>>()
  // ruleId|cardId|dueDate already fired this session, so a failed firedFor save
  // (rolled back by persistBoardMeta) does not re-notify on every later pass.
  const firedThisSession = new Set<string>()

  function runDueDateAutomations(boardId: string, now = new Date()): Promise<void> {
    const run = (dueDateRuns.get(boardId) ?? Promise.resolve()).then(() => runDueDatePass(boardId, now))
    dueDateRuns.set(boardId, run.catch(() => undefined))
    return run
  }

  // Cards must already be in the store (callers load them first).
  async function runDueDatePass(boardId: string, now: Date) {
    const board = boards.value.get(boardId)
    const boardCards = cards.value.get(boardId)
    if (!board || !boardCards) return
    const matches = planDueDateAutomations(board, boardCards, now)
      .filter(match => !firedThisSession.has(`${match.ruleId}|${match.cardId}|${match.dueDate}`))
    const firedByRule = new Map<string, Array<{ cardId: string; dueDate: string }>>()
    for (const match of matches) {
      const card = cards.value.get(boardId)?.find(c => c.id === match.cardId)
      if (!card) continue
      try {
        await applyPlan(boardId, board, card, match.plan)
        firedThisSession.add(`${match.ruleId}|${match.cardId}|${match.dueDate}`)
        const list = firedByRule.get(match.ruleId) ?? []
        list.push({ cardId: match.cardId, dueDate: match.dueDate })
        firedByRule.set(match.ruleId, list)
      } catch (error) {
        await logFailure('run_due_date_automations', 'Failed to apply a due date automation', error)
      }
    }

    const live = new Set((cards.value.get(boardId) ?? boardCards).map(c => c.id))
    const current = boards.value.get(boardId)?.automations ?? []
    let changed = false
    const automations = current.map(a => {
      if (a.trigger !== 'due_date_near') return a
      let next = pruneFiredFor(a, live)
      for (const { cardId, dueDate } of firedByRule.get(a.id) ?? []) next = bumpRunCount(markFired(next, cardId, dueDate, live), now)
      if (next !== a) changed = true
      return next
    })
    if (changed) await persistBoardMeta(boardId, () => ({ automations }))
  }

  return { runAutomations, runDueDateAutomations }
}
