/**
 * drawEngineRenderer — логика генерации SVG-разметки для блока `draw_block`.
 * Рендерит штрихи через roughjs (hand-drawn геометрия) и perfect-freehand
 * (pressure-sensitive штрихи); текст — нативным `<text>` (корректно
 * растрируется на WebKitGTK). Библиотеки грузятся лениво, чтобы не утяжелять
 * стартовый бандл (по образцу mermaid/markmap).
 */

import {
  type DrawStroke,
  type DrawPoint,
  type DrawArrowShape,
  type DrawArrowCap,
  type DrawData,
  DEFAULT_ROUGHNESS,
  HIGHLIGHTER_SIZE_SCALE,
  HIGHLIGHTER_OPACITY,
  TEXT_LINE_HEIGHT,
  DRAW_TEXT_FONT,
  FONT_MAP,
  DEFAULT_CANVAS_SIZE,
} from './drawEngineTypes'
import {
  strokeCenter,
  computeBounds,
  buildArrowGeometry,
  textFontSize,
} from './drawEngineMath'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Опции рендеринга штрихов в SVG. */
export interface DrawRenderOptions {
  /** Резолвер href для image-штрихов. Получает штрих и возвращает data-URI или
   *  абсолютный URL для атрибута `href` элемента `<image>`. При `undefined`
   *  рендерится плейсхолдер (серый прямоугольник со штриховой рамкой). */
  resolveImageHref?: (stroke: DrawStroke) => string | undefined
}

/**
 * Рендерит массив штрихов в строку SVG-разметки (без <svg>-обёртки).
 * Возвращает содержимое для вставки внутрь <svg>. Используется и в
 * node-view (preview), и в экспорте. roughjs/perfect-freehand грузятся
 * лениво (dynamic import).
 */
export async function renderStrokesToSvgInner(strokes: DrawStroke[], opts?: DrawRenderOptions): Promise<string> {
  if (strokes.length === 0) return ''
  const [{ RoughSVG }, { default: getStroke }] = await Promise.all([
    import('roughjs/bin/svg'),
    import('perfect-freehand'),
  ])

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  // roughjs v4: RoughSVG конструируется от SVG-элемента.
  const rc = new RoughSVG(svgEl)

  // Маркер всегда рисуется ПОД остальными штрихами, независимо от порядка
  // создания/z-order. Сначала выводим все highlighter-штрихи (сохраняя их
  // относительный порядок), затем — все прочие.
  const ordered = strokes.some((s) => s.type === 'highlighter')
    ? [...strokes.filter((s) => s.type === 'highlighter'), ...strokes.filter((s) => s.type !== 'highlighter')]
    : strokes

  const fragments: string[] = []
  for (const stroke of ordered) {
    const nodes = strokeToSvgNodes(stroke, rc, getStroke, opts)
    if (!nodes.length) continue
    const inner = nodes.map(serialiseXmlNode).join('')
    // Собираем атрибуты обёртки <g>: поворот и/или прозрачность.
    const attrs: string[] = []
    if (stroke.rotation) {
      const c = strokeCenter(stroke)
      const deg = (stroke.rotation * 180) / Math.PI
      attrs.push(`transform="rotate(${deg} ${c.x} ${c.y})"`)
    }
    if (typeof stroke.opacity === 'number' && stroke.opacity < 1) {
      attrs.push(`opacity="${String(stroke.opacity)}"`)
    }
    if (attrs.length > 0) {
      fragments.push(`<g ${attrs.join(' ')}>${inner}</g>`)
    } else {
      fragments.push(inner)
    }
  }
  return fragments.join('')
}

