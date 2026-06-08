import type { BlockNode, NoteDocument } from './note'

export type TemplateFieldType = 'text' | 'multiline' | 'date' | 'select' | 'checkbox'

export interface TemplateField {
  id: string
  label: string
  type: TemplateFieldType
  required: boolean
  defaultValue?: string | boolean | null
  options?: string[]
}

export interface TemplateDocument {
  id: string
  name: string
  icon: string
  description: string
  content: BlockNode
  fields: TemplateField[]
  createdAt: string
  updatedAt: string
  builtIn?: boolean
}

export type TemplateFieldValues = Record<string, string | boolean | null | undefined>

export interface TemplateResolutionContext {
  now?: Date
  note?: Pick<NoteDocument, 'title'>
  workspaceName?: string
  fields?: TemplateFieldValues
}

export interface ResolvedTemplateContent {
  content: BlockNode
  cursorFound: boolean
}
