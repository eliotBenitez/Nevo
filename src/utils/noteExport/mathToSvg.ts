/**
 * mathToSvg — рендер LaTeX в SVG через MathJax (нативные глифы <path>, без
 * foreignObject). В отличие от KaTeX-HTML такой SVG корректно растеризуется в
 * PNG на всех платформах (важно для WebKitGTK на Linux) и пригоден для вставки
 * в .docx картинкой. Движок MathJax загружается лениво (см. mathJaxEngine.ts)
 * и работает без DOM (liteAdaptor), поэтому доступен и в тестовой среде.
 */

/** Render a LaTeX string to a standalone SVG, or null on empty/invalid input. */
export async function renderMathToSvg(latex: string, display: boolean): Promise<string | null> {
  try {
    // Dynamic import keeps the whole MathJax graph out of the docx chunk and
    // in its own lazy chunk (see build-tools/check-bundle-size.mjs).
    const { renderTexToSvgMarkup } = await import('./mathJaxEngine')
    const svg = await renderTexToSvgMarkup(latex, display)
    if (!svg) return null
    // Replace every `currentColor` with an explicit black. MathJax fills glyphs
    // with `currentColor`, which has no resolvable context once the SVG is loaded
    // as a bare <img> for canvas rasterization — WebKitGTK then paints the glyphs
    // invisibly. A literal colour guarantees they show on the white page.
    return svg
      .replace('<svg ', '<svg color="#000000" ')
      .replace(/currentColor/g, '#000000')
  } catch {
    return null
  }
}