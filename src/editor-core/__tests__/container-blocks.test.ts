import { describe, expect, it } from 'vitest'
import { Schema } from 'prosemirror-model'
import { nevoBaseSchema } from '../schema'
import { getContainerBlockTypes, isContainerBlockType } from '../schema/container-blocks'

describe('container-blocks', () => {
  it('treats callout and blockquote as exitable containers but not toggle/heading/list/column', () => {
    const names = new Set(
      Array.from(getContainerBlockTypes(nevoBaseSchema)).map((type) => type.name),
    )
    expect(names.has('callout')).toBe(true)
    expect(names.has('blockquote')).toBe(true)

    expect(names.has('toggle')).toBe(false)
    expect(names.has('column_list')).toBe(false)
    expect(names.has('column')).toBe(false)
    expect(names.has('heading')).toBe(false)
    expect(names.has('checklist_item')).toBe(false)
    expect(names.has('list_item')).toBe(false)
    expect(names.has('paragraph')).toBe(false)
  })

  it('recognizes a plugin-style container node registered into the schema', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*' },
        text: { group: 'inline' },
        callout_block: { group: 'block', content: 'block+', defining: true },
      },
    })
    expect(isContainerBlockType(schema.nodes.callout_block)).toBe(true)
    expect(isContainerBlockType(schema.nodes.paragraph)).toBe(false)
  })
})
