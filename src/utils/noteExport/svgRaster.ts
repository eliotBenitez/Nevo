/**
 * svgRaster — растеризация SVG в PNG через webview-canvas и извлечение размеров.
 * Используется экспортом рисунка (.png) и экспортом в .docx (диаграммы/формулы
 * вставляются растром, т.к. Word не рендерит SVG надёжно во всех версиях).
 *
 * Работает только в окружении с DOM (webview). В юнит-тестах вызовы
 * растеризации заглушаются.
 */

export interface RasterPng {
  data: Uint8Array
  width: number
  height: number
}

function parseLength(value: string): number {
  const match = /^([\d.]+)\s*(ex|em|pt|px|%)?$/.exec(value.trim())
  if (!match) return 0
  const num = Number(match[1])
  if (!Number.isFinite(num)) return 0
  switch (match[2]) {
    // MathJax emits ex/em; convert to px with the default 8px ex / 16px em.
    case 'ex': return num * 8
    case 'em': return num * 16
    case 'pt': return num * (96 / 72)
    default: return num
  }
}

/** Best-effort intrinsic size of an SVG document from its root attrs or viewBox. */
export function extractSvgSize(svg: string): { width: number; height: number } {
  const head = svg.slice(0, svg.indexOf('>') + 1)
  const w = /\bwidth="([^"]+)"/.exec(head)?.[1]
  const h = /\bheight="([^"]+)"/.exec(head)?.[1]
  const wp = w ? parseLength(w) : 0
  const hp = h ? parseLength(h) : 0
  if (wp > 0 && hp > 0) return { width: wp, height: hp }
  const vb = /viewBox="([-\d.\s]+)"/.exec(head)?.[1]
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] }
    }
  }
  return { width: 600, height: 400 }
}

/** Force explicit pixel width/height on the SVG root so <img> rasterizes at a
 *  predictable size regardless of unit-based (ex/em) intrinsic sizing. */
function withPixelSize(svg: string, width: number, height: number): string {
  const close = svg.indexOf('>')
  if (close < 0) return svg
  let head = svg.slice(0, close)
  head = head.replace(/\s(width|height)="[^"]*"/g, '')
  head += ` width="${width}" height="${height}"`
  return head + svg.slice(close)
}

export function svgToPngBlob(svgString: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas 2D context not available'))
        return
      }
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (blob) resolve(blob)
        else reject(new Error('Failed to generate PNG blob'))
      }, 'image/png')
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

/** Rasterize an SVG string to PNG bytes, inferring its size automatically. */
export async function rasterizeSvgToPng(svg: string): Promise<RasterPng | null> {
  if (!svg.trim()) return null
  try {
    const { width, height } = extractSvgSize(svg)
    const sized = withPixelSize(svg, width, height)
    const blob = await svgToPngBlob(sized, width, height)
    const data = new Uint8Array(await blob.arrayBuffer())
    return { data, width, height }
  } catch {
    return null
  }
}
