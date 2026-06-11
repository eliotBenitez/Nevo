import type { BlockNode, NoteDocument } from '../../types/note'
import { getPluginNodeSerializer } from '../../editor-core/plugin-host/active-serialization'
import type { NevoSerializableNode } from '../../types/editor-plugin'
import { renderKatexToString } from '../katex'
import { renderMermaidToSvg } from './mermaidToSvg'
import { renderMarkmapToSvg } from './markmapToSvg'

export interface HtmlSerializeResult {
  html: string
  assetSrcs: string[]
}

export interface SerializeCtx {
  assetSrcs: string[]
  assetsSubfolderName: string
}

const VOID_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

const KATEX_EXPORT_CSS = `.katex {
  font: normal 1.18em KaTeX_Main, "Times New Roman", serif;
  line-height: 1.2;
  text-indent: 0;
  text-rendering: auto;
  white-space: nowrap;
}
.katex-display {
  display: block;
  margin: 1em 0;
  text-align: center;
}
.katex .katex-html {
  display: inline-block;
}
.katex .base {
  display: inline-block;
  position: relative;
  white-space: nowrap;
}
.katex .strut {
  display: inline-block;
}
.katex .mord,
.katex .mop,
.katex .mbin,
.katex .mrel,
.katex .mopen,
.katex .mclose,
.katex .mpunct {
  display: inline-block;
}
.katex .mfrac {
  display: inline-block;
  vertical-align: -0.35em;
}
.katex .vlist-t {
  display: inline-table;
  table-layout: fixed;
}
.katex .vlist-r {
  display: table-row;
}
.katex .vlist {
  display: table-cell;
  position: relative;
  vertical-align: bottom;
}
.katex .vlist > span {
  display: block;
  height: 0;
  position: relative;
}
.katex .vlist-s {
  display: table-cell;
  font-size: 1px;
  min-width: 2px;
  vertical-align: bottom;
}
.katex .pstrut {
  display: block;
  overflow: hidden;
}
.katex .frac-line {
  border-bottom-style: solid;
  display: inline-block;
  width: 100%;
}
.katex .msupsub {
  display: inline-block;
  position: relative;
}
.katex .mspace {
  display: inline-block;
}
.katex .mathnormal {
  font-style: italic;
}
.katex .sizing {
  display: inline-block;
}`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const color = value.trim()
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color
  if (/^[a-z]+$/i.test(color)) return color
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color
  if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color
  return null
}

function basename(src: string): string {
  return src.split(/[\\/]/).filter(Boolean).pop() ?? src
}

function isLocalAssetSrc(src: string): boolean {
  if (!src || src.startsWith('#') || src.startsWith('//')) return false
  if (VOID_SCHEME_RE.test(src)) return false
  return true
}

function registerAsset(src: string, ctx: SerializeCtx): string {
  if (!isLocalAssetSrc(src)) return src
  if (!ctx.assetSrcs.includes(src)) ctx.assetSrcs.push(src)
  return `${ctx.assetsSubfolderName}/${basename(src)}`
}

function attr(name: string, value: string | null | undefined): string {
  if (!value) return ''
  return ` ${name}="${escapeAttr(value)}"`
}

function boolAttr(name: string, value: boolean): string {
  return value ? ` ${name}` : ''
}

function inlineContent(node: BlockNode, ctx: SerializeCtx): string {
  if (!node.content?.length) return ''
  return node.content.map(child => inlineNode(child, ctx)).join('')
}

function inlineNode(node: BlockNode, ctx: SerializeCtx): string {
  if (node.type === 'text') return wrapMarks(escapeHtml(node.text ?? ''), node.marks)
  if (node.type === 'hard_break') return '<br>'
  if (node.type === 'math_inline') {
    const latex = String(node.attrs?.latex ?? '')
    return `<span class="math-inline" data-latex="${escapeAttr(latex)}">${renderMath(latex, false)}</span>`
  }
  return inlineContent(node, ctx)
}

function renderMath(latex: string, displayMode: boolean): string {
  try {
    return renderKatexToString(latex || '\\;', { displayMode, throwOnError: true, output: 'html' })
  } catch {
    const tag = displayMode ? 'pre' : 'code'
    return `<${tag} class="math-error">${escapeHtml(latex || '(empty formula)')}</${tag}>`
  }
}

