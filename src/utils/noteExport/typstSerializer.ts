import type { BlockNode, NoteDocument } from '../../types/note'
import { getPluginNodeSerializer } from '../../editor-core/plugin-host/active-serialization'
import { computeBlockTableValues } from '../../editor-core/tableFormula'
import type { NevoSerializableNode } from '../../types/editor-plugin'
import {
  DEFAULT_PDF_OPTIONS,
  FALLBACK_FONT,
  LINE_SPACING_EXPR,
  MARGIN_PRESETS_MM,
  type PdfExportOptions,
} from './pdfOptions'
import { latexToTypstMath } from './latexToTypstMath'
import { normalizeDatabaseData, type DatabaseBlockData, type DbCellValue, type DbField } from '../../types/database-block'
import { visibleRecords } from '../../editor-core/databaseFilterSort'

export interface TypstImageAsset {
  /** Filename referenced inside the Typst source via `image("name")`. */
  name: string
  /** Path relative to the workspace root (resolved to bytes in Rust). */
  src: string
}

export interface TypstMermaidAsset {
  /** Filename referenced inside the Typst source. */
  name: string
  /** Raw mermaid code, rasterised to SVG on the frontend before compiling. */
  code: string
}

export interface TypstMarkmapAsset {
  /** Filename referenced inside the Typst source. */
  name: string
  /** Raw markmap markdown, rasterised to SVG on the frontend before compiling. */
  markdown: string
}

export interface TypstVegaAsset {
  /** Filename referenced inside the Typst source. */
  name: string
  /** Raw Vega/Vega-Lite spec, rasterised to SVG on the frontend before compiling. */
  spec: string
}

export interface TypstDrawAsset {
  /** Filename referenced inside the Typst source. */
  name: string
  /** Inline SVG snapshot of the drawing (already native paths — usvg-ready). */
  svg: string
}

export interface TypstSerializeResult {
  source: string
  images: TypstImageAsset[]
  mermaid: TypstMermaidAsset[]
  markmap: TypstMarkmapAsset[]
  vega: TypstVegaAsset[]
  draw: TypstDrawAsset[]
}

export interface TypstSerializeOptions {
  assetPathPrefix?: string
}

interface SerializeCtx {
  images: TypstImageAsset[]
  mermaid: TypstMermaidAsset[]
  markmap: TypstMarkmapAsset[]
  vega: TypstVegaAsset[]
  draw: TypstDrawAsset[]
  imageSeq: number
  mermaidSeq: number
  markmapSeq: number
  vegaSeq: number
  drawSeq: number
  assetPathPrefix: string
}

/** Escape a literal string for a Typst double-quoted string token. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Escape free text so Typst markup mode treats it verbatim.
 * Parentheses are escaped too: an unescaped `(` directly after an inline call
 * like `#strong[..]` or `#raw(..)` is otherwise parsed as an argument list.
 */
