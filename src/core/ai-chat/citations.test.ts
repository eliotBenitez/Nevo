import { describe, expect, it } from 'vitest'
import { splitCitations, stripCitations } from './citations'

describe('citations', () => {
  it('splits text around adjacent markers', () => {
    expect(splitCitations('a [1][3]. b [2]')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'cite', n: 1 },
      { kind: 'cite', n: 3 },
      { kind: 'text', value: '. b ' },
      { kind: 'cite', n: 2 },
    ])
  })

  it('returns plain text unchanged', () => {
    expect(splitCitations('nothing')).toEqual([{ kind: 'text', value: 'nothing' }])
    expect(splitCitations('')).toEqual([])
  })

  it('strips markers and the preceding space', () => {
    expect(stripCitations('a [1][3]. b [2]')).toBe('a. b')
    expect(stripCitations('list[1]\nnext')).toBe('list\nnext')
  })

  it('keeps markdown links intact', () => {
    expect(stripCitations('[text](http://x) [1]')).toBe('[text](http://x)')
  })
})