function wrapMarks(content: string, marks: BlockNode['marks']): string {
  if (!marks?.length) return content
  let out = content
  for (const mark of marks) {
    switch (mark.type) {
      case 'strong':
        out = `<strong>${out}</strong>`
        break
      case 'em':
        out = `<em>${out}</em>`
        break
      case 'code':
        out = `<code>${out}</code>`
        break
      case 'strike':
        out = `<s>${out}</s>`
        break
      case 'underline':
        out = `<u>${out}</u>`
        break
      case 'highlight': {
        const color = safeColor(mark.attrs?.color)
        out = color ? `<mark style="background-color: ${escapeAttr(color)}">${out}</mark>` : `<mark>${out}</mark>`
        break
      }
      case 'text_color':
      case 'color': {
        const color = safeColor(mark.attrs?.color)
        if (color) out = `<span style="color: ${escapeAttr(color)}">${out}</span>`
        break
      }
      case 'superscript':
        out = `<sup>${out}</sup>`
        break
      case 'subscript':
        out = `<sub>${out}</sub>`
        break
      case 'link': {
        const href = String(mark.attrs?.href ?? '')
        out = `<a href="${escapeAttr(href)}">${out}</a>`
        break
      }
      case 'internal_link': {
        const noteId = String(mark.attrs?.noteId ?? '')
        const anchor = mark.attrs?.anchor ? String(mark.attrs.anchor) : ''
        const href = `nevo://note/${encodeURIComponent(noteId)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`
        out = `<a href="${escapeAttr(href)}" data-note-id="${escapeAttr(noteId)}"${attr('data-anchor', anchor)}>${out}</a>`
        break
      }
    }
  }
  return out
}

function codeText(node: BlockNode): string {
  return (node.content ?? []).map(c => c.text ?? '').join('')
}

async function blockChildren(node: BlockNode, ctx: SerializeCtx): Promise<string> {
  const children = await Promise.all((node.content ?? []).map(child => blockNode(child, ctx)))
  return children.filter(Boolean).join('\n')
}

function tableCellStyle(node: BlockNode): string {
  const styles: string[] = []
  const align = typeof node.attrs?.align === 'string' ? node.attrs.align : ''
  if (['left', 'center', 'right', 'justify'].includes(align)) styles.push(`text-align: ${align}`)
  const background = safeColor(node.attrs?.background)
  if (background) styles.push(`background-color: ${background}`)
  const borderColor = safeColor(node.attrs?.borderColor)
  if (borderColor) styles.push(`border-color: ${borderColor}`)
  const textColor = safeColor(node.attrs?.textColor)
  if (textColor) styles.push(`color: ${textColor}`)
  const padding = typeof node.attrs?.padding === 'string' && /^[\w\s.%()+-]+$/.test(node.attrs.padding)
    ? node.attrs.padding.trim()
    : ''
  if (padding) styles.push(`padding: ${padding}`)
  return styles.length ? ` style="${escapeAttr(styles.join('; '))}"` : ''
}

async function listItemContent(node: BlockNode, ctx: SerializeCtx): Promise<string> {
  const parts = node.content ?? []
  const children = await Promise.all(parts.map(child => blockNode(child, ctx)))
  return children.filter(Boolean).join('\n')
}

