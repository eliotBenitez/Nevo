import { transformMarkmap } from '../markmap/markmapCore'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

/**
 * Render a markmap mind map to a standalone SVG string for export.
 * markmap measures node sizes via getBBox, so the SVG must be laid out in the
 * DOM while rendering — we attach it offscreen and remove it afterwards.
 * Returns `null` when the markdown is empty or rendering fails.
 *
 * This variant keeps markmap's native output, where labels live inside
 * <foreignObject> (HTML). Browsers render that correctly, so it is used by the
 * HTML export. For PDF use `renderMarkmapToExportSvg` instead.
 */
export async function renderMarkmapToSvg(markdown: string): Promise<string | null> {
  return withRenderedMarkmap(markdown, (svg) => new XMLSerializer().serializeToString(svg))
}

/**
 * Render a markmap to an SVG string whose labels are emitted as native SVG
 * (<text> for prose, MathJax <path> glyphs for KaTeX math) instead of HTML
 * <foreignObject>. Typst's usvg rasteriser ignores <foreignObject>, so the
 * default output loses every label in a PDF; this conversion keeps the full
 * map — nodes, formatted text, and math — as vector content usvg can render.
 */
export async function renderMarkmapToExportSvg(markdown: string): Promise<string | null> {
  return withRenderedMarkmap(markdown, async (svg) => {
    try {
      await inlineForeignObjects(svg)
    } catch {
      // Fall back to the raw markmap SVG (nodes/links only) rather than failing
      // the whole export.
    }
    return new XMLSerializer().serializeToString(svg)
  })
}

/**
 * Mount a markmap offscreen, lay it out (markmap measures node sizes via getBBox,
 * so it must be in the DOM), run `extract` against the laid-out SVG while it is
 * still attached and visible, then tear everything down. Returns `null` for empty
 * markdown or on any failure.
 */
async function withRenderedMarkmap(
  markdown: string,
  extract: (svg: SVGSVGElement) => string | Promise<string>,
): Promise<string | null> {
  if (!markdown.trim()) return null
  if (typeof document === 'undefined') return null

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '800')
  svg.setAttribute('height', '600')
  svg.style.position = 'absolute'
  svg.style.left = '-99999px'
  svg.style.top = '0'
  svg.style.visibility = 'hidden'
  document.body.appendChild(svg)

  let mm: { fit: () => Promise<void> | void; destroy: () => void } | null = null
  try {
    const { view, root, options } = await transformMarkmap(markdown)
    mm = view.Markmap.create(
      svg,
      { autoFit: true, duration: 0, maxWidth: 320, fitRatio: 0.95, ...options } as never,
      root as never,
    )
    await mm.fit()
    svg.style.visibility = 'visible'
    return await extract(svg)
  } catch {
    return null
  } finally {
    try {
      mm?.destroy()
    } catch {
      // destroy touches the foreignObjects we may have replaced; ignore.
    }
    svg.remove()
  }
}

/**
 * Replace every markmap label <foreignObject> with native SVG positioned in the
 * node's local coordinate system. Geometry is read from the live layout via
 * getClientRects so wrapping and formatting match exactly what was rendered.
 */
async function inlineForeignObjects(svg: SVGSVGElement): Promise<void> {
  const foreignObjects = Array.from(
    svg.querySelectorAll<SVGForeignObjectElement>('.markmap-foreign'),
  )
  if (!foreignObjects.length) return

  // MathJax is only loaded when the map actually contains math.
  const hasMath = !!svg.querySelector('.katex, math')
  const mathjax = hasMath ? await getMathjax().catch(() => null) : null

  for (const fo of foreignObjects) {
    try {
      await inlineForeignObject(fo, mathjax)
    } catch {
      // Skip a single bad label rather than aborting the whole map.
    }
  }
}

type MathRenderer = { texToSvg: (tex: string, ownerDoc: Document) => SVGSVGElement }

