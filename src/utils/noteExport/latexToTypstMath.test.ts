import { describe, expect, it } from 'vitest'
import { latexToTypstMath } from './latexToTypstMath'

describe('latexToTypstMath', () => {
  it('converts fractions recursively', () => {
    expect(latexToTypstMath('\\frac{1}{2}')).toBe('frac(1, 2)')
    expect(latexToTypstMath('\\frac{a+b}{\\frac{c}{d}}')).toBe('frac(a+b, frac(c, d))')
    expect(latexToTypstMath('\\frac12')).toBe('frac(1, 2)')
  })

  it('keeps incomplete fractions compile-safe', () => {
    expect(latexToTypstMath('\\frac{1}')).toBe('frac(1, "")')
    expect(latexToTypstMath('\\frac{}{}')).toBe('frac("", "")')
    expect(latexToTypstMath('\\frac{a}{\\frac{b}}')).toBe('frac(a, frac(b, ""))')
  })

  it('converts roots', () => {
    expect(latexToTypstMath('\\sqrt{x}')).toBe('sqrt(x)')
    expect(latexToTypstMath('\\sqrt[3]{x}')).toBe('root(3, x)')
    expect(latexToTypstMath('\\sqrt')).toBe('sqrt("")')
    expect(latexToTypstMath('\\sqrt[3]')).toBe('root(3, "")')
  })

  it('converts sub/superscripts with braces to parens', () => {
    expect(latexToTypstMath('x^{2}')).toBe('x^(2)')
    expect(latexToTypstMath('a_{i}')).toBe('a_(i)')
    expect(latexToTypstMath('x^2')).toBe('x^(2)')
  })

  it('adds an invisible base to orphaned scripts', () => {
    expect(latexToTypstMath('^2')).toBe('""^(2)')
    expect(latexToTypstMath(' _{i}')).toBe('""_(i)')
    expect(latexToTypstMath('{^2}')).toBe('(""^(2))')
  })

  it('maps common operators and greek', () => {
    expect(latexToTypstMath('\\alpha + \\beta')).toBe('α + β')
    expect(latexToTypstMath('a \\cdot b')).toBe('a ⋅ b')
    expect(latexToTypstMath('x \\le y')).toBe('x ≤ y')
    expect(latexToTypstMath('\\infty')).toBe('∞')
    expect(latexToTypstMath('\\partial f')).toBe('∂ f')
  })

  it('uses compile-safe symbols instead of version-sensitive Typst names', () => {
    expect(latexToTypstMath('A \\cap B')).toBe('A ∩ B')
    expect(latexToTypstMath('\\bigcap_i A_i')).toBe('⋂ _(i) A_(i)')
    expect(latexToTypstMath('\\oplus \\otimes \\odot')).toBe('⊕ ⊗ ⊙')
    expect(latexToTypstMath('\\langle x, y \\rangle')).toBe('⟨ x, y ⟩')
    expect(latexToTypstMath('\\hbar')).toBe('ℏ')
  })

  it('maps styling commands to typst math functions', () => {
    expect(latexToTypstMath('\\mathbf{x}')).toBe('bold(x)')
    expect(latexToTypstMath('\\mathbb{R}')).toBe('bb(R)')
    expect(latexToTypstMath('\\mathbf')).toBe('bold("")')
    expect(latexToTypstMath('\\text{hello}')).toBe('"hello"')
  })

  it('separates letters from following digits so typst sees distinct variables', () => {
    expect(latexToTypstMath('n2x')).toBe('n 2x')
    expect(latexToTypstMath('x2')).toBe('x 2')
    expect(latexToTypstMath('2x')).toBe('2x')
    expect(latexToTypstMath('12 + 3')).toBe('12 + 3')
    expect(latexToTypstMath('\\mathrm{n2x}')).toBe('upright(n 2x)')
    expect(latexToTypstMath('x_{1}y2')).toBe('x_(1)y 2')
    expect(latexToTypstMath('лог2')).toBe('л о г 2')
  })

  it('separates emitted typst functions from a preceding letter', () => {
    expect(latexToTypstMath('t\\mathbf{x}')).toBe('t bold(x)')
    expect(latexToTypstMath('x\\frac{1}{2}')).toBe('x frac(1, 2)')
    expect(latexToTypstMath('x\\sqrt{2}')).toBe('x sqrt(2)')
    expect(latexToTypstMath('x\\sqrt[3]{2}')).toBe('x root(3, 2)')
    expect(latexToTypstMath('2\\mathbf{x}')).toBe('2bold(x)')
  })

  it('degrades unknown commands to quoted text instead of crashing', () => {
    expect(latexToTypstMath('\\subseteq')).toBe('⊆')
    expect(latexToTypstMath('\\diff')).toBe('"diff"')
    expect(latexToTypstMath('\\foobarbaz')).toBe('"foobarbaz"')
  })
})
