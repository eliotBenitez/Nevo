import { connectorPath, unionBounds } from './geometry'
import { connectorMidpoint } from './connectors'
import { canvasFontStack } from './fonts'
import { strokeOutlinePath } from './strokes'
import { canvasRichTextLines } from './richText'
import { CANVAS_DOCUMENT_FRAME_ID, type CanvasBounds, type CanvasSnapshotV1 } from './types'

export type CanvasExportScope = 'all' | 'selection' | 'viewport'

export interface CanvasExportDocument {
  title: string
  lines: string[]
}

export interface CanvasSvgExportOptions {
  scope: CanvasExportScope
  selectionIds?: readonly string[]
  viewport?: CanvasBounds
  document?: CanvasExportDocument
  padding?: number
  resolveAssetSrc?: (src: string) => string | null
}

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function safeImageHref(value: string): string {
  return /^(?:data:image\/|blob:|https?:|asset:|cloud-asset:|\.nevo\/)/i.test(value) ? value : ''
}

function exportBounds(snapshot: CanvasSnapshotV1, options: CanvasSvgExportOptions): CanvasBounds {
  if (options.scope === 'viewport' && options.viewport) return options.viewport
  const selected = new Set(options.selectionIds ?? [])
  const includeFrame = options.scope !== 'selection' || selected.has(CANVAS_DOCUMENT_FRAME_ID)
  const elements = Object.values(snapshot.elements)
    .filter(element => options.scope !== 'selection' || selected.has(element.id))
  const connectors = Object.values(snapshot.connectors)
    .filter(connector => options.scope !== 'selection' || selected.has(connector.id))
    .map(connector => ({
      x: Math.min(connector.from.x, connector.to.x),
      y: Math.min(connector.from.y, connector.to.y),
      width: Math.max(1, Math.abs(connector.to.x - connector.from.x)),
      height: Math.max(1, Math.abs(connector.to.y - connector.from.y)),
    }))
  const items: CanvasBounds[] = includeFrame ? [snapshot.frame, ...elements, ...connectors] : [...elements, ...connectors]
  return unionBounds(items) ?? { x: 0, y: 0, width: 1, height: 1 }
}

function renderMultilineText(value: string, x: number, fontSize: number): string {
  return value.split('\n').map((line, index) =>
    `<tspan x="${x}" dy="${index === 0 ? 0 : fontSize * 1.3}">${xml(line)}</tspan>`,
  ).join('')
}

function richTextSpan(span: { text: string; marks?: string[] }): string {
  const marks = new Set(span.marks ?? [])
  const decoration = [
    marks.has('underline') ? 'underline' : '',
    marks.has('strike') ? 'line-through' : '',
  ].filter(Boolean).join(' ')
  return `<tspan${marks.has('bold') ? ' font-weight="700"' : ''}${marks.has('italic') ? ' font-style="italic"' : ''}${decoration ? ` text-decoration="${decoration}"` : ''}${marks.has('code') ? ' font-family="monospace"' : ''}>${xml(span.text)}</tspan>`
}

function renderRichNote(element: Extract<CanvasSnapshotV1['elements'][string], { kind: 'note' }>, transform: string): string {
  let y = 34
  const lines = canvasRichTextLines(element.content).slice(0, 18).map((block, index) => {
    const fontSize = block.type === 'heading' ? block.level === 1 ? 24 : block.level === 2 ? 20 : 17 : 15
    const prefix = block.type === 'bullet'
      ? '• '
      : block.type === 'number'
        ? `${index + 1}. `
        : block.type === 'todo'
          ? block.checked ? '☑ ' : '☐ '
          : block.type === 'quote'
            ? '│ '
            : ''
    const line = `<text x="18" y="${y}" fill="${xml(element.style?.textColor ?? '#2b2615')}" font-family="sans-serif" font-size="${fontSize}">${prefix ? `<tspan>${xml(prefix)}</tspan>` : ''}${block.spans.map(richTextSpan).join('')}</text>`
    y += fontSize * 1.45
    return line
  }).join('')
  return `<g transform="${transform}" opacity="${element.style?.opacity ?? 1}"><rect width="${element.width}" height="${element.height}" rx="14" fill="${xml(element.style?.fill ?? '#fff8c5')}" stroke="${xml(element.style?.stroke ?? '#e6c84f')}" stroke-width="${element.style?.strokeWidth ?? 1}"/>${lines}</g>`
}

