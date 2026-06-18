import type { KatexOptions, StrictFunction } from 'katex'

const strict: StrictFunction = (errorCode) => {
  if (errorCode === 'newLineInDisplayMode') return 'ignore'
  return 'warn'
}

type KatexRenderer = { renderToString: (latex: string, options: KatexOptions) => string }

// KaTeX (~280KB JS + its CSS) is loaded lazily on first use so it stays out of the
// initial bundle. Callers that render synchronously (math node-view, HTML export)
// must ensure the module is loaded first via loadKatex()/isKatexLoaded().
let katex: KatexRenderer | null = null
let loadPromise: Promise<void> | null = null

export function isKatexLoaded(): boolean {
  return katex !== null
}

export function loadKatex(): Promise<void> {
  if (katex) return Promise.resolve()
  if (!loadPromise) {
    loadPromise = Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([mod]) => {
      katex = mod.default
    })
  }
  return loadPromise
}

export function renderKatexToString(latex: string, options: KatexOptions): string {
  if (!katex) throw new Error('KaTeX is not loaded yet; call loadKatex() first')
  return katex.renderToString(latex, { ...options, strict })
}
