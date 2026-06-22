import { describe, expect, it } from 'vitest'
import { renderMathToSvg } from './mathToSvg'

describe('renderMathToSvg', () => {
  it('returns null for empty input', async () => {
    expect(await renderMathToSvg('   ', false)).toBeNull()
  })

  it('renders a standalone SVG with explicit colour glyphs (no currentColor)', async () => {
    const svg = await renderMathToSvg('x^2 + \\frac{1}{2}', false)
    expect(svg).toBeTruthy()
    // currentColor has no context once the SVG is rasterized as a bare <img>;
    // glyphs must carry a literal colour so they stay visible after export.
    expect(svg!).not.toContain('currentColor')
    expect(svg!).toContain('#000000')
    expect(svg!).toMatch(/<svg[\s\S]*<\/svg>/)
  })

  it('renders display math', async () => {
    const svg = await renderMathToSvg('\\int_0^1 x^2\\,dx', true)
    expect(svg).toBeTruthy()
    expect(svg!).not.toContain('currentColor')
  })
})