export async function blockNode(node: BlockNode, ctx: SerializeCtx): Promise<string> {
  switch (node.type) {
    case 'doc':
      return blockChildren(node, ctx)
    case 'paragraph': {
      const body = inlineContent(node, ctx)
      return `<p>${body || '<br>'}</p>`
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `<h${level}>${inlineContent(node, ctx)}</h${level}>`
    }
    case 'code_block': {
      const language = String(node.attrs?.language ?? node.attrs?.lang ?? '')
      const className = language ? `language-${language.replace(/[^\w-]/g, '')}` : ''
      return `<pre><code${attr('class', className)}>${escapeHtml(codeText(node))}</code></pre>`
    }
    case 'blockquote':
      return `<blockquote>\n${await blockChildren(node, ctx)}\n</blockquote>`
    case 'bullet_list': {
      const items = await Promise.all((node.content ?? []).map(async item => `<li>${await listItemContent(item, ctx)}</li>`))
      return `<ul>\n${items.join('\n')}\n</ul>`
    }
    case 'ordered_list': {
      const items = await Promise.all((node.content ?? []).map(async item => `<li>${await listItemContent(item, ctx)}</li>`))
      return `<ol>\n${items.join('\n')}\n</ol>`
    }
    case 'list_item':
      return listItemContent(node, ctx)
    case 'checklist_item': {
      const checked = node.attrs?.checked === true
      return `<div class="checklist-item"><input type="checkbox" disabled${boolAttr('checked', checked)}> <span>${inlineContent(node, ctx)}</span></div>`
    }
    case 'table': {
      const rows = node.content ?? []
      if (!rows.length) return ''
      const htmlRows = await Promise.all(rows.map(async row => {
        const cells = await Promise.all((row.content ?? []).map(async cell => {
          const tag = cell.type === 'table_header' ? 'th' : 'td'
          const body = cell.content?.length === 1 && cell.content[0].type === 'paragraph'
            ? inlineContent(cell.content[0], ctx)
            : await blockChildren(cell, ctx)
          return `<${tag}${tableCellStyle(cell)}>${body}</${tag}>`
        }))
        return `<tr>${cells.join('')}</tr>`
      }))
      return `<table>\n<tbody>\n${htmlRows.join('\n')}\n</tbody>\n</table>`
    }
    case 'callout': {
      const variant = String(node.attrs?.variant ?? 'info')
      const icon = String(node.attrs?.icon ?? '')
      return `<aside class="callout" data-variant="${escapeAttr(variant)}">${icon ? `<span class="callout-icon">${escapeHtml(icon)}</span>` : ''}<div class="callout-body">\n${await blockChildren(node, ctx)}\n</div></aside>`
    }
    case 'divider':
      return '<hr>'
    case 'image_block': {
      const src = String(node.attrs?.src ?? '')
      if (!src) return ''
      const localSrc = registerAsset(src, ctx)
      const alt = String(node.attrs?.alt ?? '')
      const caption = String(node.attrs?.caption ?? '')
      const align = String(node.attrs?.align ?? 'center')
      const width = typeof node.attrs?.width === 'number' || typeof node.attrs?.width === 'string' ? String(node.attrs.width) : ''
      const imgStyle = width ? ` style="${escapeAttr(`max-width: ${width}${/^\d+$/.test(width) ? 'px' : ''}`)}"` : ''
      return `<figure class="image-block align-${escapeAttr(align)}"><img src="${escapeAttr(localSrc)}" alt="${escapeAttr(alt)}"${imgStyle}>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`
    }
    case 'file_block': {
      const src = String(node.attrs?.src ?? '')
      if (!src) return ''
      const localSrc = registerAsset(src, ctx)
      const filename = String(node.attrs?.filename ?? (basename(src) || 'file'))
      return `<figure class="file-block"><a href="${escapeAttr(localSrc)}" download>${escapeHtml(filename)}</a></figure>`
    }
    case 'math_block': {
      const latex = String(node.attrs?.latex ?? codeText(node))
      return `<div class="math-block" data-latex="${escapeAttr(latex)}"><div class="math-render">${renderMath(latex, true)}</div></div>`
    }
    case 'mermaid_block': {
      const code = String(node.attrs?.code ?? '')
      const svg = await renderMermaidToSvg(code)
      const rendered = svg
        ? `<div class="mermaid-render"><img class="mermaid-svg" src="${escapeAttr(svgDataUri(svg))}" alt="Mermaid diagram"></div>`
        : `<div class="mermaid-error">Invalid diagram syntax</div>`
      return `<figure class="mermaid-block">${rendered}<details class="source-details"><summary>Mermaid source</summary><pre><code>${escapeHtml(code)}</code></pre></details></figure>`
    }
    case 'markmap_block': {
      const markdown = String(node.attrs?.markdown ?? '')
      const svg = await renderMarkmapToSvg(markdown)
      const rendered = svg
        ? `<div class="markmap-render"><img class="markmap-svg" src="${escapeAttr(svgDataUri(svg))}" alt="Mind map"></div>`
        : `<div class="markmap-error">Empty mind map</div>`
      return `<figure class="markmap-block">${rendered}<details class="source-details"><summary>Mind map source</summary><pre><code>${escapeHtml(markdown)}</code></pre></details></figure>`
    }
    case 'note_embed': {
      const noteId = String(node.attrs?.noteId ?? '')
      const title = String(node.attrs?.title ?? 'Note embed')
      const previewText = String(node.attrs?.previewText ?? '')
      const href = `nevo://note/${encodeURIComponent(noteId)}`
      return `<article class="note-embed" data-note-id="${escapeAttr(noteId)}"><a href="${escapeAttr(href)}">${escapeHtml(title)}</a>${previewText ? `<p>${escapeHtml(previewText)}</p>` : ''}</article>`
    }
    case 'media_block': {
      const kind = String(node.attrs?.kind ?? 'audio') === 'video' ? 'video' : 'audio'
      const src = String(node.attrs?.src ?? '')
      if (!src) return ''
      const localSrc = registerAsset(src, ctx)
      const poster = String(node.attrs?.poster ?? '')
      const localPoster = poster ? registerAsset(poster, ctx) : ''
      const name = String(node.attrs?.name ?? (kind === 'video' ? 'Video' : 'Audio'))
      const mime = String(node.attrs?.mime ?? '')
      const source = `<source src="${escapeAttr(localSrc)}"${attr('type', mime)}>`
      const media = kind === 'video'
        ? `<video controls${attr('poster', localPoster)}>${source}</video>`
        : `<audio controls>${source}</audio>`
      return `<figure class="media-block">${media}<figcaption>${escapeHtml(name)}</figcaption></figure>`
    }
    case 'column_list': {
      const cols = await Promise.all((node.content ?? []).map(child => blockNode(child, ctx)))
      return `<div class="column-list" style="display:flex;gap:24px;align-items:flex-start">${cols.filter(Boolean).join('')}</div>`
    }
    case 'column': {
      const w = Number(node.attrs?.width)
      const grow = Number.isFinite(w) && w > 0 ? w : 1
      const inner = await blockChildren(node, ctx)
      return `<div class="column" style="flex:${grow} 1 0;min-width:0">${inner}</div>`
    }
    case 'hard_break':
      return '<br>'
    default: {
      const pluginSerializer = getPluginNodeSerializer(node.type)?.html
      if (pluginSerializer) {
        const childrenHtml = await blockChildren(node, ctx)
        return pluginSerializer(node as NevoSerializableNode, { serializeChildren: () => childrenHtml, escapeHtml })
      }
      const inline = inlineContent(node, ctx)
      if (inline) return inline
      return blockChildren(node, ctx)
    }
  }
}

