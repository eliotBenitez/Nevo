import { describe, expect, it } from 'vitest'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc } from '../serialization'
import type { BlockNode } from '../../types/note'
import { buildFindRegExp, collectTextRuns, findMatchesInDoc, findMatchesInRuns, type FindQuery } from './findMatches'

function query(text: string, overrides: Partial<FindQuery> = {}): FindQuery {
  return { text, caseSensitive: false, wholeWord: false, regex: false, ...overrides }
}

function paragraphDoc(text: string): BlockNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] }
}

describe('buildFindRegExp unsafe-pattern gating', () => {
  it('flags a catastrophic-backtracking pattern as unsafe, not a plain invalid regex', () => {
    const result = buildFindRegExp(query('(a+)+$', { regex: true }))
    expect(result.error).toBe(true)
    expect(result.regexp).toBeNull()
    expect((result as { reason: string }).reason).toBe('unsafe')
  })

  it('still flags a syntactically invalid pattern as invalid', () => {
    const result = buildFindRegExp(query('(unclosed', { regex: true }))
    expect(result.error).toBe(true)
    expect((result as { reason: string }).reason).toBe('invalid')
  })

  it('allows a safe regex pattern through', () => {
    const result = buildFindRegExp(query('[a-z]+@[a-z]+', { regex: true }))
    expect(result.error).toBe(false)
    expect(result.regexp).not.toBeNull()
  })
})

describe('collectTextRuns + findMatchesInRuns matches findMatchesInDoc', () => {
  it('produces the same matches as findMatchesInDoc for a multi-paragraph doc', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'alpha needle' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'needle beta' }] },
      ],
    })
    const q = query('needle')
    const viaDoc = findMatchesInDoc(doc, q)
    const runs = collectTextRuns(doc)
    const viaRuns = findMatchesInRuns(runs, q)
    expect(viaRuns).toEqual(viaDoc)
  })

  it('never lets a run span an inline atom, matching findMatchesInDoc', () => {
    const doc = nevoBaseSchema.nodes.doc.create(null, [
      nevoBaseSchema.nodes.paragraph.create(null, [
        nevoBaseSchema.text('foo'),
        nevoBaseSchema.nodes.math_inline.create({ latex: 'x^2' }),
        nevoBaseSchema.text('bar'),
      ]),
    ])
    const runs = collectTextRuns(doc)
    expect(runs).toEqual([{ text: 'foo', start: 1 }, { text: 'bar', start: 5 }])
    expect(findMatchesInRuns(runs, query('foobar'))).toEqual(findMatchesInDoc(doc, query('foobar')))
  })

  it('respects the match limit and truncation flag identically', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, paragraphDoc('a'.repeat(20)))
    const q = query('a', { regex: true })
    const runs = collectTextRuns(doc)
    expect(findMatchesInRuns(runs, q, 5)).toEqual(findMatchesInDoc(doc, q, 5))
  })

  it('propagates the unsafe reason from findMatchesInRuns', () => {
    const result = findMatchesInRuns([{ text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!', start: 0 }], query('(a+)+$', { regex: true }))
    expect(result.error).toBe(true)
    expect(result.reason).toBe('unsafe')
    expect(result.matches).toHaveLength(0)
  })
})