function strokeToSvgNodes(
  stroke: DrawStroke,
  rc: import('roughjs/bin/svg').RoughSVG,
  getStroke: typeof import('perfect-freehand')['default'],
  opts?: DrawRenderOptions,
): SVGGElement[] {
  // --- Image-штрих: рендерим <image> (если href резолвится) или плейсхолдер ---
  if (stroke.type === 'image') {
    if (stroke.points.length < 2) return []
    const b = rectFromTwoPoints(stroke.points[0], stroke.points[1])
    const href = opts?.resolveImageHref?.(stroke)
    if (href) {
      const img = document.createElementNS(SVG_NS, 'image')
      img.setAttribute('x', String(b.x))
      img.setAttribute('y', String(b.y))
      img.setAttribute('width', String(b.w))
      img.setAttribute('height', String(b.h))
      img.setAttribute('href', href)
      img.setAttribute('preserveAspectRatio', 'none')
      return [img as unknown as SVGGElement]
    }
    // Плейсхолдер — пока href не резолвится (картинка грузится / ассет пропал).
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(b.x))
    rect.setAttribute('y', String(b.y))
    rect.setAttribute('width', String(b.w))
    rect.setAttribute('height', String(b.h))
    rect.setAttribute('fill', 'rgba(0,0,0,0.04)')
    rect.setAttribute('stroke', 'rgba(0,0,0,0.25)')
    rect.setAttribute('stroke-dasharray', '6 4')
    return [rect as unknown as SVGGElement]
  }

  // Замкнутые фигуры (rectangle/ellipse/diamond) поддерживают заливку.
  const isClosedShape = stroke.type === 'rectangle' || stroke.type === 'ellipse' || stroke.type === 'diamond'
  const fillValue = isClosedShape && stroke.fillColor && stroke.fillColor !== 'transparent'
    ? stroke.fillColor
    : 'none'

  const roughOpts: import('roughjs/bin/core').Options = {
    stroke: stroke.color,
    strokeWidth: stroke.size,
    roughness: typeof stroke.roughness === 'number' ? stroke.roughness : DEFAULT_ROUGHNESS,
    fill: fillValue,
    fillStyle: stroke.fillStyle ?? 'hachure',
    // Стабильный seed → hand-drawn «дрожание» не меняется между рендерами.
    seed: stroke.seed,
  }

  // Пунктир и точки — для геометрии и стрелки (не freehand/text).
  if (stroke.strokeStyle === 'dashed') {
    roughOpts.strokeLineDash = [stroke.size * 4, stroke.size * 2]
  } else if (stroke.strokeStyle === 'dotted') {
    roughOpts.strokeLineDash = [stroke.size, stroke.size * 1.6]
  }

  if (stroke.type === 'text') {
    const node = textToSvgNode(stroke)
    return node ? [node] : []
  }

  if (stroke.type === 'freehand') {
    const strokePoints = getStroke(
      stroke.points.map((p) => [p.x, p.y, typeof p.p === 'number' ? p.p : 0.5]),
      { size: stroke.size * 3.2, thinning: 0.6, smoothing: 0.5, streamline: 0.5 },
    )
    const d = svgPathFromPoints(strokePoints)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', stroke.color)
    path.setAttribute('stroke', 'none')
    return [path as unknown as SVGGElement]
  }

  if (stroke.type === 'highlighter') {
    // Маркер: широкая кисть равномерной толщины (без давления) и полупрозрачная.
    const strokePoints = getStroke(
      stroke.points.map((p) => [p.x, p.y, 0.5]),
      { size: stroke.size * HIGHLIGHTER_SIZE_SCALE, thinning: 0, smoothing: 0.5, streamline: 0.5 },
    )
    const d = svgPathFromPoints(strokePoints)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', stroke.color)
    path.setAttribute('fill-opacity', String(HIGHLIGHTER_OPACITY))
    path.setAttribute('stroke', 'none')
    return [path as unknown as SVGGElement]
  }

  const pts = stroke.points
  if (pts.length < 2) return []

  if (stroke.type === 'line') {
    return [rc.line(pts[0].x, pts[0].y, pts[1].x, pts[1].y, roughOpts)]
  }
  if (stroke.type === 'rectangle') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    return [rc.rectangle(x, y, w, h, roughOpts)]
  }
  if (stroke.type === 'ellipse') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    return [rc.ellipse(x + w / 2, y + h / 2, w, h, roughOpts)]
  }
  if (stroke.type === 'diamond') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    const points: [number, number][] = [
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
      [x, y + h / 2],
    ]
    return [rc.polygon(points, roughOpts)]
  }
  if (stroke.type === 'arrow') {
    return drawArrow(rc, pts[0], pts[1], roughOpts, stroke.arrowShape ?? 'straight', stroke.bend, stroke.startCap ?? 'none', stroke.endCap ?? 'arrow')
  }
  return []
}

