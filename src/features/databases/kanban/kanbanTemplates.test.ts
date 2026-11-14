import { describe, expect, it } from 'vitest'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import { createTemplateFromCard, templateCardUpdates, templateHasContent } from './kanbanTemplates'

const board: KanbanBoard = {
  id: 'b', title: 'B', icon: 'K', folderId: null, statusPropertyId: 'st',
  propertyDefinitions: [{ id: 'st', name: 'Status', type: 'select', order: 0, options: [{ id: 'todo', name: 'To Do' }, { id: 'done', name: 'Done' }] }],
  createdAt: 't', updatedAt: 't',
}

const source = {
  id: 'c1', boardId: 'b', title: 'Bug', icon: '🐞', priority: 'high', columnOrder: 0, createdAt: 't', updatedAt: 't',
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Steps' }] }] },
  properties: { st: 'done' },
  fields: [{ id: 'f1', name: 'Owner', type: 'text', value: 'me', order: 0 }],
} as KanbanCard

describe('kanbanTemplates', () => {
  it('snapshots content, fields and priority but not the status column', () => {
    const template = createTemplateFromCard(source, 'Bug report')
    expect(template).toMatchObject({ name: 'Bug report', icon: '🐞', card: { priority: 'high' } })
    expect(JSON.stringify(template)).not.toContain('"done"')
    expect(template.card!.content).toEqual(source.content)
    expect(template.card!.content).not.toBe(source.content)
    expect(template.card!.fields![0]).not.toBe(source.fields[0])
    expect(templateHasContent(template)).toBe(true)
  })

  it('keeps the new card column in the update payload', () => {
    const template = createTemplateFromCard(source, 'Bug report')
    const fresh = { ...source, id: 'c2', content: { type: 'doc', content: [] }, fields: [], properties: { st: 'todo' } } as KanbanCard
    const updates = templateCardUpdates(board, fresh, template)
    expect(updates.properties).toEqual({ st: 'todo' })
    expect(updates).toMatchObject({ icon: '🐞', priority: 'high', content: source.content })
    expect(updates.fields).toHaveLength(1)
    expect(templateCardUpdates(board, fresh, { id: 't', name: 'n', icon: 'i' })).toEqual({})
  })
})
