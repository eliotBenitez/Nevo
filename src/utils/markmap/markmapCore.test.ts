import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { normalizeMarkmapKatexContent, transformMarkmap } from './markmapCore'

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

  it('removes unsafe HTML from transformed node labels without losing formatting', async () => {
    const { root } = await transformMarkmap('# Root\n- <img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><em>ok</em>')
    const content = JSON.stringify(root)

    expect(content).not.toContain('onerror')
    expect(content).not.toContain('javascript:')
    expect(content).toContain('<em>ok</em>')
    expect(content).toContain('bad')
  })

  it('retains MathML in transformed KaTeX labels', async () => {
    const { root } = await transformMarkmap('# Root\n- $x^2$')
    const content = JSON.stringify(root)

    expect(content).toContain('nv-markmap-katex-mathml')
    expect(content).toContain('<math')
    // The TeX source in <annotation> must not leak as visible text.
    expect(content).not.toContain('x^2')
  })
})