/** Строит нативный SVG `<text>` для текстового штриха. Точка `points[0]` —
 *  левый-верхний угол (baseline="hanging"), многострочность — через `<tspan>`.
 *  Текст — нативный SVG (не foreignObject), поэтому корректно растрируется в
 *  экспорте даже на WebKitGTK. */
function textToSvgNode(stroke: DrawStroke): SVGGElement | null {
  const content = stroke.text ?? ''
  if (!content) return null
  const p = stroke.points[0]
  if (!p) return null
  const fontSize = textFontSize(stroke)
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute('x', String(p.x))
  text.setAttribute('y', String(p.y))
  text.setAttribute('fill', stroke.color)
  text.setAttribute('font-size', String(fontSize))
  const fontFamilyValue = stroke.fontFamily && FONT_MAP[stroke.fontFamily]
    ? FONT_MAP[stroke.fontFamily]
    : DRAW_TEXT_FONT
  text.setAttribute('font-family', fontFamilyValue)
  text.setAttribute('dominant-baseline', 'hanging')
  text.setAttribute('xml:space', 'preserve')
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(SVG_NS, 'tspan')
    tspan.setAttribute('x', String(p.x))
    tspan.setAttribute('dominant-baseline', 'hanging')
    if (i > 0) {
      tspan.setAttribute('dy', String(fontSize * TEXT_LINE_HEIGHT))
    }
    // Пустую строку рендерим как пробел, иначе <tspan> схлопывается и сбивает dy.
    tspan.textContent = line.length ? line : ' '
    text.appendChild(tspan)
  })
  return text as unknown as SVGGElement
}

function rectFromTwoPoints(a: DrawPoint, b: DrawPoint): { x: number; y: number; w: number; h: number } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  return { x, y, w: Math.max(w, 1), h: Math.max(h, 1) }
}

/** Рисует наконечник стрелки в точке `at`, «открытый» в сторону угла `angle`
 *  (угол наружу от линии). Две линии-уса под ±headAngle. */
function appendArrowHead(
  nodes: SVGGElement[],
  rc: import('roughjs/bin/svg').RoughSVG,
  at: DrawPoint,
  angle: number,
  opts: import('roughjs/bin/core').Options,
): void {
  const headLen = Math.max(12, opts.strokeWidth ? opts.strokeWidth * 4 : 12)
  const headAngle = Math.PI / 7
  const a1 = angle - headAngle
  const a2 = angle + headAngle
  nodes.push(rc.line(at.x, at.y, at.x - headLen * Math.cos(a1), at.y - headLen * Math.sin(a1), opts))
  nodes.push(rc.line(at.x, at.y, at.x - headLen * Math.cos(a2), at.y - headLen * Math.sin(a2), opts))
}

/** Рисует «точку» (залитый кружок цветом обводки) в конце стрелки. */
function appendArrowDot(
  nodes: SVGGElement[],
  rc: import('roughjs/bin/svg').RoughSVG,
  at: DrawPoint,
  opts: import('roughjs/bin/core').Options,
): void {
  const d = Math.max(8, (opts.strokeWidth ?? 2) * 3)
  nodes.push(rc.circle(at.x, at.y, d, { ...opts, fill: opts.stroke, fillStyle: 'solid', strokeLineDash: undefined }))
}

/** Наконечник заданного типа в точке `at`, ориентированный наружу под `angle`. */
function appendCap(
  nodes: SVGGElement[],
  rc: import('roughjs/bin/svg').RoughSVG,
  cap: DrawArrowCap,
  at: DrawPoint,
  angle: number,
  opts: import('roughjs/bin/core').Options,
): void {
  if (cap === 'arrow') appendArrowHead(nodes, rc, at, angle, opts)
  else if (cap === 'dot') appendArrowDot(nodes, rc, at, opts)
  // 'none' — ничего.
}

