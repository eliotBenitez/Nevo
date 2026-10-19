import { describe, expect, it } from 'vitest'
import { nevoBaseSchema as schema } from '../../../editor-core/schema'
import { collectHeadingOutline, findActiveHeadingIndex } from './headingOutline'

describe('collectHeadingOutline', () => {
  it('lists headings in document order with level, text and position', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1 }, [schema.text(' Intro ')]),
      schema.node('paragraph', null, [schema.text('body')]),
      schema.node('column_list', null, [
        schema.node('column', null, [schema.node('heading', { level: 3 }, [schema.text('Nested')])]),
      ]),
      schema.node('heading', { level: 2 }),
    ])

    const items = collectHeadingOutline(doc)

    expect(items.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: 'Intro' },
      { level: 3, text: 'Nested' },
      { level: 2, text: '' },
    ])
    for (const item of items) expect(doc.nodeAt(item.pos)?.type.name).toBe('heading')
  })
})

describe('findActiveHeadingIndex', () => {
  it('returns the last heading at or above the threshold', () => {
    expect(findActiveHeadingIndex([], 100)).toBe(-1)
    expect(findActiveHeadingIndex([150, 400], 100)).toBe(-1)
    expect(findActiveHeadingIndex([-300, 20, 100, 400], 100)).toBe(2)
  })
})
