import type { BlockNode } from '../types/note'
import type { ResolvedTemplateContent, TemplateDocument, TemplateField, TemplateFieldValues, TemplateResolutionContext } from '../types/template'

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function stringifyFieldValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'boolean') return value ? 'true' : ''
  return String(value)
}

function resolvePlaceholder(token: string, context: Required<Pick<TemplateResolutionContext, 'fields'>> & TemplateResolutionContext): { value: string; cursor: boolean } {
  const key = token.trim()
  const now = context.now ?? new Date()

  if (key === 'cursor') return { value: '', cursor: true }
  if (key === 'date') return { value: formatDate(now), cursor: false }
  if (key === 'time') return { value: formatTime(now), cursor: false }
  if (key === 'datetime') return { value: `${formatDate(now)} ${formatTime(now)}`, cursor: false }
  if (key === 'note.title') return { value: context.note?.title ?? '', cursor: false }
  if (key === 'workspace.name') return { value: context.workspaceName ?? '', cursor: false }
  if (key.startsWith('field.')) {
    return { value: stringifyFieldValue(context.fields[key.slice(6)]), cursor: false }
  }

  return { value: '', cursor: false }
}

function resolveTemplateString(value: string, context: TemplateResolutionContext = {}): string {
  return value.replace(PLACEHOLDER_RE, (_match, token: string) => resolvePlaceholder(token, { ...context, fields: context.fields ?? {} }).value)
}

function resolveNode(node: BlockNode, context: Required<Pick<TemplateResolutionContext, 'fields'>> & TemplateResolutionContext, cursor: { found: boolean }): BlockNode {
  if (node.type === 'text') {
    const text = node.text ?? ''
    const nextText = text.replace(PLACEHOLDER_RE, (_match, token: string) => {
      const resolved = resolvePlaceholder(token, context)
      if (resolved.cursor) cursor.found = true
      return resolved.value
    })
    return { ...node, text: nextText }
  }

  const resolved = {
    ...node,
    content: node.content?.map(child => resolveNode(child, context, cursor)),
  }

  if (!resolved.content) return resolved

  const content = resolved.content.filter(child => child.type !== 'text' || child.text !== '')
  if (content.length > 0) return { ...resolved, content }

  const withoutContent = { ...resolved }
  delete withoutContent.content
  return withoutContent
}

export function resolveTemplateContent(content: BlockNode, context: TemplateResolutionContext = {}): ResolvedTemplateContent {
  const cursor = { found: false }
  return {
    content: resolveNode(content, { ...context, fields: context.fields ?? {} }, cursor),
    cursorFound: cursor.found,
  }
}

export function buildTemplateFieldDefaults(fields: TemplateField[], context: TemplateResolutionContext = {}): TemplateFieldValues {
  return Object.fromEntries(fields.map((field) => {
    const fallback = field.type === 'checkbox' ? false : ''
    const value = typeof field.defaultValue === 'string'
      ? resolveTemplateString(field.defaultValue, context)
      : field.defaultValue ?? fallback
    return [field.id, value]
  }))
}

export function validateTemplateFieldValues(template: TemplateDocument, values: TemplateFieldValues): string[] {
  return template.fields
    .filter(field => {
      if (!field.required) return false
      const value = values[field.id]
      if (field.type === 'checkbox') return value !== true
      return typeof value !== 'string' || value.trim() === ''
    })
    .map(field => field.id)
}

export function createEmptyTemplateContent(): BlockNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  }
}
