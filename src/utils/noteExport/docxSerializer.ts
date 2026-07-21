import {
  Document,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  LevelFormat,
  convertMillimetersToTwip,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  Bookmark,
  InternalHyperlink,
  type IRunOptions,
  type ILevelsOptions,
  type IParagraphOptions,
} from 'docx'
import { DocxExportOptions, DEFAULT_DOCX_OPTIONS } from './docxOptions'
import type { BlockNode, NoteDocument } from '../../types/note'
import { computeBlockTableValues } from '../../editor-core/tableFormula'
import { renderMermaidToSvg } from './mermaidToSvg'
import { renderMarkmapToSvg } from './markmapToSvg'
import { renderVegaToSvg } from './vegaToSvg'
import { renderMathToSvg } from './mathToSvg'
import type { RasterPng } from './svgRaster'
import { normalizeDatabaseData, type DatabaseBlockData, type DbCellValue, type DbField } from '../../types/database-block'
import { visibleRecords } from '../../editor-core/databaseFilterSort'

/** Raster image type accepted by docx's ImageRun (excludes SVG; we rasterize). */
export type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp'

export interface LoadedDocxImage {
  data: Uint8Array
  type: DocxImageType
  width: number
  height: number
}

/** Webview-dependent helpers injected by the caller so the serializer stays
 *  pure and unit-testable (tests stub these). */
export interface DocxExportHelpers {
  /** Load a workspace asset by its note-relative src into raw image bytes. */
  loadAssetImage(src: string): Promise<LoadedDocxImage | null>
  /** Rasterize an SVG string to PNG bytes (uses canvas in the webview). */
  rasterizeSvg(svg: string): Promise<RasterPng | null>
}

interface Ctx extends DocxExportHelpers {
  numbering: { reference: string; levels: ILevelsOptions[] }[]
  orderedSeq: number
  headingCounters?: number[]
  options?: DocxExportOptions
  /** Whether a self-contained table of contents is being built; when set, every
   *  rendered heading (levels 1-3) gets a bookmark and contributes an entry. */
  toc?: boolean
  tocEntries?: { level: number; text: string; anchor: string }[]
}

function nodeText(node: BlockNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(nodeText).join('')
}

/** Font with broad emoji coverage. Word maps it natively; LibreOffice and other
 *  viewers substitute their own colour-emoji font (Noto/Apple) for it. The body
 *  font (Calibri/...) lacks emoji glyphs, so emoji runs must opt into this one. */
const EMOJI_FONT = 'Segoe UI Emoji'