function drawArrow(
  rc: import('roughjs/bin/svg').RoughSVG,
  from: DrawPoint,
  to: DrawPoint,
  opts: import('roughjs/bin/core').Options,
  shape: DrawArrowShape = 'straight',
  bend?: number,
  startCap: DrawArrowCap = 'none',
  endCap: DrawArrowCap = 'arrow',
): SVGGElement[] {
  const geom = buildArrowGeometry(from, to, shape, bend)

  let nodes: SVGGElement[]
  if (geom.shape === 'bezier' && geom.control) {
    nodes = [rc.path(`M ${from.x} ${from.y} Q ${geom.control.x} ${geom.control.y} ${to.x} ${to.y}`, opts)]
  } else {
    nodes = [rc.linearPath(geom.points.map((p) => [p.x, p.y] as [number, number]), opts)]
  }

  // Конец (points[1]): угол наружу = tangent → tip.
  const endAngle = Math.atan2(geom.tip.y - geom.tangent.y, geom.tip.x - geom.tangent.x)
  appendCap(nodes, rc, endCap, geom.tip, endAngle, opts)

  // Начало (points[0]): угол наружу = (второй узел тела) → from.
  const secondPt = geom.points[1] ?? geom.tip
  const startAngle = Math.atan2(from.y - secondPt.y, from.x - secondPt.x)
  appendCap(nodes, rc, startCap, { x: from.x, y: from.y }, startAngle, opts)

  return nodes
}

/** Конвертирует массив [x,y] точек perfect-freehand в SVG-path `d`. */
export function svgPathFromPoints(points: number[][]): string {
  if (points.length === 0) return ''
  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      if (i === 0) return `M ${x0},${y0}`
      const [x1, y1] = arr[i - 1]
      const mx = (x0 + x1) / 2
      const my = (y0 + y1) / 2
      return `${acc} Q ${x1},${y1} ${mx},${my}`
    },
    '',
  )
  const last = points[points.length - 1]
  return `${d} L ${last[0]},${last[1]} Z`
}

/** Сериализует SVG-узел в строку (без XML-декларации). */
function serialiseXmlNode(node: Node): string {
  const xmlSerializer = new XMLSerializer()
  return xmlSerializer.serializeToString(node)
}

/**
 * Рендерит полный <svg> (с viewBox и фоном) для preview в документе.
 *
 * Для бесконечного холста viewBox вычисляется как fit по bbox всех штрихов
 * (с отступом `padding`) — preview показывает именно нарисованное содержимое,
 * где бы оно ни находилось в world-координатах. Стабильность формы каждой
 * фигуры обеспечивает детерминированный `seed` roughjs (см. `hashStroke`):
 * одна и та же фигура всегда рендерится одинаково, даже когда bbox меняется
 * от добавления других фигур (масштаб всего preview при этом, естественно,
 * пересчитывается — это ожидаемое поведение fit, как в Excalidraw/tldraw).
 *
 * Фон «бумаги»: холст рисования всегда светлый (как лист бумаги), поэтому и
 * preview по умолчанию (transparent bgColor) рисуется на белом фоне — иначе
 * тёмные чернила висят «в пустоте» и сливаются с тёмной темой. Явный
 * непрозрачный bgColor пользователя имеет приоритет.
 */
export async function renderDrawToSvgString(data: DrawData, padding = 24, opts?: DrawRenderOptions): Promise<string> {
  const inner = await renderStrokesToSvgInner(data.strokes, opts)
  // Пустой рисунок — показываем дефолтный canvas, чтобы preview имел размер.
  const { minX, minY, maxX, maxY } = computeBounds(data.strokes)
  const hasContent = data.strokes.length > 0 && (maxX > minX || maxY > minY)
  // Цвет бумаги: явный bgColor, иначе белый (как сам холст рисования).
  const paper = data.bgColor && data.bgColor !== 'transparent' ? data.bgColor : '#ffffff'
  let viewBox: string
  let bgRect: string
  if (hasContent) {
    const width = Math.max(maxX - minX, 1) + padding * 2
    const height = Math.max(maxY - minY, 1) + padding * 2
    const ox = minX - padding
    const oy = minY - padding
    viewBox = `${ox} ${oy} ${width} ${height}`
    bgRect = `<rect x="${ox}" y="${oy}" width="${width}" height="${height}" fill="${paper}"/>`
  } else {
    const canvas = data.canvas ?? DEFAULT_CANVAS_SIZE
    const width = Math.max(canvas.width, 1)
    const height = Math.max(canvas.height, 1)
    viewBox = `0 0 ${width} ${height}`
    bgRect = `<rect x="0" y="0" width="${width}" height="${height}" fill="${paper}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" preserveAspectRatio="xMidYMid meet" class="nv-draw-preview">${bgRect}${inner}</svg>`
}