async function inlineForeignObject(
  fo: SVGForeignObjectElement,
  mathjax: MathRenderer | null,
): Promise<void> {
  const parent = fo.parentNode
  if (!parent) return
  const ownerDoc = fo.ownerDocument

  const foX = Number.parseFloat(fo.getAttribute('x') ?? '0') || 0
  const foW = Number.parseFloat(fo.getAttribute('width') ?? '0') || 0
  const foH = Number.parseFloat(fo.getAttribute('height') ?? '0') || 0
  const screen = fo.getBoundingClientRect()
  if (!foW || !foH || !screen.width || !screen.height) {
    parent.removeChild(fo)
    return
  }

  // The whole map is scaled by markmap's fit() transform; convert screen-space
  // client rects back into the node's local SVG units.
  const sx = screen.width / foW
  const sy = screen.height / foH
  const toLocalX = (px: number): number => foX + (px - screen.left) / sx
  const toLocalY = (py: number): number => (py - screen.top) / sy // foreignObject y attr is 0

  const group = ownerDoc.createElementNS(SVG_NS, 'g')
  group.setAttribute('class', 'markmap-label')

  // foreignObject > div > div(content)
  const content = fo.firstElementChild?.firstElementChild as HTMLElement | undefined
  if (content) {
    await emitNode(content, { ownerDoc, group, toLocalX, toLocalY, sx, sy, mathjax })
  }

  parent.replaceChild(group, fo)
}

interface EmitCtx {
  ownerDoc: Document
  group: SVGGElement
  toLocalX: (px: number) => number
  toLocalY: (py: number) => number
  sx: number
  sy: number
  mathjax: MathRenderer | null
}

