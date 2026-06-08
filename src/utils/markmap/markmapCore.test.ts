import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { normalizeMarkmapKatexContent } from './markmapCore'

describe('markmapCore', () => {
  it('normalizes KaTeX labels to MathML-only content for SVG foreignObject', () => {
    const katexHtml = katex.renderToString('x = {-b \\pm \\sqrt{b^2-4ac} \\over 2a}', { throwOnError: false })
    const content = `Katex: ${katexHtml}`

    const normalized = normalizeMarkmapKatexContent(content)

    expect(normalized).toContain('Katex:')
    expect(normalized).toContain('nv-markmap-katex-mathml')
    expect(normalized).toContain('<math')
    expect(normalized).not.toContain('katex-html')
    expect(normalized).not.toContain('<svg')
  })
})