// Emoji clusters: flags (regional-indicator pairs), keycaps, and pictographic
// bases with optional skin-tone/variation selectors and ZWJ sequences.
const EMOJI_RE =
  /(?:\p{RI}\p{RI}|[#*0-9]️⃣|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️)?(?:‍\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️)?)*)/gu

/** Split a run's text into runs, tagging emoji clusters with an emoji-capable
 *  font while preserving every other run option. Returns at least one run. */
function emojiRuns(base: MutableRunOptions): TextRun[] {
  const text = base.text ?? ''
  if (!text || !EMOJI_RE.test(text)) return [new TextRun(base)]
  EMOJI_RE.lastIndex = 0
  const runs: TextRun[] = []
  let last = 0
  let match: RegExpExecArray | null
  const push = (slice: string, emoji: boolean) => {
    if (!slice) return
    runs.push(new TextRun(emoji ? { ...base, text: slice, font: EMOJI_FONT } : { ...base, text: slice }))
  }
  while ((match = EMOJI_RE.exec(text)) !== null) {
    push(text.slice(last, match.index), false)
    push(match[0], true)
    last = match.index + match[0].length
  }
  push(text.slice(last), false)
  return runs.length ? runs : [new TextRun(base)]
}

/** Emoji-aware runs from a plain string plus optional run styling. */
function textRuns(text: string, extra: MutableRunOptions = {}): TextRun[] {
  return emojiRuns({ ...extra, text })
}

function getHeadingPrefix(level: number, ctx: Ctx): string {
  if (!ctx.headingCounters) {
    ctx.headingCounters = [0, 0, 0, 0, 0, 0]
  }
  ctx.headingCounters[level - 1]++
  for (let i = level; i < 6; i++) {
    ctx.headingCounters[i] = 0
  }
  const segments = ctx.headingCounters.slice(0, level)
  // Drop leading levels that were never numbered (e.g. a note that starts at H2)
  // so we don't emit "0.1." style prefixes.
  while (segments.length > 1 && segments[0] === 0) segments.shift()
  return segments.join('.') + '. '
}

const CONTENT_WIDTH_PX = 600
const LINK_COLOR = '2563EB'

function safeHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const hex = value.trim().replace(/^#/, '')
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : undefined
}

function fitTransform(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: CONTENT_WIDTH_PX, height: 400 }
  if (width <= CONTENT_WIDTH_PX) return { width: Math.round(width), height: Math.round(height) }
  const k = CONTENT_WIDTH_PX / width
  return { width: CONTENT_WIDTH_PX, height: Math.round(height * k) }
}

function alignmentOf(value: unknown) {
  switch (value) {
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    case 'left': return AlignmentType.LEFT
    default: return undefined
  }
}

type MutableRunOptions = { -readonly [K in keyof IRunOptions]: IRunOptions[K] }

function textRun(node: BlockNode, forceBold = false): TextRun[] {
  const marks = node.marks ?? []
  const opts: MutableRunOptions = { text: node.text ?? '' }
  if (forceBold) opts.bold = true
  let isLink = false
  for (const mark of marks) {
    switch (mark.type) {
      case 'strong': opts.bold = true; break
      case 'em': opts.italics = true; break
      case 'strike': opts.strike = true; break
      case 'underline': opts.underline = {}; break
      case 'code': opts.font = 'Consolas'; break
      case 'superscript': opts.superScript = true; break
      case 'subscript': opts.subScript = true; break
      case 'highlight': {
        const fill = safeHex(mark.attrs?.color) ?? 'FEF08A'
        opts.shading = { type: ShadingType.CLEAR, fill }
        break
      }
      case 'text_color':
      case 'color': {
        const color = safeHex(mark.attrs?.color)
        if (color) opts.color = color
        break
      }
      case 'internal_link':
        opts.color = LINK_COLOR
        opts.underline = {}
        break
      case 'link':
        isLink = true
        break
    }
  }
  if (isLink) {
    opts.color = LINK_COLOR
    opts.underline = {}
  }
  return emojiRuns(opts)
}

type InlineChild = TextRun | ExternalHyperlink | ImageRun

async function mathRun(latex: string, display: boolean, ctx: Ctx): Promise<InlineChild | null> {
  const svg = await renderMathToSvg(latex, display)
  if (!svg) return null
  const raster = await ctx.rasterizeSvg(svg)
  if (!raster) return null
  return new ImageRun({ data: raster.data, type: 'png', transformation: fitTransform(raster.width, raster.height) })
}

async function inlineChildren(node: BlockNode, ctx: Ctx, forceBold = false): Promise<InlineChild[]> {
  const out: InlineChild[] = []
  for (const child of node.content ?? []) {
    if (child.type === 'text') {
      const link = child.marks?.find(m => m.type === 'link')
      const runs = textRun(child, forceBold)
      const href = link?.attrs?.href ? String(link.attrs.href) : ''
      if (href) out.push(new ExternalHyperlink({ children: runs, link: href }))
      else out.push(...runs)
    } else if (child.type === 'hard_break') {
      out.push(new TextRun({ break: 1 }))
    } else if (child.type === 'math_inline') {
      const latex = String(child.attrs?.latex ?? '')
      const run = await mathRun(latex, false, ctx)
      out.push(run ?? new TextRun({ text: latex, italics: true }))
    } else if (child.content) {
      out.push(...await inlineChildren(child, ctx, forceBold))
    }
  }
  return out
}

function indentForLevel(level: number) {
  return { left: 720 + level * 360, hanging: 360 }
}

function bulletLevels(): ILevelsOptions[] {
  const glyphs = ['●', '○', '■', '●', '○', '■']
  return Array.from({ length: 6 }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: glyphs[level],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: indentForLevel(level) } },
  }))
}

