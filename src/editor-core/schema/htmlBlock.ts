export const HTML_BLOCK_DEFAULT_HEIGHT = 240
export const HTML_BLOCK_MIN_HEIGHT = 60
export const HTML_BLOCK_MAX_HEIGHT = 2000
export const HTML_BLOCK_DEFAULT_CODE = '<div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px;">Hello, HTML</div>'

export function clampHtmlBlockHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return HTML_BLOCK_DEFAULT_HEIGHT
  return Math.min(HTML_BLOCK_MAX_HEIGHT, Math.max(HTML_BLOCK_MIN_HEIGHT, Math.round(value)))
}

// Prepended to every srcdoc: the sandbox blocks scripts, this blocks remote loads (tracking pixels, url()).
export const HTML_BLOCK_CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">`

// Info-string marker of a fenced ```html block that is an html_block, not plain code.
export const HTML_BLOCK_MD_META = 'nevo-html-block'
