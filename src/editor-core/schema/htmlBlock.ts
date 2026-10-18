export const HTML_BLOCK_DEFAULT_HEIGHT = 240
export const HTML_BLOCK_MIN_HEIGHT = 60
export const HTML_BLOCK_MAX_HEIGHT = 2000
export const HTML_BLOCK_DEFAULT_CODE = '<div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px;">Hello, HTML</div>'

export function clampHtmlBlockHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return HTML_BLOCK_DEFAULT_HEIGHT
  return Math.min(HTML_BLOCK_MAX_HEIGHT, Math.max(HTML_BLOCK_MIN_HEIGHT, Math.round(value)))
}
