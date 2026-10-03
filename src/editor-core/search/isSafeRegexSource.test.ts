import { describe, expect, it } from 'vitest'
import { isSafeRegexSource } from './isSafeRegexSource'

describe('isSafeRegexSource', () => {
  it('rejects the classic catastrophic-backtracking shape', () => {
    expect(isSafeRegexSource('(a+)+$')).toBe(false)
  })

  it('rejects quantified-group-of-quantified-atom variants', () => {
    expect(isSafeRegexSource('(a*)*')).toBe(false)
    expect(isSafeRegexSource('(a+)*')).toBe(false)
    expect(isSafeRegexSource('(a*)+')).toBe(false)
    expect(isSafeRegexSource('([a-z]+)+')).toBe(false)
    expect(isSafeRegexSource('([a-z]*)*')).toBe(false)
  })

  it('rejects the shape with {n,}/{n,m} quantifiers', () => {
    expect(isSafeRegexSource('(a{2,})+')).toBe(false)
    expect(isSafeRegexSource('(a{1,3})*')).toBe(false)
    expect(isSafeRegexSource('([a-z]{2,5}){3,}')).toBe(false)
  })

  it('rejects nested quantified alternation (overlapping branches)', () => {
    expect(isSafeRegexSource('(a|aa)+')).toBe(false)
    expect(isSafeRegexSource('(a|a?)*')).toBe(false)
    expect(isSafeRegexSource('(x|xy)+')).toBe(false)
  })

  it('rejects a backreference combined with a quantifier', () => {
    expect(isSafeRegexSource('(a+)\\1+')).toBe(false)
    expect(isSafeRegexSource('(\\w)\\1*')).toBe(false)
  })

  it('finds the unsafe shape nested inside an outer group', () => {
    expect(isSafeRegexSource('foo((a+)+)bar')).toBe(false)
    expect(isSafeRegexSource('(?:(a+)+)')).toBe(false)
  })

  it('allows plain quantified character classes and digits', () => {
    expect(isSafeRegexSource('\\d{3}-\\d{4}')).toBe(true)
    expect(isSafeRegexSource('[a-z]+@[a-z]+\\.[a-z]{2,}')).toBe(true)
    expect(isSafeRegexSource('a{2,5}')).toBe(true)
  })

  it('allows a quantified group of non-quantified, non-overlapping alternatives', () => {
    expect(isSafeRegexSource('(foo|bar)+')).toBe(true)
    expect(isSafeRegexSource('(cat|dog)*')).toBe(true)
  })

  it('treats escaped parens and quantifier characters as literal', () => {
    expect(isSafeRegexSource('\\(a\\+\\)\\+')).toBe(true)
  })

  it('treats quantifier characters inside a character class as literal', () => {
    expect(isSafeRegexSource('[+*]')).toBe(true)
    expect(isSafeRegexSource('[a+()*]+')).toBe(true)
  })

  it('allows non-capturing and named groups that are not catastrophic', () => {
    expect(isSafeRegexSource('(?:foo|bar)+')).toBe(true)
    expect(isSafeRegexSource('(?<year>\\d{4})-(?<month>\\d{2})')).toBe(true)
  })

  it('rejects catastrophic shapes inside non-capturing/named groups too', () => {
    expect(isSafeRegexSource('(?:a+)+')).toBe(false)
    expect(isSafeRegexSource('(?<x>a+)+')).toBe(false)
  })

  it('allows a bare unquantified backreference', () => {
    expect(isSafeRegexSource('(a)\\1')).toBe(true)
  })

  it('allows plain literal text and common anchors', () => {
    expect(isSafeRegexSource('hello world')).toBe(true)
    expect(isSafeRegexSource('^start.*end$')).toBe(true)
  })

  it('falls back to safe for malformed sources it cannot parse', () => {
    // Unbalanced group / trailing backslash: not this function's job to
    // reject — `new RegExp()` will throw on these itself.
    expect(isSafeRegexSource('(a+')).toBe(true)
    expect(isSafeRegexSource('a\\')).toBe(true)
  })
})
