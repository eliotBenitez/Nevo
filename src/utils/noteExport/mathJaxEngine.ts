/**
 * Shared lazy MathJax v4 engine for SVG math rendering in export paths
 * (docx/PDF rasterization and markmap embedding).
 *
 * Notes from the mathjax-full v3 → @mathjax/src v4 migration:
 * - v4 removed `AllPackages`; every TeX package configuration is imported
 *   explicitly and registers itself by side effect, mirroring the old module.
 * - Supplementary glyph ranges (accented Latin, Cyrillic, …) ship as dynamic
 *   files loaded through `mathjax.asyncLoad`, which cannot resolve inside a
 *   bundled app. They are marked as resolved-but-empty up front so conversion
 *   degrades those rare characters to `<text>` fallbacks instead of failing
 *   the whole formula.
 * - Output may be asynchronous, so conversion is wrapped in
 *   `mathjax.handleRetriesFor`.
 */

import '@mathjax/src/js/input/tex/base/BaseConfiguration.js'
import '@mathjax/src/js/input/tex/action/ActionConfiguration.js'
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js'
import '@mathjax/src/js/input/tex/amscd/AmsCdConfiguration.js'
import '@mathjax/src/js/input/tex/bbox/BboxConfiguration.js'
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js'
import '@mathjax/src/js/input/tex/braket/BraketConfiguration.js'
import '@mathjax/src/js/input/tex/bussproofs/BussproofsConfiguration.js'
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js'
import '@mathjax/src/js/input/tex/cases/CasesConfiguration.js'
import '@mathjax/src/js/input/tex/centernot/CenternotConfiguration.js'
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js'
import '@mathjax/src/js/input/tex/colorv2/ColorV2Configuration.js'
import '@mathjax/src/js/input/tex/colortbl/ColortblConfiguration.js'
import '@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js'
import '@mathjax/src/js/input/tex/empheq/EmpheqConfiguration.js'
import '@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js'
import '@mathjax/src/js/input/tex/extpfeil/ExtpfeilConfiguration.js'
import '@mathjax/src/js/input/tex/gensymb/GensymbConfiguration.js'
import '@mathjax/src/js/input/tex/html/HtmlConfiguration.js'
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js'
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js'
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js'
import '@mathjax/src/js/input/tex/noerrors/NoErrorsConfiguration.js'
import '@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js'
import '@mathjax/src/js/input/tex/setoptions/SetOptionsConfiguration.js'
import '@mathjax/src/js/input/tex/tagformat/TagFormatConfiguration.js'
import '@mathjax/src/js/input/tex/textcomp/TextcompConfiguration.js'
import '@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js'
import '@mathjax/src/js/input/tex/upgreek/UpgreekConfiguration.js'
import '@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js'
import '@mathjax/src/js/input/tex/verb/VerbConfiguration.js'

type RenderFn = (latex: string, display: boolean) => Promise<string>

// Mirrors mathjax-full v3's AllPackages so formulas that rendered before the
// v4 migration keep rendering.
const TEX_PACKAGES: string[] = [
  'base',
  'action',
  'ams',
  'amscd',
  'bbox',
  'boldsymbol',
  'braket',
  'bussproofs',
  'cancel',
  'cases',
  'centernot',
  'color',
  'colortbl',
  'empheq',
  'enclose',
  'extpfeil',
  'gensymb',
  'html',
  'mathtools',
  'mhchem',
  'newcommand',
  'noerrors',
  'noundefined',
  'upgreek',
  'unicode',
  'verb',
  'configmacros',
  'tagformat',
  'textcomp',
  'textmacros',
]

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
        { DefaultFont },
      ] = await Promise.all([
        import('@mathjax/src/js/mathjax.js'),
        import('@mathjax/src/js/input/tex.js'),
        import('@mathjax/src/js/output/svg.js'),
        import('@mathjax/src/js/adaptors/liteAdaptor.js'),
        import('@mathjax/src/js/handlers/html.js'),
        import('@mathjax/src/js/output/svg/DefaultFont.js'),
      ])
      // The bundled app has no `mathjax.asyncLoad`, so dynamic font files would
      // reject and abort conversion of any formula containing one of their
      // characters. Pre-settle them with empty data: the retry then completes
      // and those characters fall back to unknown-char rendering.
      const font = new DefaultFont() as unknown as {
        CLASS: { dynamicFiles: Record<string, { promise: Promise<void> | null; setup: (font: unknown) => void }> }
      }
      for (const file of Object.values(font.CLASS.dynamicFiles)) {
        file.promise = Promise.resolve()
        file.setup = () => {}
      }
      const adaptor = liteAdaptor()
      RegisterHTMLHandler(adaptor)
      const tex = new TeX({ packages: TEX_PACKAGES })
      // fontCache: 'none' inlines glyph paths into each SVG so it is fully
      // self-contained when rasterized or embedded.
      const svg = new SVG({ fontCache: 'none' })
      const doc = mathjax.document('', { InputJax: tex, OutputJax: svg })
      return async (latex: string, display: boolean): Promise<string> => {
        const node = await mathjax.handleRetriesFor(() => doc.convert(latex, { display }))
        return adaptor.outerHTML(node)
      }
    })()
  }
  return enginePromise
}

/**
 * Render a LaTeX string to standalone `<svg>…</svg>` markup, or null on
 * empty/invalid input. Glyphs keep MathJax's `currentColor` fill — callers
 * recolour as needed for their export target.
 */
export async function renderTexToSvgMarkup(latex: string, display: boolean): Promise<string | null> {
  const tex = latex.trim()
  if (!tex) return null
  try {
    const render = await loadEngine()
    const html = await render(tex, display)
    const match = /<svg[\s\S]*<\/svg>/.exec(html)
    return match ? match[0] : null
  } catch {
    return null
  }
}