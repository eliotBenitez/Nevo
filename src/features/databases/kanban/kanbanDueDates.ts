import type { KanbanAutomation, KanbanBoard, KanbanCard } from '../../../types/kanban'
import { getCardStatusValue } from './kanbanFields'
import { addAutomationToPlan, emptyPlan, isAutomationSupported, type AutomationPlan } from './kanbanAutomations'

export const DEFAULT_DUE_DAYS = 3
export const MAX_DUE_DAYS = 30

export interface DueDateMatch {
  cardId: string
  ruleId: string
  dueDate: string
  plan: AutomationPlan
}

export function dueWindowDays(automation: Pick<KanbanAutomation, 'triggerValue'>): number {
  const days = Number.parseInt(automation.triggerValue ?? '', 10)
  return Number.isInteger(days) && days >= 1 && days <= MAX_DUE_DAYS ? days : DEFAULT_DUE_DAYS
}

function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function cardDueDate(card: Pick<KanbanCard, 'fields'>, dateField?: string): string | null {
  const dates = (card.fields ?? []).filter(field => field.type === 'date')
  const wanted = dateField?.trim().toLocaleLowerCase()
  const field = wanted ? dates.find(candidate => candidate.name.trim().toLocaleLowerCase() === wanted) : dates[0]
  const value = typeof field?.value === 'string' ? field.value.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

// Inclusive window [today, today + days]; overdue dates never fire.
export function isDueNear(dueDate: string, now: Date, days: number): boolean {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return dueDate >= localDay(now) && dueDate <= localDay(end)
}

export function planDueDateAutomations(board: KanbanBoard, cards: KanbanCard[], now: Date): DueDateMatch[] {
  const matches: DueDateMatch[] = []
  for (const automation of board.automations ?? []) {
    if (!automation.enabled || automation.trigger !== 'due_date_near' || !isAutomationSupported(automation)) continue
    const days = dueWindowDays(automation)
    for (const card of cards) {
      const dueDate = cardDueDate(card, automation.dateField)
      if (!dueDate || !isDueNear(dueDate, now, days) || automation.firedFor?.[card.id] === dueDate) continue
      const plan = emptyPlan()
      if (addAutomationToPlan(board, automation, card, getCardStatusValue(card, board), plan)) {
        matches.push({ cardId: card.id, ruleId: automation.id, dueDate, plan })
      }
    }
  }
  return matches
}

/** Drops entries for cards that no longer exist; returns the same object when nothing changed. */
export function pruneFiredFor(automation: KanbanAutomation, liveCardIds: ReadonlySet<string>): KanbanAutomation {
  const entries = Object.entries(automation.firedFor ?? {})
  const kept = entries.filter(([cardId]) => liveCardIds.has(cardId))
  return kept.length === entries.length ? automation : { ...automation, firedFor: Object.fromEntries(kept) }
}

export function markFired(
  automation: KanbanAutomation,
  cardId: string,
  dueDate: string,
  liveCardIds: ReadonlySet<string>,
): KanbanAutomation {
  const pruned = pruneFiredFor(automation, liveCardIds)
  return { ...pruned, firedFor: { ...pruned.firedFor, [cardId]: dueDate } }
}