function coverStyle(note: NoteDocument, ctx: SerializeCtx): string | null {
  const cover = note.cover?.trim()
  if (!cover) return null
  if (cover.startsWith('image:')) {
    const src = cover.slice(6)
    if (!src) return null
    return `background-image: url(${JSON.stringify(registerAsset(src, ctx))}); background-size: cover; background-position: center`
  }
  if (cover.startsWith('.nevo/') || cover.startsWith('/') || cover.startsWith('http://') || cover.startsWith('https://')) {
    return `background-image: url(${JSON.stringify(registerAsset(cover, ctx))}); background-size: cover; background-position: center`
  }
  if (cover.startsWith('gradient:')) {
    const gradient = cover.slice(9)
    return gradient ? `background: ${gradient}` : null
  }
  if (cover.startsWith('color:')) {
    const color = safeColor(cover.slice(6))
    return color ? `background: ${color}` : null
  }
  if (cover.includes('gradient(')) return `background: ${cover}`
  const color = safeColor(cover)
  return color ? `background: ${color}` : null
}

function noteHeader(note: NoteDocument, ctx: SerializeCtx): string {
  const title = note.title.trim() || 'Untitled note'
  const icon = note.icon.trim()
  const cover = coverStyle(note, ctx)
  return `${cover ? `<div class="note-cover" style="${escapeAttr(cover)}"></div>` : ''}
<header class="note-header">
${icon ? `<div class="note-icon" aria-hidden="true">${escapeHtml(icon)}</div>` : ''}
<h1 class="note-title">${escapeHtml(title)}</h1>
</header>`
}