function escapeText(value: string): string {
  return value.replace(/([\\#$*_`<>@[\]()])/g, '\\$1')
}

function wrapMarks(text: string, marks: BlockNode['marks']): string {
  if (!marks?.length) return text
  if (marks.some(m => m.type === 'code')) return `#raw(${quote(text)})`

  let out = text
  for (const mark of marks) {
    switch (mark.type) {
      case 'strong': out = `#strong[${out}]`; break
      case 'em': out = `#emph[${out}]`; break
      case 'strike': out = `#strike[${out}]`; break
      case 'underline': out = `#underline[${out}]`; break
      case 'highlight': out = `#highlight[${out}]`; break
      case 'superscript': out = `#super[${out}]`; break
      case 'subscript': out = `#sub[${out}]`; break
      case 'link': out = `#link(${quote(String(mark.attrs?.href ?? ''))})[${out}]`; break
      // internal_link → clickable deep link carrying the target note id (+ anchor).
      case 'internal_link': {
        const noteId = String(mark.attrs?.noteId ?? '')
        const anchor = mark.attrs?.anchor ? `#${String(mark.attrs.anchor)}` : ''
        out = `#link(${quote(`nevo://note/${noteId}${anchor}`)})[${out}]`
        break
      }
    }
  }
  return out
}

function inlineContent(node: BlockNode, ctx: SerializeCtx): string {
  if (!node.content?.length) return ''
  return node.content.map(child => {
    if (child.type === 'text') return wrapMarks(escapeText(child.text ?? ''), child.marks)
    if (child.type === 'hard_break') return '#linebreak()'
    if (child.type === 'math_inline') return `$${latexToTypstMath(String(child.attrs?.latex ?? ''))}$`
    return inlineContent(child, ctx)
  }).join('')
}

function codeText(node: BlockNode): string {
  return (node.content ?? []).map(c => c.text ?? '').join('')
}

function blockChildren(node: BlockNode, ctx: SerializeCtx, sep = '\n\n'): string {
  return (node.content ?? []).map(child => nodeToTypst(child, ctx)).filter(Boolean).join(sep)
}

function listItems(node: BlockNode, ctx: SerializeCtx): string {
  return (node.content ?? [])
    .map(item => `  [${blockChildren(item, ctx, '\n').trim()}]`)
    .join(',\n')
}

function tableToTypst(node: BlockNode, ctx: SerializeCtx): string {
  const rows = node.content ?? []
  if (!rows.length) return ''
  const colCount = (rows[0].content ?? []).length || 1
  const values = computeBlockTableValues(node)
  const cells: string[] = []
  rows.forEach((row, rowIndex) => {
    ;(row.content ?? []).forEach((cell, colIndex) => {
      const formula = typeof cell.attrs?.formula === 'string' ? cell.attrs.formula.trim() : ''
      const content = formula
        ? escapeText(values.get(`${rowIndex}:${colIndex}`)?.value ?? formula)
        : inlineContent(cell, ctx).trim()
      cells.push(`[${content}]`)
    })
  })
  // Tables are block-level and left-aligned by default; center them in the page.
  return `#align(center)[#table(\n  columns: ${colCount},\n  ${cells.join(', ')}\n)]`
}

function formatDbCellValue(value: DbCellValue, field: DbField): string {
  if (value === null || value === undefined) return ''
  if (field.type === 'select') {
    const id = typeof value === 'string' ? value : ''
    if (!id) return ''
    return field.options?.find(o => o.id === id)?.name ?? id
  }
  if (field.type === 'multi_select') {
    const ids = Array.isArray(value) ? value : []
    return ids.map(id => field.options?.find(o => o.id === id)?.name ?? id).join(', ')
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '✓' : ''
  return String(value)
}

function databaseBlockRecords(data: DatabaseBlockData) {
  if (data.version !== 1) return []
  const view = data.views.find(v => v.id === data.activeView) ?? data.views[0]
  return view ? visibleRecords(data.records, view.filters, view.sorts, data.fields) : data.records
}

function databaseBlockToTypst(node: BlockNode): string {
  const data = normalizeDatabaseData(node.attrs?.data)
  const title = data.title.trim()
  const heading = title ? `#strong[${escapeText(title)}]\n\n` : ''
  if (!data.fields.length) return heading.trim()
  const records = databaseBlockRecords(data)
  const headerCells = data.fields.map(f => `[#strong[${escapeText(f.name)}]]`)
  const dataCells = records.flatMap(record =>
    data.fields.map(f => `[${escapeText(formatDbCellValue(record.cells[f.id] ?? null, f))}]`),
  )
  const cells = [...headerCells, ...dataCells].join(', ')
  const table = `#align(center)[#table(\n  columns: ${data.fields.length},\n  ${cells}\n)]`
  return `${heading}${table}`
}

function nodeToTypst(node: BlockNode, ctx: SerializeCtx): string {
  switch (node.type) {
    case 'doc':
      return blockChildren(node, ctx)
    case 'paragraph':
      return inlineContent(node, ctx)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `${'='.repeat(level)} ${inlineContent(node, ctx)}`
    }
    case 'code_block': {
      const lang = String(node.attrs?.language ?? node.attrs?.lang ?? '')
      const langArg = lang ? `lang: ${quote(lang)}, ` : ''
      return `#raw(block: true, ${langArg}${quote(codeText(node))})`
    }
    case 'blockquote':
      return `#quote(block: true)[${blockChildren(node, ctx).trim()}]`
    case 'bullet_list':
      return `#list(\n${listItems(node, ctx)}\n)`
    case 'ordered_list':
      return `#enum(\n${listItems(node, ctx)}\n)`
    case 'list_item':
      return blockChildren(node, ctx, '\n')
    case 'checklist_item': {
      const box = node.attrs?.checked ? '#box[☑]' : '#box[☐]'
      return `${box} ${inlineContent(node, ctx)}`
    }
    case 'callout': {
      const icon = String(node.attrs?.icon ?? '')
      const inner = blockChildren(node, ctx).trim()
      const body = icon ? `${escapeText(icon)} ${inner}` : inner
      return `#block(fill: luma(244), inset: 10pt, radius: 6pt, width: 100%)[${body}]`
    }
    case 'divider':
      return '#line(length: 100%, stroke: 0.5pt + luma(200))'
    case 'image_block': {
      const src = String(node.attrs?.src ?? '')
      if (!src) return ''
      const name = registerImage(src, ctx)
      return `#figure(image(${quote(name)}, width: 80%))`
    }
    case 'file_block': {
      const filename = String(node.attrs?.filename ?? 'file')
      return `#emph[📎 ${escapeText(filename)}]`
    }
    case 'math_block': {
      const latex = String(node.attrs?.latex ?? codeText(node))
      return `$ ${latexToTypstMath(latex)} $`
    }
    case 'mermaid_block': {
      const name = registerMermaid(String(node.attrs?.code ?? ''), ctx)
      return `#figure(image(${quote(name)}))`
    }
    case 'markmap_block': {
      const name = registerMarkmap(String(node.attrs?.markdown ?? ''), ctx)
      return `#figure(image(${quote(name)}))`
    }
    case 'vega_block': {
      const name = registerVega(String(node.attrs?.spec ?? ''), ctx)
      return `#figure(image(${quote(name)}))`
    }
    case 'draw_block': {
      // The drawing's svgPreview is a native-path SVG (no foreignObject), so it
      // rasterises cleanly via usvg. Skip empty drawings.
      const svg = String(node.attrs?.svgPreview ?? '')
      if (!svg.trim()) return ''
      const name = registerDraw(svg, ctx)
      return `#figure(image(${quote(name)}, width: 70%))`
    }
    case 'note_embed': {
      const title = String(node.attrs?.title ?? 'Note')
      const previewText = String(node.attrs?.previewText ?? '')
      const body = previewText.trim()
        ? `#strong[${escapeText(title)}] \\ ${escapeText(previewText)}`
        : `#strong[${escapeText(title)}]`
      return `#block(fill: luma(244), inset: 10pt, radius: 6pt, width: 100%)[${body}]`
    }
    case 'media_block': {
      const name = String(node.attrs?.name ?? (node.attrs?.kind === 'video' ? 'Video' : 'Audio'))
      return `#emph[${node.attrs?.kind === 'video' ? '🎬' : '🔊'} ${escapeText(name)}]`
    }
    case 'embed_block': {
      const url = String(node.attrs?.url ?? '')
      if (!url) return ''
      const title = String(node.attrs?.title ?? '')
      return `#link(${quote(url)})[${escapeText(title.trim() || url)}]`
    }
    case 'toggle': {
      const children = node.content ?? []
      const titleNode = children.find(child => child.type === 'toggle_title')
      const bodyNodes = children.filter(child => child.type !== 'toggle_title')
      const summary = titleNode ? inlineContent(titleNode, ctx).trim() : ''
      const body = bodyNodes.map(child => nodeToTypst(child, ctx)).filter(Boolean).join('\n\n')
      const heading = summary ? `#strong[${summary}]\n\n` : ''
      return `${heading}${body}`
    }
    case 'toggle_title':
      return inlineContent(node, ctx)
    case 'table':
      return tableToTypst(node, ctx)
    case 'column_list': {
      const cols = node.content ?? []
      if (!cols.length) return ''
      const widths = cols
        .map((c) => {
          const w = Number(c.attrs?.width)
          return `${Number.isFinite(w) && w > 0 ? w : 1}fr`
        })
        .join(', ')
      const cells = cols.map((c) => `[${blockChildren(c, ctx).trim()}]`).join(',\n  ')
      return `#grid(\n  columns: (${widths}),\n  gutter: 12pt,\n  ${cells}\n)`
    }
    case 'column':
      return blockChildren(node, ctx)
    case 'hard_break':
      return '#linebreak()'
    case 'database_block':
      return databaseBlockToTypst(node)
    default: {
      const pluginSerializer = getPluginNodeSerializer(node.type)?.typst
      if (pluginSerializer) {
        const children = blockChildren(node, ctx)
        const result = pluginSerializer(node as NevoSerializableNode, {
          serializeChildren: () => children,
        })
        if (typeof result === 'string') return result
        void result.catch(() => {})
        const marker = JSON.stringify({ type: node.type, attrs: node.attrs ?? {} })
          .replace(/\n/g, ' ')
        return [`// nevo-plugin-node: ${marker}`, children].filter(Boolean).join('\n')
      }
      const children = blockChildren(node, ctx)
      const text = inlineContent(node, ctx)
      const marker = JSON.stringify({ type: node.type, attrs: node.attrs ?? {} })
        .replace(/\n/g, ' ')
      return [`// nevo-plugin-node: ${marker}`, children || text].filter(Boolean).join('\n')
    }
  }
}

function registerImage(src: string, ctx: SerializeCtx): string {
  const ext = (src.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const name = `img-${++ctx.imageSeq}.${ext}`
  ctx.images.push({ name, src })
  return `${ctx.assetPathPrefix}${name}`
}

function registerMermaid(code: string, ctx: SerializeCtx): string {
  const name = `mermaid-${++ctx.mermaidSeq}.svg`
  ctx.mermaid.push({ name, code })
  return `${ctx.assetPathPrefix}${name}`
}

function registerMarkmap(markdown: string, ctx: SerializeCtx): string {
  const name = `markmap-${++ctx.markmapSeq}.svg`
  ctx.markmap.push({ name, markdown })
  return `${ctx.assetPathPrefix}${name}`
}

function registerVega(spec: string, ctx: SerializeCtx): string {
  const name = `vega-${++ctx.vegaSeq}.svg`
  ctx.vega.push({ name, spec })
  return `${ctx.assetPathPrefix}${name}`
}

function registerDraw(svg: string, ctx: SerializeCtx): string {
  const name = `draw-${++ctx.drawSeq}.svg`
  ctx.draw.push({ name, svg })
  return `${ctx.assetPathPrefix}${name}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildPreamble(title: string, options: PdfExportOptions): string {
  const paper = options.paperFormat === 'Letter' ? 'us-letter' : 'a4'
  const flipped = options.orientation === 'landscape'
  const [top, right, bottom, left] = MARGIN_PRESETS_MM[options.marginPreset]
  // `numbering: "1"` renders a centered page number in the page footer.
  const numbering = options.pageNumbers ? ', numbering: "1"' : ''
  // Running header: note title (left) + export date (right), small and muted.
  const header = options.runningHeader
    ? `, header: [#text(8pt, fill: luma(120))[${escapeText(title)} #h(1fr) ${todayIso()}]]`
    : ''
  // Chosen system font, falling back to the embedded font for missing glyphs;
  // empty selection uses the embedded font directly.
  const font = options.fontFamily
    ? `(${quote(options.fontFamily)}, ${quote(FALLBACK_FONT)})`
    : quote(FALLBACK_FONT)
  const { leading, spacing } = LINE_SPACING_EXPR[options.lineSpacing]

  const lines = [
    // Sets the PDF metadata title (shown in viewers / file properties).
    `#set document(title: ${quote(title)})`,
    `#set page(paper: ${quote(paper)}, flipped: ${flipped}, margin: (top: ${top}mm, right: ${right}mm, bottom: ${bottom}mm, left: ${left}mm)${numbering}${header})`,
    `#set text(size: ${options.fontSize}pt, font: ${font})`,
    `#set par(justify: true, leading: ${leading}, spacing: ${spacing})`,
    // Render all hyperlinks (external + internal note links) in a link colour.
    '#show link: set text(fill: rgb("#2f6fdb"))',
  ]
  if (options.headingNumbers) lines.push('#set heading(numbering: "1.1.")')

  if (options.titlePage) {
    lines.push(
      `#align(center + horizon)[#text(26pt, weight: "bold")[${escapeText(title)}]\n#v(0.8em)\n#text(11pt, fill: luma(120))[${todayIso()}]]`,
      '#pagebreak()',
    )
  } else {
    // The document title is unnumbered and excluded from the outline (it is the doc itself).
    lines.push(`#heading(level: 1, numbering: none, outlined: false)[${escapeText(title)}]`)
  }

  // Separate the table of contents from the note body with a page break.
  if (options.tableOfContents) lines.push('#outline()', '#pagebreak()')

  return lines.join('\n')
}

export function serializeNoteToTypst(
  note: NoteDocument,
  options: PdfExportOptions = DEFAULT_PDF_OPTIONS,
  serializeOptions: TypstSerializeOptions = {},
): TypstSerializeResult {
  const ctx: SerializeCtx = {
    images: [],
    mermaid: [],
    markmap: [],
    vega: [],
    draw: [],
    imageSeq: 0,
    mermaidSeq: 0,
    markmapSeq: 0,
    vegaSeq: 0,
    drawSeq: 0,
    assetPathPrefix: serializeOptions.assetPathPrefix ?? '',
  }
  const body = nodeToTypst(note.content, ctx)
  const source = `${buildPreamble(note.title, options)}\n\n${body}\n`
  return { source, images: ctx.images, mermaid: ctx.mermaid, markmap: ctx.markmap, vega: ctx.vega, draw: ctx.draw }
}

async function resolveAsyncTypstPlugins(
  node: BlockNode,
  ctx: SerializeCtx,
  replacements: Map<string, string>,
  sequence: { value: number },
): Promise<BlockNode> {
  const pluginSerializer = getPluginNodeSerializer(node.type)?.typst
  if (pluginSerializer) {
    const resolvedChildren = await Promise.all((node.content ?? []).map(child =>
      resolveAsyncTypstPlugins(child, ctx, replacements, sequence)))
    const children = nodeToTypst({ type: 'doc', content: resolvedChildren }, ctx)
    const marker = `NEVOPLUGINTYPST${++sequence.value}END`
    try {
      replacements.set(marker, await pluginSerializer(node as NevoSerializableNode, {
        serializeChildren: () => children,
      }))
    } catch {
      const json = JSON.stringify({ type: node.type, attrs: node.attrs ?? {} }).replace(/\n/g, ' ')
      replacements.set(marker, [`// nevo-plugin-node: ${json}`, children].filter(Boolean).join('\n'))
    }
    return { type: 'paragraph', content: [{ type: 'text', text: marker }] }
  }
  if (!node.content?.length) return node
  return {
    ...node,
    content: await Promise.all(node.content.map(child =>
      resolveAsyncTypstPlugins(child, ctx, replacements, sequence))),
  }
}

export async function serializeNoteToTypstAsync(
  note: NoteDocument,
  options: PdfExportOptions = DEFAULT_PDF_OPTIONS,
  serializeOptions: TypstSerializeOptions = {},
): Promise<TypstSerializeResult> {
  const ctx: SerializeCtx = {
    images: [],
    mermaid: [],
    markmap: [],
    vega: [],
    draw: [],
    imageSeq: 0,
    mermaidSeq: 0,
    markmapSeq: 0,
    vegaSeq: 0,
    drawSeq: 0,
    assetPathPrefix: serializeOptions.assetPathPrefix ?? '',
  }
  const replacements = new Map<string, string>()
  const resolved = await resolveAsyncTypstPlugins(note.content, ctx, replacements, { value: 0 })
  let body = nodeToTypst(resolved, ctx)
  for (const [marker, value] of replacements) body = body.split(marker).join(value)
  const source = `${buildPreamble(note.title, options)}\n\n${body}\n`
  return {
    source,
    images: ctx.images,
    mermaid: ctx.mermaid,
    markmap: ctx.markmap,
    vega: ctx.vega,
    draw: ctx.draw,
  }
}
