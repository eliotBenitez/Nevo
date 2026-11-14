import type { KanbanAutomation, KanbanBoard, KanbanCard, KanbanCardField } from '../../../types/kanban'
import { computeTaskProgress, createKanbanId, getBoardColumns, getCardStatusValue } from './kanbanFields'

export interface AutomationPlan {
  firedIds: string[]
  status?: string
  addTags: string[]
  progress?: number
}

const SUPPORTED_TRIGGERS: ReadonlySet<string> = new Set(['status_change', 'subtasks_done'])
const SUPPORTED_ACTIONS: ReadonlySet<string> = new Set(['move_to', 'add_tag', 'set_progress'])

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
  const plan: AutomationPlan = { firedIds: [], addTags: [] }
  const beforeStatus = before ? getCardStatusValue(before, board) : ''
  const afterStatus = getCardStatusValue(after, board)
  const subtasksCompleted = progressPct(before) !== 100 && progressPct(after) === 100

  for (const automation of board.automations ?? []) {
    if (!automation.enabled || alreadyFired.has(automation.id) || !isAutomationSupported(automation)) continue

    const triggered = automation.trigger === 'status_change'
      ? afterStatus !== beforeStatus && afterStatus !== '' && resolveColumnId(board, automation.triggerValue) === afterStatus
      : subtasksCompleted
    if (!triggered) continue

    if (automation.action === 'move_to') {
      const target = resolveColumnId(board, automation.actionValue)
      if (!target || target === afterStatus || plan.status !== undefined) continue
      plan.status = target
    } else if (automation.action === 'add_tag') {
      const tag = automation.actionValue?.trim()
      if (!tag || cardHasTag(after, tag)) continue
      plan.addTags.push(tag)
    } else {
      if (after.progress === 100) continue
      plan.progress = 100
    }
    plan.firedIds.push(automation.id)
  }
  return plan
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
