import { describe, expect, it } from 'vitest'
import { latexToTypstMath } from './latexToTypstMath'

describe('latexToTypstMath', () => {
  it('converts fractions recursively', () => {
    expect(latexToTypstMath('\\frac{1}{2}')).toBe('frac(1, 2)')
    expect(latexToTypstMath('\\frac{a+b}{\\frac{c}{d}}')).toBe('frac(a+b, frac(c, d))')
  })

  it('converts roots', () => {
    expect(latexToTypstMath('\\sqrt{x}')).toBe('sqrt(x)')
    expect(latexToTypstMath('\\sqrt[3]{x}')).toBe('root(3, x)')
  })

  it('converts sub/superscripts with braces to parens', () => {
    expect(latexToTypstMath('x^{2}')).toBe('x^(2)')
    expect(latexToTypstMath('a_{i}')).toBe('a_(i)')
    expect(latexToTypstMath('x^2')).toBe('x^(2)')
  })

  it('maps common operators and greek', () => {
    expect(latexToTypstMath('\\alpha + \\beta')).toBe('alpha + beta')
    expect(latexToTypstMath('a \\cdot b')).toBe('a dot.op b')
    expect(latexToTypstMath('x \\le y')).toBe('x <= y')
    expect(latexToTypstMath('\\infty')).toBe('infinity')
  })

  it('maps styling commands to typst math functions', () => {
    expect(latexToTypstMath('\\mathbf{x}')).toBe('bold(x)')
    expect(latexToTypstMath('\\mathbb{R}')).toBe('bb(R)')
    expect(latexToTypstMath('\\text{hello}')).toBe('"hello"')
  })

  it('degrades unknown commands to quoted text instead of crashing', () => {
    expect(latexToTypstMath('\\subseteq')).toBe('subset.eq')
    expect(latexToTypstMath('\\foobarbaz')).toBe('"foobarbaz"')
  })
})
