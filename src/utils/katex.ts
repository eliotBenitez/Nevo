import katex from 'katex'
import type { KatexOptions, StrictFunction } from 'katex'

const strict: StrictFunction = (errorCode) => {
  if (errorCode === 'newLineInDisplayMode') return 'ignore'
  return 'warn'
}

export function renderKatexToString(latex: string, options: KatexOptions): string {
  return katex.renderToString(latex, { ...options, strict })
}