function renderElement(snapshot: CanvasSnapshotV1, id: string, options: CanvasSvgExportOptions): string {
  const element = snapshot.elements[id]
  if (!element) return ''
  const fill = xml(element.style?.fill ?? '#ffffff')
  const stroke = xml(element.style?.stroke ?? '#64748b')
  const strokeWidth = element.style?.strokeWidth ?? 2
  const opacity = element.style?.opacity ?? 1
  const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0} ${element.width / 2} ${element.height / 2})`
  if (element.kind === 'shape') {
    const geometry = element.shape === 'ellipse'
      ? `<ellipse cx="${element.width / 2}" cy="${element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}"/>`
      : element.shape === 'diamond'
        ? `<path d="M ${element.width / 2} 0 L ${element.width} ${element.height / 2} L ${element.width / 2} ${element.height} L 0 ${element.height / 2} Z"/>`
        : `<rect width="${element.width}" height="${element.height}" rx="12"/>`
    const fontSize = element.style?.fontSize ?? 16
    const align = element.style?.textAlign ?? 'center'
    const textX = align === 'left' ? 10 : align === 'right' ? element.width - 10 : element.width / 2
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'
    const label = element.text
      ? `<text x="${textX}" y="${element.height / 2 - (element.text.split('\n').length - 1) * fontSize * 0.65}" text-anchor="${anchor}" dominant-baseline="middle" fill="${xml(element.style?.textColor ?? '#111827')}" font-size="${fontSize}" font-family="${xml(canvasFontStack(element.style?.fontFamily))}" stroke="none">${renderMultilineText(element.text, textX, fontSize)}</text>`
      : ''
    return `<g transform="${transform}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}">${geometry}${label}</g>`
  }
  if (element.kind === 'text') {
    const fontSize = element.style?.fontSize ?? 16
    return `<text transform="${transform}" x="0" y="${fontSize}" fill="${xml(element.style?.textColor ?? stroke)}" opacity="${opacity}" font-family="${xml(canvasFontStack(element.style?.fontFamily))}" font-size="${fontSize}">${renderMultilineText(element.text, 0, fontSize)}</text>`
  }
  if (element.kind === 'image') {
    const resolved = options.resolveAssetSrc ? options.resolveAssetSrc(element.src) ?? '' : element.src
    const href = safeImageHref(resolved)
    return href
      ? `<image transform="${transform}" href="${xml(href)}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`
      : `<g transform="${transform}"><rect width="${element.width}" height="${element.height}" fill="#e2e8f0"/><text x="12" y="24" fill="#475569">Image</text></g>`
  }
  if (element.kind === 'note') return renderRichNote(element, transform)
  if (element.kind === 'note-link') {
    return `<g transform="${transform}" opacity="${opacity}"><rect width="${element.width}" height="${element.height}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/><text x="18" y="34" font-size="22">${xml(element.icon ?? '📄')}</text><text x="54" y="34" fill="${xml(element.style?.textColor ?? '#111827')}" font-family="sans-serif" font-size="16" font-weight="700">${xml(element.title || 'Untitled')}</text><text x="54" y="62" fill="#64748b" font-family="sans-serif" font-size="12">${xml(element.noteId)}</text></g>`
  }
  if (element.kind === 'frame') {
    return `<g transform="${transform}" opacity="${opacity}"><rect width="${element.width}" height="${element.height}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="10 6"/><rect width="${Math.min(element.width, 260)}" height="34" rx="10" fill="${stroke}"/><text x="14" y="22" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="700">${element.presentationOrder + 1}. ${xml(element.title || 'Frame')}</text></g>`
  }
  const path = strokeOutlinePath(element.points, strokeWidth, element.kind === 'highlighter')
  return `<path d="${path}" fill="${stroke}" stroke="none" opacity="${opacity}"/>`
}

function renderDocumentCard(snapshot: CanvasSnapshotV1, document: CanvasExportDocument | undefined): string {
  const frame = snapshot.frame
  // Export is WYSIWYG: a collapsed frame is rendered on-screen as the mini
  // card (title + hint, no body), so the exported card draws only the title
  // and skips the document lines entirely.
  const lines = frame.collapsed
    ? [document?.title || 'Document']
    : (document?.lines.length ? document.lines : [document?.title || 'Document']).slice(0, 40)
  const text = lines.map((line, index) =>
    `<text x="${frame.x + 18}" y="${frame.y + 32 + index * 20}" fill="#111827" font-family="sans-serif" font-size="${index === 0 ? 16 : 14}">${xml(line.slice(0, 160))}</text>`,
  ).join('')
  return `<g><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="12" fill="#ffffff" stroke="#cbd5e1"/>${text}</g>`
}

export function buildCanvasSvg(snapshot: CanvasSnapshotV1, options: CanvasSvgExportOptions): string {
  const padding = options.padding ?? 32
  const bounds = exportBounds(snapshot, options)
  const selected = new Set(options.selectionIds ?? [])
  const include = (id: string) => options.scope !== 'selection' || selected.has(id)
  const includeFrame = options.scope !== 'selection' || selected.has(CANVAS_DOCUMENT_FRAME_ID)
  const width = Math.max(1, bounds.width + padding * 2)
  const height = Math.max(1, bounds.height + padding * 2)
  const viewBox = `${bounds.x - padding} ${bounds.y - padding} ${width} ${height}`

  const documentCard = includeFrame ? renderDocumentCard(snapshot, options.document) : ''
  const connectors = Object.values(snapshot.connectors)
    .filter(connector => include(connector.id))
    .map((connector) => {
      const midpoint = connectorMidpoint(connector.from, connector.to)
      const startMarker = connector.startCap === 'arrow' ? ' marker-start="url(#canvas-export-arrow)"' : connector.startCap === 'dot' ? ' marker-start="url(#canvas-export-dot)"' : ''
      const endCap = connector.endCap ?? 'arrow'
      const endMarker = endCap === 'arrow' ? ' marker-end="url(#canvas-export-arrow)"' : endCap === 'dot' ? ' marker-end="url(#canvas-export-dot)"' : ''
      const label = connector.label
        ? `<text x="${midpoint.x}" y="${midpoint.y - 8}" text-anchor="middle" fill="#111827" font-family="sans-serif" font-size="14">${xml(connector.label)}</text>`
        : ''
      return `<g><path d="${connectorPath(connector.from, connector.to, connector.routing)}" fill="none" stroke="${xml(connector.color ?? '#64748b')}" stroke-width="${connector.width ?? 2}"${startMarker}${endMarker}/>${label}</g>`
    })
    .join('')
  const elements = snapshot.order.filter(include).map(id => renderElement(snapshot, id, options)).join('')

  const markers = '<defs><marker id="canvas-export-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker><marker id="canvas-export-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle cx="5" cy="5" r="4" fill="context-stroke"/></marker></defs>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${markers}<rect x="${bounds.x - padding}" y="${bounds.y - padding}" width="${width}" height="${height}" fill="#f8fafc"/>${documentCard}${connectors}${elements}</svg>`
}
