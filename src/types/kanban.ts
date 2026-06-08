import type { BlockNode } from './note'

export type KanbanPropertyType = 'text' | 'select' | 'multi_select' | 'date' | 'number' | 'checkbox'
export type KanbanCardPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type KanbanCardPropValue = string | string[] | number | boolean | null

export interface KanbanPropertyOption {
  id: string
  name: string
  color?: string
}

export interface KanbanPropertyDef {
  id: string
  name: string
  type: KanbanPropertyType
  options?: KanbanPropertyOption[]
  order: number
}

export interface KanbanCardField {
  id: string
  name: string
  type: KanbanPropertyType
  value: KanbanCardPropValue
  options?: KanbanPropertyOption[]
  order: number
}

export interface KanbanLink {
  cardId: string
  kind: 'related' | 'blocked-by' | 'blocks'
}

export interface KanbanAutomation {
  id: string
  trigger: 'subtasks_done' | 'status_change' | 'due_date_near'
  triggerValue?: string
  action: 'move_to' | 'set_progress' | 'add_tag' | 'notify'
  actionValue?: string
  enabled: boolean
  runCount?: number
}

export interface KanbanTemplate {
  id: string
  name: string
  icon: string
  description: string
  shortcut?: string
}

export type KanbanCardDensity = 'compact' | 'comfortable'

export interface KanbanBoardCardViewSettings {
  visiblePropertyIds?: string[]
  propertyOrder?: string[]
  showCardPreview?: boolean
  cardDensity?: KanbanCardDensity
}

export interface KanbanViewSettings {
  board?: KanbanBoardCardViewSettings
}

export interface KanbanBoard {
  id: string
  title: string
  icon: string
  folderId: string | null
  statusPropertyId: string
  propertyDefinitions: KanbanPropertyDef[]
  wip?: Record<string, number>
  automations?: KanbanAutomation[]
  templates?: KanbanTemplate[]
  viewSettings?: KanbanViewSettings
  createdAt: string
  updatedAt: string
}

export interface KanbanCard {
  id: string
  boardId: string
  title: string
  icon?: string
  content: BlockNode
  properties: Record<string, KanbanCardPropValue>
  fields: KanbanCardField[]
  columnOrder: number
  links?: KanbanLink[]
  estimate?: string
  sprint?: string
  progress?: number
  priority?: KanbanCardPriority
  coverHue?: string
  createdAt: string
  updatedAt: string
}

export interface KanbanBoardMeta {
  id: string
  title: string
  icon: string
  updatedAt: string
}
