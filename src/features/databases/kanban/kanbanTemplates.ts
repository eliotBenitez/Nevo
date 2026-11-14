import type { KanbanBoard, KanbanCard, KanbanTemplate } from '../../../types/kanban'
import { cloneCardFields, createKanbanId, getCardStatusValue, serializeCardProperties } from './kanbanFields'

export type TemplateCardUpdates = Partial<Pick<KanbanCard, 'icon' | 'content' | 'fields' | 'properties' | 'priority'>>

const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// The status column is deliberately not captured: a template never decides where its card lands.
export function createTemplateFromCard(card: KanbanCard, name: string): KanbanTemplate {
  return {
    id: createKanbanId(),
    name,
    // The fallback only labels the template tile; a card without an icon stays without one.
    icon: card.icon || '📄',
    card: {
      icon: card.icon || undefined,
      content: jsonClone(card.content),
      fields: cloneCardFields(card),
      priority: card.priority,
    },
  }
}

export function templateCardUpdates(board: KanbanBoard, card: KanbanCard, template: KanbanTemplate): TemplateCardUpdates {
  const snapshot = template.card
  if (!snapshot) return {}
  const updates: TemplateCardUpdates = {}
  if (snapshot.icon) updates.icon = snapshot.icon
  if (snapshot.content) updates.content = jsonClone(snapshot.content)
  if (snapshot.priority) updates.priority = snapshot.priority
  if (snapshot.fields?.length) {
    const fields = cloneCardFields({ fields: snapshot.fields })
    updates.fields = fields
    updates.properties = serializeCardProperties(board, card, fields, getCardStatusValue(card, board))
  }
  return updates
}

export function templateHasContent(template: KanbanTemplate): boolean {
  const blocks = template.card?.content?.content
  return Array.isArray(blocks) && blocks.some(block => (block.content?.length ?? 0) > 0 || block.type !== 'paragraph')
}
