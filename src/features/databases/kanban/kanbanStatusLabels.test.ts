import { describe, expect, it } from 'vitest'
import { localizeDefaultKanbanLabel } from './kanbanFields'

describe('localizeDefaultKanbanLabel', () => {
  const translations: Record<string, string> = {
    'kanban.defaultStatuses.status': 'Статус',
    'kanban.defaultStatuses.toDo': 'К выполнению',
    'kanban.defaultStatuses.inProgress': 'В работе',
    'kanban.defaultStatuses.done': 'Готово',
  }
  const translate = (key: string) => translations[key] ?? key

  it('localizes canonical labels without changing stored board values', () => {
    expect(localizeDefaultKanbanLabel('Status', translate)).toBe('Статус')
    expect(localizeDefaultKanbanLabel('To Do', translate)).toBe('К выполнению')
    expect(localizeDefaultKanbanLabel('In Progress', translate)).toBe('В работе')
    expect(localizeDefaultKanbanLabel('Done', translate)).toBe('Готово')
  })

  it('preserves user-defined labels', () => {
    expect(localizeDefaultKanbanLabel('Ready for review', translate)).toBe('Ready for review')
  })
})
