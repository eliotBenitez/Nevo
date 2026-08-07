import { createDefaultCanvasFrame, DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, MIN_FRAME_WIDTH, migrateLayoutsToFrame } from './frame'
import { isCanvasFontFamily } from './fonts'
import { parseLegacyLayouts } from './legacy'
import { finite, optionalColor, optionalId, record, size, text } from './primitives'
import { normalizeCanvasRichText } from './richText'
import {
  CANVAS_DOCUMENT_FRAME_ID,
  CANVAS_SNAPSHOT_VERSION,
  type CanvasConnector,
  type CanvasConnectorBinding,
  type CanvasConnectorEndpoint,
  type CanvasDocumentFrame,
  type CanvasElement,
  type CanvasElementStyle,
  type CanvasPoint,
  type CanvasSnapshotV1,
} from './types'

const MAX_STROKE_POINTS = 20_000

function normalizeStyle(value: unknown): CanvasElementStyle | undefined {
  const source = record(value)
  if (!source) return undefined
  const style: CanvasElementStyle = {}
  const fill = optionalColor(source.fill)
  const stroke = optionalColor(source.stroke)
  const textColor = optionalColor(source.textColor)
  if (fill) style.fill = fill
  if (stroke) style.stroke = stroke
  if (source.strokeWidth !== undefined) style.strokeWidth = finite(source.strokeWidth, 1, 0, 100)
  if (source.opacity !== undefined) style.opacity = finite(source.opacity, 1, 0, 1)
  if (source.fontSize !== undefined) style.fontSize = finite(source.fontSize, 16, 8, 160)
  if (textColor) style.textColor = textColor
  if (['left', 'center', 'right'].includes(String(source.textAlign))) {
    style.textAlign = source.textAlign as CanvasElementStyle['textAlign']
  }
  // Only an allowlisted key may pass through — an arbitrary string here would
  // reach a `font-family` SVG/HTML attribute and exported SVG unescaped.
  if (isCanvasFontFamily(source.fontFamily)) style.fontFamily = source.fontFamily
  return Object.keys(style).length ? style : undefined
}

export function normalizeFrame(value: unknown): CanvasDocumentFrame {
  const source = record(value)
  if (!source) return createDefaultCanvasFrame()
  const frame: CanvasDocumentFrame = {
    x: finite(source.x),
    y: finite(source.y),
    width: Math.max(MIN_FRAME_WIDTH, size(source.width, DEFAULT_FRAME_WIDTH)),
    height: size(source.height, DEFAULT_FRAME_HEIGHT),
    zIndex: finite(source.zIndex, 0, -100_000, 100_000),
  }
  if (source.locked === true) frame.locked = true
  frame.autoHeight = source.autoHeight === false ? false : true
  if (source.collapsed === true) frame.collapsed = true
  return frame
}

function normalizePoints(value: unknown): CanvasPoint[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_STROKE_POINTS).flatMap((candidate) => {
    const point = record(candidate)
    if (!point) return []
    const pressure = point.pressure === undefined ? undefined : finite(point.pressure, 0.5, 0, 1)
    return [{ x: finite(point.x), y: finite(point.y), ...(pressure === undefined ? {} : { pressure }) }]
  })
}

function normalizeElement(value: unknown, key: string): CanvasElement | null {
  const source = record(value)
  const id = optionalId(source?.id) ?? optionalId(key)
  const kind = source?.kind
  if (!source || !id || !['shape', 'text', 'image', 'note', 'note-link', 'frame', 'freehand', 'highlighter'].includes(String(kind))) return null
  const normalizedKind = String(kind) as CanvasElement['kind']
  const isStroke = normalizedKind === 'freehand' || normalizedKind === 'highlighter'

  const base = {
    id,
    x: finite(source.x),
    y: finite(source.y),
    width: isStroke ? finite(source.width, 180, 1, 20_000) : size(source.width, 180),
    height: isStroke ? finite(source.height, 120, 1, 20_000) : size(source.height, 120),
    zIndex: finite(source.zIndex, 0, -100_000, 100_000),
  }
  const rotation = finite(source.rotation, 0, -360, 360)
  const locked = source.locked === true ? true : undefined
  const groupId = optionalId(source.groupId)
  const style = normalizeStyle(source.style)
  const optional = {
    ...(rotation ? { rotation } : {}),
    ...(locked ? { locked } : {}),
    ...(groupId ? { groupId } : {}),
    ...(style ? { style } : {}),
  }

  if (normalizedKind === 'shape') {
    const shape = ['rectangle', 'ellipse', 'diamond'].includes(String(source.shape))
      ? source.shape as 'rectangle' | 'ellipse' | 'diamond'
      : 'rectangle'
    const mindMapSource = record(source.mindMap)
    const mapId = optionalId(mindMapSource?.mapId)
    const parentId = optionalId(mindMapSource?.parentId)
    const mindMap = mapId
      ? { mapId, ...(parentId ? { parentId } : {}), rank: finite(mindMapSource?.rank, 0, 0, 100_000) }
      : undefined
    return {
      ...base,
      ...optional,
      kind: normalizedKind,
      shape,
      ...(text(source.text) ? { text: text(source.text) } : {}),
      ...(mindMap ? { mindMap } : {}),
    }
  }
  if (normalizedKind === 'text') return { ...base, ...optional, kind: normalizedKind, text: text(source.text) }
  if (normalizedKind === 'image') {
    const src = text(source.src, 4096).trim()
    if (!src) return null
    const alt = text(source.alt, 1000)
    return { ...base, ...optional, kind: normalizedKind, src, ...(alt ? { alt } : {}) }
  }
  if (normalizedKind === 'note') {
    return { ...base, ...optional, kind: normalizedKind, content: normalizeCanvasRichText(source.content) }
  }
  if (normalizedKind === 'note-link') {
    const noteId = optionalId(source.noteId)
    if (!noteId) return null
    const title = text(source.title, 1000)
    const icon = text(source.icon, 32)
    return {
      ...base,
      ...optional,
      kind: normalizedKind,
      noteId,
      title,
      ...(icon ? { icon } : {}),
    }
  }
  if (normalizedKind === 'frame') {
    return {
      ...base,
      ...optional,
      kind: normalizedKind,
      title: text(source.title, 1000),
      presentationOrder: finite(source.presentationOrder, 0, 0, 100_000),
    }
  }
  const points = normalizePoints(source.points)
  if (points.length < 2) return null
  return { ...base, ...optional, kind: normalizedKind, points }
}