function orderedLevels(): ILevelsOptions[] {
  const formats = [
    LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN,
    LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN,
  ]
  return Array.from({ length: 6 }, (_, level) => ({
    level,
    format: formats[level],
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: indentForLevel(level) } },
  }))
}

const BULLET_REFERENCE = 'nv-bullet'

function ensureBulletConfig(ctx: Ctx): void {
  if (!ctx.numbering.some(c => c.reference === BULLET_REFERENCE)) {
    ctx.numbering.push({ reference: BULLET_REFERENCE, levels: bulletLevels() })
  }
}

function newOrderedReference(ctx: Ctx): string {
  const reference = `nv-ordered-${++ctx.orderedSeq}`
  ctx.numbering.push({ reference, levels: orderedLevels() })
  return reference
}

async function listParagraphs(
  listNode: BlockNode,
  ctx: Ctx,
  level: number,
  reference: string,
): Promise<Paragraph[]> {
  const out: Paragraph[] = []
  for (const item of listNode.content ?? []) {
    const children = item.content ?? []
    let markerUsed = false
    for (const child of children) {
      if (child.type === 'bullet_list' || child.type === 'ordered_list') {
        const nestedRef = child.type === 'ordered_list'
          ? newOrderedReference(ctx)
          : (ensureBulletConfig(ctx), BULLET_REFERENCE)
        out.push(...await listParagraphs(child, ctx, level + 1, nestedRef))
      } else {
        const runs = await inlineChildren(child, ctx)
        const numProps: IParagraphOptions = markerUsed
          ? { indent: { left: 720 + level * 360 } }
          : { numbering: { reference, level } }
        out.push(new Paragraph({ children: runs, ...numProps }))
        markerUsed = true
      }
    }
    if (!markerUsed) {
      out.push(new Paragraph({ children: [], numbering: { reference, level } }))
    }
  }
  return out
}

async function imageParagraphFromRaster(raster: RasterPng): Promise<Paragraph> {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: raster.data, type: 'png', transformation: fitTransform(raster.width, raster.height) })],
  })
}

async function rasterBlock(svg: string | null, ctx: Ctx, captionText = ''): Promise<Paragraph[]> {
  if (!svg || !svg.trim()) return []
  const raster = await ctx.rasterizeSvg(svg)
  if (!raster) return []
  const out = [await imageParagraphFromRaster(raster)]
  if (captionText.trim()) {
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: captionText, italics: true, size: 18 })] }))
  }
  return out
}

function calloutShade(fill: string): IParagraphOptions {
  return {
    shading: { type: ShadingType.CLEAR, fill },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: '8AA2C8', space: 12 } },
  }
}

async function tableCell(cell: BlockNode, ctx: Ctx, header: boolean): Promise<TableCell> {
  const children: (Paragraph | Table)[] = []
  for (const child of cell.content ?? []) {
    if (child.type === 'paragraph' || child.type === 'heading') {
      const runs = await inlineChildren(child, ctx, header)
      children.push(new Paragraph({ children: runs, alignment: alignmentOf(cell.attrs?.align) }))
    } else {
      children.push(...await blocksFor(child, ctx))
    }
  }
  if (!children.length) children.push(new Paragraph({ children: [] }))
  const fill = header ? 'F1F5F9' : safeHex(cell.attrs?.background)
  return new TableCell({
    children,
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
  })
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

function databaseBlockTable(data: DatabaseBlockData): Table | null {
  if (!data.fields.length) return null
  const records = databaseBlockRecords(data)
  const headerRow = new TableRow({
    tableHeader: true,
    children: data.fields.map(field => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: field.name, bold: true })] })],
      shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
    })),
  })
  const dataRows = records.map(record => new TableRow({
    children: data.fields.map(field => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: formatDbCellValue(record.cells[field.id] ?? null, field) })] })],
    })),
  }))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] })
}

