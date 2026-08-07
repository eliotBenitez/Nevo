import { describe, expect, it } from 'vitest'
import { latexToTypstMath } from './latexToTypstMath'

type AccentFunctionCase = readonly [command: string, typstFunction: string]
type AccentSymbolCase = readonly [command: string, symbol: string]
type AccentAttachmentCase = readonly [command: string, symbol: string]

const ACCENT_FUNCTION_CASES: AccentFunctionCase[] = [
  ['acute', 'acute'],
  ['grave', 'grave'],
  ['ddot', 'dot.double'],
  ['tilde', 'tilde'],
  ['bar', 'macron'],
  ['breve', 'breve'],
  ['check', 'caron'],
  ['hat', 'hat'],
  ['vec', 'arrow'],
  ['dot', 'dot'],
  ['mathring', 'circle'],
  ['widecheck', 'caron'],
  ['widehat', 'hat'],
  ['widetilde', 'tilde'],
  ['overline', 'overline'],
  ['underline', 'underline'],
  ['overbrace', 'overbrace'],
  ['underbrace', 'underbrace'],
  ['overbracket', 'overbracket'],
  ['underbracket', 'underbracket'],
  ['overlinesegment', 'overline'],
  ['underlinesegment', 'underline'],
]

const ACCENT_SYMBOL_CASES: AccentSymbolCase[] = [
  ['overrightarrow', '→'],
  ['overleftarrow', '←'],
  ['overleftrightarrow', '↔'],
  ['overgroup', '⏠'],
  ['overleftharpoon', '↼'],
  ['overrightharpoon', '⇀'],
  ['underleftarrow', '\u20ee'],
  ['underrightarrow', '\u20ef'],
  ['underleftrightarrow', '\u034d'],
  ['undergroup', '⏡'],
  ['utilde', '\u0330'],
]

const ACCENT_ATTACHMENT_CASES: AccentAttachmentCase[] = [
  ['Overrightarrow', '⟹'],
]

describe('latexToTypstMath accent compatibility', () => {
  it.each(ACCENT_FUNCTION_CASES)(
    'maps \\%s to the Typst %s function',
    (command, typstFunction) => {
      expect(latexToTypstMath(`\\${command}{A B}`)).toBe(`${typstFunction}(A B)`)
    },
  )

  it.each(ACCENT_SYMBOL_CASES)(
    'maps \\%s to a Typst accent with %s',
    (command, symbol) => {
      expect(latexToTypstMath(`\\${command}{A B}`)).toBe(`accent(A B, "${symbol}")`)
    },
  )

  it.each(ACCENT_ATTACHMENT_CASES)(
    'maps \\%s to a centered Typst attachment with %s',
    (command, symbol) => {
      expect(latexToTypstMath(`\\${command}{A B}`))
        .toBe(`attach(limits(A B), t: ${symbol})`)
    },
  )

  it('supports shorthand, nesting, and missing arguments', () => {
    expect(latexToTypstMath('\\bar x')).toBe('macron(x)')
    expect(latexToTypstMath('\\hat{\\bar{x}}')).toBe('hat(macron(x))')
    expect(latexToTypstMath('\\bar')).toBe('macron("")')
    expect(latexToTypstMath('\\hat{}')).toBe('hat("")')
  })
})
