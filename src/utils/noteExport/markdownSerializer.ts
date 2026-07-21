import type { BlockNode, NoteDocument } from '../../types/note'
import { getPluginNodeSerializer } from '../../editor-core/plugin-host/active-serialization'
import { computeBlockTableValues, type FormulaCellResult } from '../../editor-core/tableFormula'
import type { NevoSerializableNode } from '../../types/editor-plugin'
import { normalizeDatabaseData, type DatabaseBlockData, type DbCellValue, type DbField } from '../../types/database-block'
import { visibleRecords } from '../../editor-core/databaseFilterSort'

export interface MarkdownSerializeResult {
  markdown: string
  assetSrcs: string[]
}

interface SerializeCtx {
  assetSrcs: string[]
  assetsSubfolderName: string
  listDepth: number
  ordered: boolean
  orderedIndex: number
}

function textNodeToMd(node: BlockNode, _ctx: SerializeCtx): string {
  if (!node.text) return ''
  let text = node.text
  const marks = node.marks ?? []
  const hasCode = marks.some(m => m.type === 'code')
  if (hasCode) return `\`${text}\``

  for (const mark of marks) {
    if (mark.type === 'strong') text = `**${text}**`
    else if (mark.type === 'em') text = `_${text}_`
    else if (mark.type === 'strike') text = `~~${text}~~`
    else if (mark.type === 'underline') text = `<u>${text}</u>`
    else if (mark.type === 'highlight') text = `<mark>${text}</mark>`
    else if (mark.type === 'superscript') text = `<sup>${text}</sup>`
    else if (mark.type === 'subscript') text = `<sub>${text}</sub>`
    else if (mark.type === 'link') {
      const href = String(mark.attrs?.href ?? '')
      text = `[${text}](${href})`
    } else if (mark.type === 'internal_link') {
      // Prefer the stored target title (the mark attribute set by the picker /
      // importer). Fall back to the visible text so legacy links without a
      // `title` attr still round-trip reasonably.
      const title = String(mark.attrs?.title ?? text)
      const alias = mark.attrs?.alias ? String(mark.attrs.alias) : ''
      // Only emit the `|alias` form when the alias actually differs from the
      // target title — otherwise `[[Title]]` is enough and less noisy.
      // (The visible `text` already equals the alias, so we compare alias↔title.)
      if (alias && alias !== title) {
        text = `[[${title}|${alias}]]`
      } else {
        text = `[[${title}]]`
      }
    }
  }
  return text
}

function inlineContent(node: BlockNode, ctx: SerializeCtx): string {
  if (!node.content?.length) return ''
  return node.content.map(child => {
    if (child.type === 'text') return textNodeToMd(child, ctx)
    if (child.type === 'hard_break') return '\n'
    if (child.type === 'math_inline') return `$${String(child.attrs?.latex ?? '')}$`
    return inlineContent(child, ctx)
  }).join('')
}

function prefixLines(text: string, prefix: string): string {
  return text.split('\n').map(l => `${prefix}${l}`).join('\n')
}

