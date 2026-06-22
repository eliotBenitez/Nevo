/**
 * mathToSvg — рендер LaTeX в SVG через MathJax (нативные глифы <path>, без
 * foreignObject). В отличие от KaTeX-HTML такой SVG корректно растеризуется в
 * PNG на всех платформах (важно для WebKitGTK на Linux) и пригоден для вставки
 * в .docx картинкой. Движок MathJax загружается лениво и работает без DOM
 * (liteAdaptor), поэтому доступен и в тестовой среде.
 */

type RenderFn = (latex: string, display: boolean) => string

let enginePromise: Promise<RenderFn> | null = null

async function loadEngine(): Promise<RenderFn> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [
        { mathjax },
        { TeX },
        { SVG },
        { liteAdaptor },
        { RegisterHTMLHandler },
        { AllPackages },
      ] = await Promise.all([
        import('mathjax-full/js/mathjax.js'),
        import('mathjax-full/js/input/tex.js'),
        import('mathjax-full/js/output/svg.js'),
        import('mathjax-full/js/adaptors/liteAdaptor.js'),
        import('mathjax-full/js/handlers/html.js'),
        import('mathjax-full/js/input/tex/AllPackages.js'),
      ])
      const adaptor = liteAdaptor()
      RegisterHTMLHandler(adaptor)
      const tex = new TeX({ packages: AllPackages })
      // fontCache: 'none' inlines glyph paths into each SVG so it is fully
      // self-contained when rasterized or embedded.
      const svg = new SVG({ fontCache: 'none' })
      const doc = mathjax.document('', { InputJax: tex, OutputJax: svg })
      return (latex: string, display: boolean): string => {
        const node = doc.convert(latex, { display })
        return adaptor.outerHTML(node)
      }
    })()
  }
  return enginePromise
}

/** Render a LaTeX string to a standalone SVG, or null on empty/invalid input. */
export async function renderMathToSvg(latex: string, display: boolean): Promise<string | null> {
  const tex = latex.trim()
  if (!tex) return null
  try {
    const render = await loadEngine()
    const html = render(tex, display)
    const match = /<svg[\s\S]*<\/svg>/.exec(html)
    if (!match) return null
    // Replace every `currentColor` with an explicit black. MathJax fills glyphs
    // with `currentColor`, which has no resolvable context once the SVG is loaded
    // as a bare <img> for canvas rasterization — WebKitGTK then paints the glyphs
    // invisibly. A literal colour guarantees they show on the white page.
    return match[0]
      .replace('<svg ', '<svg color="#000000" ')
      .replace(/currentColor/g, '#000000')
  } catch {
    return null
  }
}