function stylesheet(): string {
  return `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1f2933;
  background: #f6f7f9;
}
body {
  margin: 0;
  padding: 48px 20px;
}
main {
  max-width: 820px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #d8dee8;
  padding: 0 48px 48px;
  box-shadow: 0 18px 60px rgb(15 23 42 / 0.08);
}
.note-cover {
  height: 220px;
  margin: 0 -48px 36px;
  border-bottom: 1px solid #d8dee8;
}
.note-header {
  margin: 42px 0 28px;
}
.note-cover + .note-header {
  margin-top: 0;
}
.note-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  font-size: 42px;
  line-height: 1;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.18;
  margin: 1.6em 0 0.55em;
}
.note-title {
  margin-top: 0;
}
p, li, blockquote, figcaption, summary {
  line-height: 1.65;
}
a {
  color: #245ec4;
}
pre {
  overflow: auto;
  background: #111827;
  color: #f8fafc;
  border-radius: 6px;
  padding: 14px 16px;
}
.source-details pre {
  margin-bottom: 0;
}
code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
p code, li code {
  background: #eef2f7;
  color: #1f2933;
  border-radius: 4px;
  padding: 0.12em 0.32em;
}
blockquote, .callout {
  border-left: 4px solid #8aa2c8;
  margin: 1.2em 0;
  padding: 0.7em 1em;
  background: #f5f7fb;
}
.callout {
  display: flex;
  gap: 0.75em;
}
.callout-icon {
  flex: 0 0 auto;
}
details {
  border: 1px solid #d8dee8;
  border-radius: 6px;
  padding: 0.75em 1em;
  margin: 1em 0;
}
summary {
  cursor: pointer;
  font-weight: 650;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
}
td, th {
  border: 1px solid #d8dee8;
  padding: 0.55em 0.7em;
  vertical-align: top;
}
th {
  background: #f1f5f9;
  text-align: left;
}
figure {
  margin: 1.4em 0;
}
.image-block {
  display: flex;
  flex-direction: column;
}
.image-block.align-center {
  align-items: center;
}
.image-block.align-right {
  align-items: flex-end;
}
.image-block.align-left {
  align-items: flex-start;
}
img, video {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}
audio {
  width: 100%;
}
figcaption {
  color: #64748b;
  font-size: 0.92em;
  margin-top: 0.45em;
}
.align-center {
  text-align: center;
}
.align-right {
  text-align: right;
}
.file-block, .note-embed {
  border: 1px solid #d8dee8;
  border-radius: 6px;
  padding: 0.8em 1em;
}
.math-inline {
  display: inline;
  vertical-align: baseline;
  line-height: inherit;
}
.math-inline .katex {
  font-size: 1em;
  line-height: 0;
  vertical-align: baseline;
}
.math-block {
  margin: 1.2em 0;
  overflow-x: auto;
}
.math-block .math-render {
  text-align: center;
}
.math-error {
  background: #fef2f2;
  color: #991b1b;
}
.mermaid-block {
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 14px;
  background: #fff;
}
.mermaid-render {
  overflow-x: auto;
  text-align: center;
}
.mermaid-svg {
  max-width: 100%;
  height: auto;
  border-radius: 0;
}
.mermaid-error {
  color: #991b1b;
  background: #fef2f2;
  border-radius: 6px;
  padding: 0.8em 1em;
}
.source-details {
  margin-top: 12px;
  padding: 0;
  border: 0;
}
.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
  margin: 0.45em 0;
}
@media (max-width: 640px) {
  body {
    padding: 0;
    background: #fff;
  }
  main {
    border: 0;
    padding: 0 20px 28px;
    box-shadow: none;
  }
  .note-cover {
    margin: 0 -20px 28px;
    height: 160px;
  }
}`
}

export function serializeNoteToHtml(
  note: NoteDocument,
  assetsSubfolderName: string,
): Promise<HtmlSerializeResult> {
  const ctx: SerializeCtx = { assetSrcs: [], assetsSubfolderName }
  return serializeNoteToHtmlWithContext(note, ctx)
}

async function serializeNoteToHtmlWithContext(
  note: NoteDocument,
  ctx: SerializeCtx,
): Promise<HtmlSerializeResult> {
  const body = await blockNode(note.content, ctx)
  const title = note.title.trim() || 'Untitled note'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${stylesheet()}

${KATEX_EXPORT_CSS}
</style>
</head>
<body>
<main>
${noteHeader(note, ctx)}
${body}
</main>
</body>
</html>
`
  return { html, assetSrcs: ctx.assetSrcs }
}
