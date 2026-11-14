import { describe, expect, it } from 'vitest'
import { internalLinkSignature } from './internalLinkSignature'

const link = (noteId: string) => ({ type: 'text', text: 'x', marks: [{ type: 'internal_link', attrs: { noteId, anchor: null } }] })

describe('internalLinkSignature', () => {
  it('changes only when internal links change', () => {
    const doc = (text: string, target: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }, link(target)] }] })
    expect(internalLinkSignature(doc('a', 'n1'))).toBe(internalLinkSignature(doc('b', 'n1')))
    expect(internalLinkSignature(doc('a', 'n1'))).not.toBe(internalLinkSignature(doc('a', 'n2')))
  })

  it('ignores marks outside text nodes', () => {
    const marks = [{ type: 'internal_link', attrs: { noteId: 'n1' } }]
    expect(internalLinkSignature({ type: 'doc', content: [{ type: 'math_inline', marks }] })).toBe('')
  })
})
