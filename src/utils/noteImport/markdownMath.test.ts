import { describe, it, expect } from 'vitest'
import { normalizeDisplayMath } from './markdownMath'
import { parseMarkdownToBlockNode } from './markdownParser'

describe('normalizeDisplayMath', () => {
  it('splits a whole-line $$…$$ span onto its own fence lines', () => {
    expect(normalizeDisplayMath('text\n\n$$x^2$$\n\nafter')).toBe('text\n\n$$\nx^2\n$$\n\nafter')
  })

  it('preserves indentation on the generated fences', () => {
    expect(normalizeDisplayMath('  $$a+b$$')).toBe('  $$\na+b\n  $$')
  })

  it('leaves already-fenced display math untouched', () => {
    const md = '$$\nx^2\n$$'
    expect(normalizeDisplayMath(md)).toBe(md)
  })

  it('leaves inline math and mid-sentence $$ spans untouched', () => {
    expect(normalizeDisplayMath('a $x$ b')).toBe('a $x$ b')
    expect(normalizeDisplayMath('mid $$z$$ text')).toBe('mid $$z$$ text')
  })

  it('does not fold two spans on one line into a single block', () => {
    expect(normalizeDisplayMath('$$a$$ and $$b$$')).toBe('$$a$$ and $$b$$')
  })

  it('leaves $$ inside fenced code blocks verbatim', () => {
    const md = '```\n$$x^2$$\n```'
    expect(normalizeDisplayMath(md)).toBe(md)
  })

  it('skips blockquote and list lines', () => {
    expect(normalizeDisplayMath('> $$x$$')).toBe('> $$x$$')
    expect(normalizeDisplayMath('- $$x$$')).toBe('- $$x$$')
  })

  it('ignores empty spans', () => {
    expect(normalizeDisplayMath('$$$$')).toBe('$$$$')
  })
})

describe('parseMarkdownToBlockNode display math', () => {
  const blocks = (md: string) => parseMarkdownToBlockNode(md, 'T').content.content ?? []

  it('imports a whole-line $$…$$ formula as math_block', () => {
    expect(blocks('$$x^2$$')).toEqual([
      { type: 'math_block', attrs: { latex: 'x^2', displayMode: true } },
    ])
  })

  it('still imports fenced $$ formulas as math_block', () => {
    expect(blocks('$$\nx^2\n$$')).toEqual([
      { type: 'math_block', attrs: { latex: 'x^2', displayMode: true } },
    ])
  })

  it('keeps single-dollar formulas inline', () => {
    expect(blocks('a $x$ b')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a ' },
          { type: 'math_inline', attrs: { latex: 'x', displayMode: false } },
          { type: 'text', text: ' b' },
        ],
      },
    ])
  })
})
