import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../types/note'
import { resolveTemplateContent, validateTemplateFieldValues } from './templates'
import type { TemplateDocument } from '../types/template'
import { nevoBaseSchema } from '../editor-core/schema'

function doc(text: string): BlockNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  }
}

function hasEmptyTextNode(node: BlockNode): boolean {
  if (node.type === 'text' && node.text === '') return true
  return node.content?.some(hasEmptyTextNode) ?? false
}

describe('resolveTemplateContent', () => {
  it('resolves built-ins, custom fields, optional misses, and cursor marker in text nodes', () => {
    const result = resolveTemplateContent(doc('{{date}} {{time}} {{note.title}} {{workspace.name}} {{field.topic}} {{field.missing}} {{cursor}}'), {
      now: new Date('2026-06-02T09:30:00'),
      note: { title: 'Planning' },
      workspaceName: 'Nevo',
      fields: { topic: 'Templates' },
    })

    expect(result.cursorFound).toBe(true)
    expect(result.content.content?.[0]?.content?.[0]?.text).toBe('2026-06-02 09:30 Planning Nevo Templates  ')
  })

  it('removes an empty text node left by the cursor marker while preserving the paragraph', () => {
    const result = resolveTemplateContent(doc('{{cursor}}'))

    expect(result.cursorFound).toBe(true)
    expect(result.content).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    expect(hasEmptyTextNode(result.content)).toBe(false)
  })

  it('removes empty text nodes from missing optional fields and remains schema-valid', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '{{field.optional}}' }],
        },
        {
          type: 'checklist_item',
          attrs: { checked: false },
          content: [{ type: 'text', text: '{{field.task}}' }],
        },
      ],
    }

    const result = resolveTemplateContent(content, { fields: {} })

    expect(hasEmptyTextNode(result.content)).toBe(false)
    expect(() => nevoBaseSchema.nodeFromJSON(result.content)).not.toThrow()
  })
})

describe('validateTemplateFieldValues', () => {
  it('blocks missing required fields', () => {
    const template: TemplateDocument = {
      id: 'meeting',
      name: 'Meeting',
      icon: 'M',
      description: '',
      content: doc(''),
      fields: [
        { id: 'topic', label: 'Topic', type: 'text', required: true },
        { id: 'includeTasks', label: 'Tasks', type: 'checkbox', required: true },
        { id: 'notes', label: 'Notes', type: 'multiline', required: false },
      ],
      createdAt: '',
      updatedAt: '',
    }

    expect(validateTemplateFieldValues(template, { topic: '', includeTasks: false })).toEqual(['topic', 'includeTasks'])
    expect(validateTemplateFieldValues(template, { topic: 'Roadmap', includeTasks: true })).toEqual([])
  })
})