async function tableFor(node: BlockNode, ctx: Ctx): Promise<Table> {
  const rows = node.content ?? []
  const values = computeBlockTableValues(node)
  const tableRows: TableRow[] = []
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const cells: TableCell[] = []
    const rowCells = row.content ?? []
    for (let c = 0; c < rowCells.length; c++) {
      const cell = rowCells[c]
      const header = cell.type === 'table_header'
      const formula = typeof cell.attrs?.formula === 'string' ? cell.attrs.formula.trim() : ''
      if (formula) {
        const value = values.get(`${r}:${c}`)?.value ?? formula
        cells.push(new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: value, bold: header })] })],
          shading: header ? { type: ShadingType.CLEAR, fill: 'F1F5F9' } : undefined,
        }))
      } else {
        cells.push(await tableCell(cell, ctx, header))
      }
    }
    tableRows.push(new TableRow({ children: cells, tableHeader: r === 0 }))
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })
}

/** Render a container's children, applying paragraph-level decoration (shading,
 *  borders, indent) to direct paragraph/heading children. Non-paragraph children
 *  (nested lists, tables, images) are rendered without decoration. */
async function decoratedBlocks(
  node: BlockNode,
  ctx: Ctx,
  decoration: IParagraphOptions,
  prefix = '',
): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = []
  let prefixUsed = false
  for (const child of node.content ?? []) {
    if (child.type === 'paragraph' || child.type === 'heading') {
      const runs = await inlineChildren(child, ctx)
      const prefixRuns = prefix && !prefixUsed ? textRuns(prefix) : []
      prefixUsed = true
      out.push(new Paragraph({ children: [...prefixRuns, ...runs], ...decoration }))
    } else {
      out.push(...await blocksFor(child, ctx))
    }
  }
  return out
}