/** `target === 'block'` bindings are always retargeted onto the single
 *  document frame rather than dropped — legacy per-block ids no longer exist,
 *  but the connector (and its endpoint coordinates) must survive migration. */
function normalizeBinding(
  value: unknown,
  validElementIds: ReadonlySet<string>,
): CanvasConnectorBinding | undefined {
  const source = record(value)
  const target = source?.target
  const targetId = optionalId(source?.targetId)
  if (!source || !targetId || (target !== 'block' && target !== 'element')) return undefined
  if (target === 'element' && !validElementIds.has(targetId)) return undefined
  const side = ['top', 'right', 'bottom', 'left'].includes(String(source.side))
    ? source.side as CanvasConnectorBinding['side']
    : undefined
  if (target === 'block') return { target, targetId: CANVAS_DOCUMENT_FRAME_ID, ...(side ? { side } : {}) }
  return { target, targetId, ...(side ? { side } : {}) }
}

function normalizeEndpoint(
  value: unknown,
  validElementIds: ReadonlySet<string>,
): CanvasConnectorEndpoint {
  const source = record(value)
  const binding = normalizeBinding(source?.binding, validElementIds)
  return {
    x: finite(source?.x),
    y: finite(source?.y),
    ...(binding ? { binding } : {}),
  }
}

function normalizeConnector(
  value: unknown,
  key: string,
  validElementIds: ReadonlySet<string>,
): CanvasConnector | null {
  const source = record(value)
  const id = optionalId(source?.id) ?? optionalId(key)
  if (!source || !id) return null
  const routing = ['straight', 'orthogonal', 'bezier'].includes(String(source.routing))
    ? source.routing as CanvasConnector['routing']
    : 'straight'
  const color = optionalColor(source.color)
  const label = text(source.label, 1000)
  const startCap = ['none', 'arrow', 'dot'].includes(String(source.startCap))
    ? source.startCap as CanvasConnector['startCap']
    : undefined
  const endCap = ['none', 'arrow', 'dot'].includes(String(source.endCap))
    ? source.endCap as CanvasConnector['endCap']
    : undefined
  return {
    id,
    from: normalizeEndpoint(source.from, validElementIds),
    to: normalizeEndpoint(source.to, validElementIds),
    routing,
    zIndex: finite(source.zIndex, 0, -100_000, 100_000),
    ...(color ? { color } : {}),
    ...(source.width !== undefined ? { width: finite(source.width, 2, 0.25, 100) } : {}),
    ...(label ? { label } : {}),
    ...(startCap ? { startCap } : {}),
    ...(endCap ? { endCap } : {}),
  }
}

export function emptyCanvasSnapshot(): CanvasSnapshotV1 {
  return {
    version: CANVAS_SNAPSHOT_VERSION,
    frame: createDefaultCanvasFrame(),
    elements: {},
    connectors: {},
    order: [],
  }
}

export function normalizeCanvasSnapshot(value: unknown): CanvasSnapshotV1 | null {
  const source = record(value)
  if (!source || source.version !== CANVAS_SNAPSHOT_VERSION) return null

  const elements: Record<string, CanvasElement> = {}
  const sourceElements = record(source.elements) ?? {}
  for (const [key, candidate] of Object.entries(sourceElements)) {
    const element = normalizeElement(candidate, key)
    if (element) elements[element.id] = element
  }

  const elementIds = new Set(Object.keys(elements))
  const connectors: Record<string, CanvasConnector> = {}
  const sourceConnectors = record(source.connectors) ?? {}
  for (const [key, candidate] of Object.entries(sourceConnectors)) {
    const connector = normalizeConnector(candidate, key, elementIds)
    if (connector) connectors[connector.id] = connector
  }

  const frame = source.frame !== undefined
    ? normalizeFrame(source.frame)
    : migrateLayoutsToFrame(parseLegacyLayouts(source.layouts)) ?? createDefaultCanvasFrame()

  const knownIds = new Set([CANVAS_DOCUMENT_FRAME_ID, ...Object.keys(elements), ...Object.keys(connectors)])
  const order = Array.isArray(source.order)
    ? source.order.flatMap((id) => {
        const valueId = optionalId(id)
        return valueId && knownIds.has(valueId) ? [valueId] : []
      }).filter((id, index, all) => all.indexOf(id) === index)
    : []
  for (const id of knownIds) if (!order.includes(id)) order.push(id)

  return { version: CANVAS_SNAPSHOT_VERSION, frame, elements, connectors, order }
}
