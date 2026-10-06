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

  it('supports the explicitly listed TeX packages (mhchem)', async () => {
    // AllPackages was removed in MathJax v4; the package list is now explicit.
    // A missing package would render an error placeholder instead of glyphs.
    const svg = await renderMathToSvg('\\ce{H2O}', false)
    expect(svg).toBeTruthy()
    expect(svg!).toContain('<path')
  })

  it('renders Greek letters and large operators', async () => {
    const svg = await renderMathToSvg('\\alpha\\beta\\sum_{i=1}^n i^2', false)
    expect(svg).toBeTruthy()
    expect(svg!).toContain('<path')
  })

  it('degrades characters from unloaded dynamic font ranges instead of failing', async () => {
    // Cyrillic/accented glyphs live in MathJax v4 dynamic font files that a
    // bundled app cannot load; conversion must still produce an SVG with a
    // text fallback rather than throw.
    const svg = await renderMathToSvg('\\text{привет}', false)
    expect(svg).toBeTruthy()
  })
})