async function blocksFor(node: BlockNode, ctx: Ctx): Promise<(Paragraph | Table)[]> {
  switch (node.type) {
    case 'doc':
    case 'column_list':
    case 'column': {
      const out: (Paragraph | Table)[] = []
      for (const child of node.content ?? []) out.push(...await blocksFor(child, ctx))
      return out
    }
    case 'paragraph':
      return [new Paragraph({ children: await inlineChildren(node, ctx) })]
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      const headingLevel = [
        HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
      ][level - 1]
      const children = await inlineChildren(node, ctx)
      let prefix = ''
      if (ctx.options?.headingNumbers) {
        prefix = getHeadingPrefix(level, ctx)
        children.unshift(...textRuns(prefix))
      }
      if (ctx.toc && level <= 3) {
        const anchor = `_Toc_${(ctx.tocEntries ??= []).length}`
        ctx.tocEntries.push({ level, text: prefix + nodeText(node), anchor })
        return [new Paragraph({ heading: headingLevel, children: [new Bookmark({ id: anchor, children })] })]
      }
      return [new Paragraph({ heading: headingLevel, children })]
    }
    case 'code_block': {
      const text = (node.content ?? []).map(c => c.text ?? '').join('')
      const runs: TextRun[] = []
      text.split('\n').forEach((line, i) => {
        runs.push(new TextRun({ text: line, font: 'Consolas', size: 18, break: i === 0 ? 0 : 1 }))
      })
      return [new Paragraph({ children: runs, shading: { type: ShadingType.CLEAR, fill: 'F4F6F8' } })]
    }
    case 'blockquote': {
      const decoration: IParagraphOptions = {
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: '8AA2C8', space: 12 } },
      }
      return decoratedBlocks(node, ctx, decoration)
    }
    case 'bullet_list':
      ensureBulletConfig(ctx)
      return listParagraphs(node, ctx, 0, BULLET_REFERENCE)
    case 'ordered_list':
      return listParagraphs(node, ctx, 0, newOrderedReference(ctx))
    case 'list_item': {
      const out: (Paragraph | Table)[] = []
      for (const child of node.content ?? []) out.push(...await blocksFor(child, ctx))
      return out
    }
    case 'checklist_item': {
      const box = node.attrs?.checked === true ? '☑ ' : '☐ '
      const runs = await inlineChildren(node, ctx)
      return [new Paragraph({ children: [...textRuns(box), ...runs] })]
    }
    case 'callout': {
      const icon = String(node.attrs?.icon ?? '')
      return decoratedBlocks(node, ctx, calloutShade('F5F7FB'), icon ? `${icon} ` : '')
    }
    case 'divider':
      return [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D8DEE8', space: 1 } } })]
    case 'image_block': {
      const src = String(node.attrs?.src ?? '')
      if (!src) return []
      const img = await ctx.loadAssetImage(src)
      const out: (Paragraph | Table)[] = []
      const align = alignmentOf(node.attrs?.align) ?? AlignmentType.CENTER
      if (img) {
        out.push(new Paragraph({ alignment: align, children: [new ImageRun({ data: img.data, type: img.type, transformation: fitTransform(img.width, img.height) })] }))
      }
      const caption = String(node.attrs?.caption ?? '')
      if (caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: caption, italics: true, size: 18 })] }))
      return out
    }
    case 'file_block': {
      const filename = String(node.attrs?.filename ?? 'file')
      return [new Paragraph({ children: textRuns(`📎 ${filename}`) })]
    }
    case 'media_block': {
      const kind = node.attrs?.kind === 'video' ? 'video' : 'audio'
      const name = String(node.attrs?.name ?? (kind === 'video' ? 'Video' : 'Audio'))
      return [new Paragraph({ children: textRuns(`${kind === 'video' ? '🎬' : '🔊'} ${name}`, { italics: true }) })]
    }
    case 'math_block': {
      const latex = String(node.attrs?.latex ?? (node.content ?? []).map(c => c.text ?? '').join(''))
      const blocks = await rasterBlock(await renderMathToSvg(latex, true), ctx)
      if (blocks.length) return blocks
      return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: latex, italics: true })] })]
    }
    case 'mermaid_block':
      return rasterBlock(await renderMermaidToSvg(String(node.attrs?.code ?? '')), ctx)
    case 'markmap_block':
      return rasterBlock(await renderMarkmapToSvg(String(node.attrs?.markdown ?? '')), ctx)
    case 'vega_block':
      return rasterBlock(await renderVegaToSvg(String(node.attrs?.spec ?? '')), ctx)
    case 'draw_block':
      return rasterBlock(String(node.attrs?.svgPreview ?? ''), ctx, String(node.attrs?.title ?? ''))
    case 'note_embed': {
      const title = String(node.attrs?.title ?? 'Note')
      const previewText = String(node.attrs?.previewText ?? '')
      const out = [new Paragraph({ children: textRuns(title, { bold: true }), ...calloutShade('F5F7FB') })]
      if (previewText.trim()) out.push(new Paragraph({ children: textRuns(previewText), ...calloutShade('F5F7FB') }))
      return out
    }
    case 'embed_block': {
      const url = String(node.attrs?.url ?? '')
      if (!url) return []
      const title = String(node.attrs?.title ?? '').trim() || url
      return [new Paragraph({ children: [new ExternalHyperlink({ link: url, children: [new TextRun({ text: title, color: LINK_COLOR, underline: {} })] })] })]
    }
    case 'toggle': {
      const titleNode = (node.content ?? []).find(c => c.type === 'toggle_title')
      const bodyNodes = (node.content ?? []).filter(c => c.type !== 'toggle_title')
      const out: (Paragraph | Table)[] = []
      if (titleNode) out.push(new Paragraph({ children: await inlineChildren(titleNode, ctx, true) }))
      for (const child of bodyNodes) out.push(...await blocksFor(child, ctx))
      return out
    }
    case 'toggle_title':
      return [new Paragraph({ children: await inlineChildren(node, ctx, true) })]
    case 'table':
      return [await tableFor(node, ctx)]
    case 'database_block': {
      const data = normalizeDatabaseData(node.attrs?.data)
      const out: (Paragraph | Table)[] = []
      const title = data.title.trim()
      if (title) out.push(new Paragraph({ children: textRuns(title, { bold: true }) }))
      const table = databaseBlockTable(data)
      if (table) out.push(table)
      return out
    }
    case 'hard_break':
      return []
    default: {
      if (node.content?.length) {
        const out: (Paragraph | Table)[] = []
        for (const child of node.content) out.push(...await blocksFor(child, ctx))
        return out
      }
      return []
    }
  }
}

/** Build a docx Document from a note. Pass webview helpers for image loading and
 *  SVG rasterization; the returned Document is packed by the caller. */
