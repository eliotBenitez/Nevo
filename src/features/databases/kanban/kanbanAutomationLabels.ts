import type { KanbanAutomation, KanbanBoard } from '../../../types/kanban'
import { getBoardColumns, localizeDefaultKanbanLabel } from './kanbanFields'
import { resolveColumnId } from './kanbanAutomations'
import { dueWindowDays } from './kanbanDueDates'

type Translate = (key: string, params?: Record<string, unknown>) => string

function columnLabel(board: KanbanBoard, value: string | undefined, t: Translate): string {
  const id = resolveColumnId(board, value)
  const column = id ? getBoardColumns(board).find(option => option.id === id) : null
  return column ? localizeDefaultKanbanLabel(column.name, key => t(key)) : value ?? '?'
}

export function formatAutomationTrigger(board: KanbanBoard, automation: KanbanAutomation, t: Translate): string {
  if (automation.trigger === 'subtasks_done') return t('kanban.automations.trigger.subtasksDone')
  if (automation.trigger === 'status_change') return t('kanban.automations.trigger.statusChange', { value: columnLabel(board, automation.triggerValue, t) })
  if (automation.trigger === 'due_date_near') return t('kanban.automations.trigger.dueDateNear', { n: dueWindowDays(automation) })
  return automation.trigger
}

export function formatAutomationAction(board: KanbanBoard, automation: KanbanAutomation, t: Translate): string {
  if (automation.action === 'move_to') return t('kanban.automations.action.moveTo', { value: columnLabel(board, automation.actionValue, t) })
  if (automation.action === 'set_progress') return t('kanban.automations.action.setProgress')
  if (automation.action === 'add_tag') return t('kanban.automations.action.addTag', { value: automation.actionValue ?? '?' })
  if (automation.action === 'notify') return t('kanban.automations.action.notify')
  return automation.action
}
