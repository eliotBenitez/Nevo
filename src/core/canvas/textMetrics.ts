import { canvasFontStack, type CanvasFontFamily } from './fonts'

export interface CanvasTextSize {
  width: number
  height: number
}

/** Matches the `dy` factor CanvasSvgLayer already uses for multi-line `tspan`s. */
const LINE_HEIGHT = 1.3

const PADDING_X = 16
const PADDING_Y = 12
const MIN_WIDTH = 40
const MIN_HEIGHT = 32

let measureContext: CanvasRenderingContext2D | null | undefined

/** Lazily creates and caches a detached 2D context for text measurement.
 *  Returns null (and stays null) when no DOM is available, e.g. in unit
 *  tests or other non-browser environments. Never throws. */
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) return measureContext
  if (typeof document === 'undefined') {
    measureContext = null
    return measureContext
  }
  try {
    measureContext = document.createElement('canvas').getContext('2d')
  } catch {
    measureContext = null
  }
  return measureContext
}

function measureLineWidth(line: string, fontSize: number, fontFamily?: CanvasFontFamily): number {
  const context = getMeasureContext()
  if (context) {
    context.font = `${fontSize}px ${canvasFontStack(fontFamily)}`
    return context.measureText(line).width
  }
  // No-DOM fallback: a rough per-character approximation.
  return line.length * fontSize * 0.6
}

export function measureCanvasText(
  text: string,
  style: { fontSize?: number; fontFamily?: CanvasFontFamily },
): CanvasTextSize {
  const fontSize = style.fontSize ?? 16
  const lines = text.split(/\r?\n/)
  const width = Math.max(0, ...lines.map(line => measureLineWidth(line, fontSize, style.fontFamily)))
  const height = lines.length * fontSize * LINE_HEIGHT
  return { width, height }
}

/** Text elements are content-sized: this is what callers should use to keep
 *  an element's box matching its text. A manual resize of a text element is
 *  superseded the next time its text or font changes — that's intended. */
export function textElementSize(
  text: string,
  style: { fontSize?: number; fontFamily?: CanvasFontFamily },
): CanvasTextSize {
  const measured = measureCanvasText(text, style)
  return {
    width: Math.max(MIN_WIDTH, Math.round(measured.width + PADDING_X)),
    height: Math.max(MIN_HEIGHT, Math.round(measured.height + PADDING_Y)),
  }
}
