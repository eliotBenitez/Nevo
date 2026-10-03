import { describe, expect, it } from 'vitest'
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { createMobileBlockMenuTransaction } from './mobileBlockInsertion'

describe('createMobileBlockMenuTransaction', () => {
  it.each([
    ['math_block', { latex: 'x^2', displayMode: true }],
    ['draw_block', { drawId: 'draw-1', src: '', svgPreview: '', title: '' }],
    ['mermaid_block', { code: 'graph TD\nA --> B' }],
  ])('preserves a selected %s and creates the slash paragraph below it', (typeName, attrs) => {
    const block = nevoBaseSchema.nodes[typeName]!.create(attrs)
    const doc = nevoBaseSchema.node('doc', null, [block])
    const state = EditorState.create({
      schema: nevoBaseSchema,
      doc,
      selection: NodeSelection.create(doc, 0),
    })

    const tr = createMobileBlockMenuTransaction(state)

    expect(tr).not.toBeNull()
    expect(tr?.doc.childCount).toBe(2)
    expect(tr?.doc.child(0).type.name).toBe(typeName)
    expect(tr?.doc.child(1).type.name).toBe('paragraph')
    expect(tr?.doc.child(1).textContent).toBe('/')
    expect(tr?.selection).toBeInstanceOf(TextSelection)
    expect(tr?.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('keeps the existing inline insertion behaviour in a paragraph', () => {
    const paragraph = nevoBaseSchema.node('paragraph', null, [nevoBaseSchema.text('Hello')])
    const doc = nevoBaseSchema.node('doc', null, [paragraph])
    const state = EditorState.create({
      schema: nevoBaseSchema,
      doc,
      selection: TextSelection.create(doc, 6),
    })

    const tr = createMobileBlockMenuTransaction(state)

    expect(tr?.doc.childCount).toBe(1)
    expect(tr?.doc.textContent).toBe('Hello/')
  })
})