export async function serializeNoteToDocx(
  note: NoteDocument,
  helpers: DocxExportHelpers,
  options?: DocxExportOptions
): Promise<Document> {
  const opts = options ?? DEFAULT_DOCX_OPTIONS
  const ctx: Ctx = {
    ...helpers,
    numbering: [],
    orderedSeq: 0,
    headingCounters: [0, 0, 0, 0, 0, 0],
    options: opts,
  }

  ctx.toc = opts.tableOfContents
  const title = note.title.trim() || 'Untitled note'
  const icon = note.icon.trim()
  const titleText = icon ? `${icon} ${title}` : title

  // Render the body first so heading bookmarks and the table-of-contents entries
  // are collected before the (preceding) TOC is assembled.
  const bodyBlocks = await blocksFor(note.content, ctx)

  const children: (Paragraph | Table)[] = []

  // 1. Title Page processing
  if (opts.exportNoteTitle) {
    if (opts.titlePage) {
      children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { before: 2400, after: 240 },
        children: textRuns(titleText, { size: 48, bold: true }),
      }))
      children.push(new Paragraph({ children: [new PageBreak()] }))
    } else {
      children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        children: textRuns(titleText),
      }))
    }
  }

  // 2. Table of Contents — built manually from collected heading bookmarks so it
  //    renders (and stays clickable) in every viewer, not only those that
  //    recompute Word TOC fields.
  if (opts.tableOfContents && ctx.tocEntries?.length) {
    children.push(new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: 'Table of Contents', bold: true, size: 32 })],
    }))
    for (const entry of ctx.tocEntries) {
      children.push(new Paragraph({
        indent: { left: (entry.level - 1) * 360 },
        spacing: { after: 40 },
        children: [new InternalHyperlink({ anchor: entry.anchor, children: textRuns(entry.text) })],
      }))
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // 3. Main content
  children.push(...bodyBlocks)

  // 4. Page Size & Orientation
  const pageOpts: { width: number; height: number; orientation: 'portrait' | 'landscape' } = {
    width: convertMillimetersToTwip(210),
    height: convertMillimetersToTwip(297),
    orientation: 'portrait',
  }

  if (opts.paperFormat === 'Letter') {
    pageOpts.width = convertMillimetersToTwip(215.9)
    pageOpts.height = convertMillimetersToTwip(279.4)
  }

  if (opts.orientation === 'landscape') {
    const tmp = pageOpts.width
    pageOpts.width = pageOpts.height
    pageOpts.height = tmp
    pageOpts.orientation = 'landscape'
  }

  // 5. Margins in millimeters converted to twips
  const marginOpts = {
    top: convertMillimetersToTwip(opts.marginTop),
    right: convertMillimetersToTwip(opts.marginRight),
    bottom: convertMillimetersToTwip(opts.marginBottom),
    left: convertMillimetersToTwip(opts.marginLeft),
  }

  // 6. Running headers & Page numbers
  const headersFooters: {
    headers?: { default?: Header; first?: Header }
    footers?: { default?: Footer; first?: Footer }
  } = {}

  if (opts.runningHeader) {
    headersFooters.headers = {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: title,
                size: 18,
                color: '888888',
              })
            ]
          })
        ]
      })
    }
  }

  if (opts.pageNumbers) {
    headersFooters.footers = {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                size: 18,
                color: '888888',
              })
            ]
          })
        ]
      })
    }
  }

  // 7. Typography (font, size, line spacing)
  const fontName = opts.fontFamily || 'Calibri'
  const fontSizeHalfPoints = opts.fontSize * 2

  // line spacing in twips: multiplier * 240
  const spacingLine = Math.round(opts.lineSpacing * 240)
  // paragraph spacing in twips (dxa): pt * 20
  const spacingAfter = Math.round(opts.paragraphSpacing * 20)

  return new Document({
    features: {
      updateFields: true,
    },
    numbering: { config: ctx.numbering },
    styles: {
      default: {
        document: {
          run: {
            size: fontSizeHalfPoints,
            font: fontName,
          },
          paragraph: {
            spacing: {
              line: spacingLine,
              after: spacingAfter,
            }
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: pageOpts,
          margin: marginOpts,
        },
        titlePage: opts.titlePage && opts.exportNoteTitle,
      },
      ...headersFooters,
      children,
    }],
  })
}
