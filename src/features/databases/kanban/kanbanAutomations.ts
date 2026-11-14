import type { KanbanAutomation, KanbanBoard, KanbanCard, KanbanCardField } from '../../../types/kanban'
import { computeTaskProgress, createKanbanId, getBoardColumns, getCardStatusValue } from './kanbanFields'

export interface AutomationPlan {
  firedIds: string[]
  status?: string
  addTags: string[]
  progress?: number
  notify: boolean
}

const SUPPORTED_TRIGGERS: ReadonlySet<string> = new Set(['status_change', 'subtasks_done', 'due_date_near'])
const SUPPORTED_ACTIONS: ReadonlySet<string> = new Set(['move_to', 'add_tag', 'set_progress', 'notify'])

export function isAutomationSupported(automation: Pick<KanbanAutomation, 'trigger' | 'action'>): boolean {
  return SUPPORTED_TRIGGERS.has(automation.trigger) && SUPPORTED_ACTIONS.has(automation.action)
}

// Rules store a column id, but older/hand-written rules may hold the column name.
export function resolveColumnId(board: KanbanBoard, value: string | undefined): string | null {
  const needle = value?.trim()
  if (!needle) return null
  const columns = getBoardColumns(board)
  const byId = columns.find(column => column.id === needle)
  if (byId) return byId.id
  const lowered = needle.toLocaleLowerCase()
  return columns.find(column => column.name.trim().toLocaleLowerCase() === lowered)?.id ?? null
}

function progressPct(card: KanbanCard | null): number | null {
  return card ? computeTaskProgress(card.content)?.pct ?? null : null
}

export function planAutomations(
  board: KanbanBoard,
  before: KanbanCard | null,
  after: KanbanCard,
  alreadyFired: ReadonlySet<string>,
): AutomationPlan {
  const plan = emptyPlan()
  const beforeStatus = before ? getCardStatusValue(before, board) : ''
  const afterStatus = getCardStatusValue(after, board)
  const subtasksCompleted = progressPct(before) !== 100 && progressPct(after) === 100

  for (const automation of board.automations ?? []) {
    if (!automation.enabled || alreadyFired.has(automation.id) || !isAutomationSupported(automation)) continue

    const triggered = automation.trigger === 'status_change'
      ? afterStatus !== beforeStatus && afterStatus !== '' && resolveColumnId(board, automation.triggerValue) === afterStatus
      : automation.trigger === 'subtasks_done' && subtasksCompleted
    if (triggered) addAutomationToPlan(board, automation, after, afterStatus, plan)
  }
  return plan
}

export function emptyPlan(): AutomationPlan {
  return { firedIds: [], addTags: [], notify: false }
}

// Adds the rule's action to the plan; returns false when it would be a no-op or conflicts with an earlier rule.
export function addAutomationToPlan(
  board: KanbanBoard,
  automation: KanbanAutomation,
  card: KanbanCard,
  status: string,
  plan: AutomationPlan,
): boolean {
  if (automation.action === 'move_to') {
    const target = resolveColumnId(board, automation.actionValue)
    if (!target || target === status || plan.status !== undefined) return false
    plan.status = target
  } else if (automation.action === 'add_tag') {
    const tag = automation.actionValue?.trim()
    if (!tag || cardHasTag(card, tag)) return false
    plan.addTags.push(tag)
  } else if (automation.action === 'set_progress') {
    if (card.progress === 100) return false
    plan.progress = 100
  } else if (automation.action === 'notify') {
    plan.notify = true
  } else {
    return false
  }
  plan.firedIds.push(automation.id)
  return true
}

function isTagsField(field: KanbanCardField): boolean {
  const name = field.name.toLowerCase().trim()
  return field.type === 'multi_select' && (name === 'tags' || name === 'теги')
}

function cardHasTag(card: KanbanCard, name: string): boolean {
  const field = card.fields?.find(isTagsField)
  const lowered = name.toLocaleLowerCase()
  const option = field?.options?.find(candidate => candidate.name.trim().toLocaleLowerCase() === lowered)
  return !!option && Array.isArray(field?.value) && field.value.includes(option.id)
}

export function applyTagsToFields(fields: KanbanCardField[], tagNames: string[]): KanbanCardField[] {
  if (!tagNames.length) return fields
  const next = fields.map(field => ({ ...field }))
  let tagsField = next.find(isTagsField)
  if (!tagsField) {
    tagsField = { id: createKanbanId(), name: 'tags', type: 'multi_select', value: [], options: [], order: next.length }
    next.push(tagsField)
  }
  const options = [...(tagsField.options ?? [])]
  const value = Array.isArray(tagsField.value) ? [...tagsField.value] : []
  for (const name of tagNames) {
    const lowered = name.trim().toLocaleLowerCase()
    let option = options.find(candidate => candidate.name.trim().toLocaleLowerCase() === lowered)
    if (!option) {
      option = { id: createKanbanId(), name: name.trim() }
      options.push(option)
    }
    if (!value.includes(option.id)) value.push(option.id)
  }
  tagsField.options = options
  tagsField.value = value
  return next
}

export function weekStart(now: Date): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

export function bumpRunCount(automation: KanbanAutomation, now: Date): KanbanAutomation {
  const week = weekStart(now)
  return { ...automation, runWeek: week, runCount: automation.runWeek === week ? (automation.runCount ?? 0) + 1 : 1 }
}

export function weeklyRunCount(automation: KanbanAutomation, now: Date): number {
  return automation.runWeek === weekStart(now) ? automation.runCount ?? 0 : 0
}

export interface DependencyPair {
  from: KanbanCard
  to: KanbanCard
}

/** Unique blocker -> blocked pairs from `blocks` / `blocked-by` links; links to missing cards are skipped. */
export function dependencyPairs(cards: KanbanCard[]): DependencyPair[] {
  const byId = new Map(cards.map(card => [card.id, card]))
  const seen = new Set<string>()
  const pairs: DependencyPair[] = []
  const add = (fromId: string, toId: string) => {
    const from = byId.get(fromId)
    const to = byId.get(toId)
    const key = `${fromId}>${toId}`
    if (!from || !to || seen.has(key)) return
    seen.add(key)
    pairs.push({ from, to })
  }
  for (const card of cards) {
    for (const link of card.links ?? []) {
      if (link.kind === 'blocks') add(card.id, link.cardId)
      else if (link.kind === 'blocked-by') add(link.cardId, card.id)
    }
  }
  return pairs
}
