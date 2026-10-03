import { describe, expect, it } from 'vitest'
import { diffWords } from './text-diff'

function join(parts: ReturnType<typeof diffWords>, kind: 'same' | 'added' | 'removed') {
  return parts.filter(part => part.kind === kind).map(part => part.text).join('')
}

function reassembleBefore(parts: ReturnType<typeof diffWords>) {
  return parts.filter(part => part.kind !== 'added').map(part => part.text).join('')
}

function reassembleAfter(parts: ReturnType<typeof diffWords>) {
  return parts.filter(part => part.kind !== 'removed').map(part => part.text).join('')
}

describe('diffWords', () => {
  it('marks identical text as a single unchanged run', () => {
    expect(diffWords('one two', 'one two')).toEqual([{ kind: 'same', text: 'one two' }])
  })

  it('isolates a single changed word instead of replacing the paragraph', () => {
    const parts = diffWords('the quick brown fox', 'the quick red fox')

    // Tokens carry their trailing whitespace, so compare trimmed.
    expect(join(parts, 'removed').trim()).toBe('brown')
    expect(join(parts, 'added').trim()).toBe('red')
    expect(join(parts, 'same')).toContain('the quick')
  })

  it('round-trips both sides losslessly, whitespace included', () => {
    const before = 'Датчики:  выполняют роль\nорганов чувств'
    const after = 'Датчики: выполняют важную роль\nорганов чувств робота'
    const parts = diffWords(before, after)

    expect(reassembleBefore(parts)).toBe(before)
    expect(reassembleAfter(parts)).toBe(after)
  })

  it('handles an empty side', () => {
    expect(diffWords('', 'added text')).toEqual([{ kind: 'added', text: 'added text' }])
    expect(diffWords('removed text', '')).toEqual([{ kind: 'removed', text: 'removed text' }])
    expect(diffWords('', '')).toEqual([])
  })

  it('degrades to a whole-block replacement past the token budget', () => {
    const before = Array.from({ length: 1400 }, (_, index) => `a${index}`).join(' ')
    const after = Array.from({ length: 1400 }, (_, index) => `b${index}`).join(' ')
    const parts = diffWords(before, after)

    expect(parts).toEqual([{ kind: 'removed', text: before }, { kind: 'added', text: after }])
  })

  it('merges adjacent runs of the same kind', () => {
    const parts = diffWords('a b c', 'x y c')

    expect(parts.filter(part => part.kind === 'removed')).toHaveLength(1)
    expect(parts.filter(part => part.kind === 'added')).toHaveLength(1)
  })
})