async function emitNode(node: Node, ctx: EmitCtx): Promise<void> {
  if (node.nodeType === Node.TEXT_NODE) {
    emitText(node as Text, ctx)
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (tag === 'math' || el.classList.contains('katex')) {
    emitMath(el, ctx)
    return
  }
  if (tag === 'img') {
    await emitImage(el as HTMLImageElement, ctx)
    return
  }
  for (const child of Array.from(el.childNodes)) await emitNode(child, ctx)
}

interface WordBox {
  start: number
  end: number
  rect: DOMRect
}

/**
 * Emit a text node as one <text> per visual line. Splitting per word and pinning
 * each to its measured x would leave gaps once Typst reshapes the run in its own
 * font (visible as stray spaces in inline code); a per-line <text> keeps the
 * renderer's native spacing while still honouring wrapping.
 */
function emitText(textNode: Text, ctx: EmitCtx): void {
  const parentEl = textNode.parentElement
  if (!parentEl) return
  const text = textNode.nodeValue ?? ''
  if (!text.trim()) return

  const cs = getComputedStyle(parentEl)
  const fontSize = Number.parseFloat(cs.fontSize) || 16

  const words: WordBox[] = []
  const wordRe = /\S+/g
  let match: RegExpExecArray | null
  while ((match = wordRe.exec(text))) {
    const range = ctx.ownerDoc.createRange()
    range.setStart(textNode, match.index)
    range.setEnd(textNode, match.index + match[0].length)
    const rect = range.getClientRects()[0]
    if (!rect || !rect.width) continue
    words.push({ start: match.index, end: match.index + match[0].length, rect })
  }
  if (!words.length) return

  // Group words into visual lines by their top coordinate.
  const lines: WordBox[][] = []
  let current: WordBox[] | null = null
  for (const word of words) {
    if (current && Math.abs(word.rect.top - current[0].rect.top) <= 2) current.push(word)
    else {
      current = [word]
      lines.push(current)
    }
  }

  for (const line of lines) {
    const first = line[0]
    const last = line[line.length - 1]
    const lineHeight = first.rect.height / ctx.sy
    const baseline = ctx.toLocalY(first.rect.top) + (lineHeight - fontSize) / 2 + fontSize * 0.8
    const t = ctx.ownerDoc.createElementNS(SVG_NS, 'text')
    t.setAttribute('x', round(ctx.toLocalX(first.rect.left)))
    t.setAttribute('y', round(baseline))
    t.setAttribute('font-size', round(fontSize))
    t.setAttribute('fill', cs.color || '#000')
    if (cs.fontFamily) t.setAttribute('font-family', cs.fontFamily)
    if (cs.fontWeight && cs.fontWeight !== '400' && cs.fontWeight !== 'normal') {
      t.setAttribute('font-weight', cs.fontWeight)
    }
    if (cs.fontStyle && cs.fontStyle !== 'normal') t.setAttribute('font-style', cs.fontStyle)
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
    t.textContent = text.slice(first.start, last.end)
    ctx.group.appendChild(t)
  }
}

/**
 * Embed an <img> (e.g. a remote markdown image) as a data-URI <image>. The bytes
 * are fetched and inlined because Typst's rasteriser neither follows remote URLs
 * nor shares the webview's HTTP context. Skipped silently on CORS/network errors.
 */
async function emitImage(img: HTMLImageElement, ctx: EmitCtx): Promise<void> {
  const src = img.currentSrc || img.src
  if (!src) return
  const box = img.getBoundingClientRect()
  if (!box.width || !box.height) return

  const dataUri = await fetchAsDataUri(src)
  if (!dataUri) return

  const image = ctx.ownerDoc.createElementNS(SVG_NS, 'image')
  image.setAttribute('x', round(ctx.toLocalX(box.left)))
  image.setAttribute('y', round(ctx.toLocalY(box.top)))
  image.setAttribute('width', round(box.width / ctx.sx))
  image.setAttribute('height', round(box.height / ctx.sy))
  image.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  image.setAttribute('href', dataUri)
  image.setAttributeNS(XLINK_NS, 'xlink:href', dataUri)
  ctx.group.appendChild(image)
}

async function fetchAsDataUri(src: string): Promise<string | null> {
  if (src.startsWith('data:')) return src
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function emitMath(el: Element, ctx: EmitCtx): void {
  const box = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const color = cs.color || '#000'
  const fontSize = Number.parseFloat(cs.fontSize) || 16
  const tex =
    el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ??
    el.textContent?.trim() ??
    ''

  const x = ctx.toLocalX(box.left)
  const y = ctx.toLocalY(box.top)

  // Render the math as vector paths via MathJax when possible (no font needed).
  if (ctx.mathjax && tex && box.width && box.height) {
    try {
      const mathSvg = ctx.mathjax.texToSvg(tex, ctx.ownerDoc)
      recolor(mathSvg, color)
      mathSvg.setAttribute('x', round(x))
      mathSvg.setAttribute('y', round(y))
      mathSvg.setAttribute('width', round(box.width / ctx.sx))
      mathSvg.setAttribute('height', round(box.height / ctx.sy))
      mathSvg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
      mathSvg.removeAttribute('style')
      ctx.group.appendChild(mathSvg)
      return
    } catch {
      // fall through to text fallback
    }
  }

  // Fallback: render the TeX source as plain text.
  if (!tex) return
  const baseline = y + (box.height / ctx.sy - fontSize) / 2 + fontSize * 0.8
  const t = ctx.ownerDoc.createElementNS(SVG_NS, 'text')
  t.setAttribute('x', round(x))
  t.setAttribute('y', round(baseline))
  t.setAttribute('font-size', round(fontSize))
  t.setAttribute('fill', color)
  t.setAttribute('font-style', 'italic')
  t.textContent = tex
  ctx.group.appendChild(t)
}

function recolor(svg: SVGSVGElement, color: string): void {
  svg.querySelectorAll('[fill="currentColor"]').forEach((n) => n.setAttribute('fill', color))
  svg.querySelectorAll('[stroke="currentColor"]').forEach((n) => n.setAttribute('stroke', color))
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

let mathjaxPromise: Promise<MathRenderer> | null = null

function getMathjax(): Promise<MathRenderer> {
  if (!mathjaxPromise) {
    mathjaxPromise = (async () => {
      const [
        { mathjax },
        { TeX },
        { SVG },
        { liteAdaptor },
        { RegisterHTMLHandler },
        { AllPackages },
      ] = await Promise.all([
        import('mathjax-full/js/mathjax.js'),
        import('mathjax-full/js/input/tex.js'),
        import('mathjax-full/js/output/svg.js'),
        import('mathjax-full/js/adaptors/liteAdaptor.js'),
        import('mathjax-full/js/handlers/html.js'),
        import('mathjax-full/js/input/tex/AllPackages.js'),
      ])
      const adaptor = liteAdaptor()
      RegisterHTMLHandler(adaptor)
      const mjDoc = mathjax.document('', {
        InputJax: new TeX({ packages: AllPackages }),
        OutputJax: new SVG({ fontCache: 'none' }),
      })
      return {
        texToSvg(tex: string, ownerDoc: Document): SVGSVGElement {
          const node = mjDoc.convert(tex, { display: false })
          const html = adaptor.innerHTML(node)
          const parsed = new DOMParser().parseFromString(html, 'image/svg+xml')
          return ownerDoc.importNode(parsed.documentElement, true) as unknown as SVGSVGElement
        },
      }
    })()
  }
  return mathjaxPromise
}