function tableRowToMd(
  row: BlockNode,
  ctx: SerializeCtx,
  rowIndex: number,
  values: Map<string, FormulaCellResult>,
): string {
  const cells = (row.content ?? []).map((cell, colIndex) => {
    const formula = typeof cell.attrs?.formula === 'string' ? cell.attrs.formula.trim() : ''
    const text = formula
      ? (values.get(`${rowIndex}:${colIndex}`)?.value ?? formula)
      : inlineContent(cell, ctx)
    return text.replace(/\|/g, '\\|')
  })
  return `| ${cells.join(' | ')} |`
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

function databaseBlockToMd(node: BlockNode): string {
  const data = normalizeDatabaseData(node.attrs?.data)
  const title = data.title.trim()
  const lines: string[] = []
  if (title) lines.push(`**${title.replace(/\|/g, '\\|')}**`)
  if (!data.fields.length) return lines.join('\n')
  const records = databaseBlockRecords(data)
  lines.push(`| ${data.fields.map(f => f.name.replace(/\|/g, '\\|')).join(' | ')} |`)
  lines.push(`| ${data.fields.map(() => '---').join(' | ')} |`)
  for (const record of records) {
    const cells = data.fields.map(f => formatDbCellValue(record.cells[f.id] ?? null, f).replace(/\|/g, '\\|'))
    lines.push(`| ${cells.join(' | ')} |`)
  }
  return lines.join('\n')
}

function nodeToMd(node: BlockNode, ctx: SerializeCtx): string {
  switch (node.type) {
    case 'doc': {
      return (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
    }
    case 'paragraph': {
      return inlineContent(node, ctx)
    }
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      return `${'#'.repeat(level)} ${inlineContent(node, ctx)}`
    }
    case 'code_block': {
      const lang = String(node.attrs?.language ?? node.attrs?.lang ?? '')
      const code = (node.content ?? []).map(c => c.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
      return prefixLines(inner, '> ')
    }
    case 'bullet_list': {
      const prevDepth = ctx.listDepth
      const prevOrdered = ctx.ordered
      ctx.ordered = false
      ctx.listDepth += 1
      const indent = '  '.repeat(prevDepth)
      const items = (node.content ?? []).map(child => {
        const inner = nodeToMd(child, ctx)
        return `${indent}- ${inner}`
      })
      ctx.listDepth = prevDepth
      ctx.ordered = prevOrdered
      return items.join('\n')
    }
    case 'ordered_list': {
      const prevDepth = ctx.listDepth
      const prevOrdered = ctx.ordered
      ctx.ordered = true
      ctx.orderedIndex = 1
      ctx.listDepth += 1
      const indent = '  '.repeat(prevDepth)
      const items = (node.content ?? []).map(child => {
        const idx = ctx.orderedIndex++
        const inner = nodeToMd(child, ctx)
        return `${indent}${idx}. ${inner}`
      })
      ctx.listDepth = prevDepth
      ctx.ordered = prevOrdered
      return items.join('\n')
    }
    case 'list_item': {
      const parts = (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean)
      return parts.join('\n')
    }
    case 'table': {
      const rows = node.content ?? []
      if (!rows.length) return ''
      const values = computeBlockTableValues(node)
      const lines: string[] = []
      const head = rows[0]
      lines.push(tableRowToMd(head, ctx, 0, values))
      const colCount = (head.content ?? []).length
      lines.push(`| ${Array(colCount).fill('---').join(' | ')} |`)
      for (let i = 1; i < rows.length; i++) {
        lines.push(tableRowToMd(rows[i], ctx, i, values))
      }
      return lines.join('\n')
    }
    case 'callout': {
      const icon = String(node.attrs?.icon ?? '')
      const variant = String(node.attrs?.variant ?? '')
      const inner = (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
      const prefix = [icon, variant ? `**${variant}**` : ''].filter(Boolean).join(' ')
      const body = prefix ? `${prefix}: ${inner}` : inner
      return prefixLines(body, '> ')
    }
    case 'checklist_item': {
      const checked = node.attrs?.checked ? 'x' : ' '
      const inner = inlineContent(node, ctx)
      return `- [${checked}] ${inner}`
    }
    case 'divider':
      return '---'
    case 'file_block': {
      const src = String(node.attrs?.src ?? '')
      const filename = String(node.attrs?.filename ?? 'file')
      if (!src) return ''
      if (!ctx.assetSrcs.includes(src)) ctx.assetSrcs.push(src)
      const basename = src.split('/').pop() ?? src
      return `[${filename}](${ctx.assetsSubfolderName}/${basename})`
    }
    case 'image_block': {
      const src = String(node.attrs?.src ?? '')
      const alt = String(node.attrs?.alt ?? '')
      if (!src) return ''
      if (!ctx.assetSrcs.includes(src)) ctx.assetSrcs.push(src)
      const filename = src.split('/').pop() ?? src
      return `![${alt}](${ctx.assetsSubfolderName}/${filename})`
    }
    case 'math_block': {
      const latex = String(node.attrs?.latex ?? (node.content ?? []).map(c => c.text ?? '').join(''))
      return `$$\n${latex}\n$$`
    }
    case 'mermaid_block': {
      const code = String(node.attrs?.code ?? '')
      return `\`\`\`mermaid\n${code}\n\`\`\``
    }
    case 'markmap_block': {
      const markdown = String(node.attrs?.markdown ?? '')
      return `\`\`\`markmap\n${markdown}\n\`\`\``
    }
    case 'vega_block': {
      const spec = String(node.attrs?.spec ?? '')
      return `\`\`\`vega-lite\n${spec}\n\`\`\``
    }
    case 'draw_block': {
      const svg = String(node.attrs?.svgPreview ?? '')
      const title = String(node.attrs?.title ?? '')
      if (!svg.trim()) return title.trim() ? `_${title}_` : ''
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      return `![${title.trim() || 'Drawing'}](${dataUri})`
    }
    case 'media_block': {
      const src = String(node.attrs?.src ?? '')
      const name = String(node.attrs?.name ?? (node.attrs?.kind === 'video' ? 'Video' : 'Audio'))
      if (!src) return ''
      if (!ctx.assetSrcs.includes(src)) ctx.assetSrcs.push(src)
      const basename = src.split('/').pop() ?? src
      return `[${name}](${ctx.assetsSubfolderName}/${basename})`
    }
    case 'note_embed': {
      const title = String(node.attrs?.title ?? 'Note')
      const previewText = String(node.attrs?.previewText ?? '')
      const head = `> **${title}**`
      return previewText.trim() ? `${head}\n>\n> ${previewText}` : head
    }
    case 'embed_block': {
      const url = String(node.attrs?.url ?? '')
      const title = String(node.attrs?.title ?? '')
      if (!url) return ''
      return `[${title.trim() || url}](${url})`
    }
    case 'toggle': {
      const children = node.content ?? []
      const titleNode = children.find(child => child.type === 'toggle_title')
      const bodyNodes = children.filter(child => child.type !== 'toggle_title')
      const summary = titleNode ? inlineContent(titleNode, ctx) : 'Toggle'
      const body = bodyNodes.map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
      return `<details>\n<summary>${summary}</summary>\n\n${body}\n</details>`
    }
    case 'toggle_title':
      return inlineContent(node, ctx)
    case 'column_list':
    case 'column': {
      // Markdown has no columns — flatten to sequential blocks.
      return (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
    }
    case 'hard_break':
      return '\n'
    case 'database_block':
      return databaseBlockToMd(node)
    default: {
      const pluginSerializer = getPluginNodeSerializer(node.type)?.markdown
      if (pluginSerializer) {
        const children = (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
        const result = pluginSerializer(node as NevoSerializableNode, {
          serializeChildren: () => children,
        })
        if (typeof result === 'string') return result
        void result.catch(() => {})
        const marker = encodeURIComponent(JSON.stringify({ type: node.type, attrs: node.attrs ?? {} }))
        return [`<!-- nevo-plugin-node:${marker} -->`, children].filter(Boolean).join('\n')
      }
      const children = (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
      const text = inlineContent(node, ctx)
      const marker = encodeURIComponent(JSON.stringify({ type: node.type, attrs: node.attrs ?? {} }))
      return [`<!-- nevo-plugin-node:${marker} -->`, children || text].filter(Boolean).join('\n')
    }
  }
}

export function serializeNoteToMarkdown(
  note: NoteDocument,
  assetsSubfolderName: string,
): MarkdownSerializeResult {
  const ctx: SerializeCtx = {
    assetSrcs: [],
    assetsSubfolderName,
    listDepth: 0,
    ordered: false,
    orderedIndex: 1,
  }
  const body = nodeToMd(note.content, ctx)
  const markdown = `# ${note.title}\n\n${body}`
  return { markdown, assetSrcs: ctx.assetSrcs }
}

async function resolveAsyncMarkdownPlugins(
  node: BlockNode,
  ctx: SerializeCtx,
  replacements: Map<string, string>,
  sequence: { value: number },
): Promise<BlockNode> {
  const pluginSerializer = getPluginNodeSerializer(node.type)?.markdown
  if (pluginSerializer) {
    const resolvedChildren = await Promise.all((node.content ?? []).map(child =>
      resolveAsyncMarkdownPlugins(child, ctx, replacements, sequence)))
    const children = nodeToMd({ type: 'doc', content: resolvedChildren }, ctx)
    const marker = `NEVO_PLUGIN_MARKDOWN_${++sequence.value}_END`
    try {
      replacements.set(marker, await pluginSerializer(node as NevoSerializableNode, {
        serializeChildren: () => children,
      }))
    } catch {
      const json = encodeURIComponent(JSON.stringify({ type: node.type, attrs: node.attrs ?? {} }))
      replacements.set(
        marker,
        [`<!-- nevo-plugin-node:${json} -->`, children].filter(Boolean).join('\n'),
      )
    }
    return { type: 'paragraph', content: [{ type: 'text', text: marker }] }
  }
  if (!node.content?.length) return node
  return {
    ...node,
    content: await Promise.all(node.content.map(child =>
      resolveAsyncMarkdownPlugins(child, ctx, replacements, sequence))),
  }
}

/** Worker-aware export pipeline used by product export flows. */
export async function serializeNoteToMarkdownAsync(
  note: NoteDocument,
  assetsSubfolderName: string,
): Promise<MarkdownSerializeResult> {
  const ctx: SerializeCtx = {
    assetSrcs: [],
    assetsSubfolderName,
    listDepth: 0,
    ordered: false,
    orderedIndex: 1,
  }
  const replacements = new Map<string, string>()
  const resolved = await resolveAsyncMarkdownPlugins(note.content, ctx, replacements, { value: 0 })
  let body = nodeToMd(resolved, ctx)
  for (const [marker, value] of replacements) body = body.split(marker).join(value)
  return {
    markdown: `# ${note.title}\n\n${body}`,
    assetSrcs: ctx.assetSrcs,
  }
}
