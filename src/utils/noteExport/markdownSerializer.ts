import type { BlockNode, NoteDocument } from '../../types/note'
import { getPluginNodeSerializer } from '../../editor-core/plugin-host/active-serialization'
import { computeBlockTableValues, type FormulaCellResult } from '../../editor-core/tableFormula'
import type { NevoSerializableNode } from '../../types/editor-plugin'

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
    case 'column_list':
    case 'column': {
      // Markdown has no columns — flatten to sequential blocks.
      return (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
    }
    case 'hard_break':
      return '\n'
    default: {
      const pluginSerializer = getPluginNodeSerializer(node.type)?.markdown
      if (pluginSerializer) {
        return pluginSerializer(node as NevoSerializableNode, {
          serializeChildren: () => (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n'),
        })
      }
      const text = inlineContent(node, ctx)
      if (text) return text
      return (node.content ?? []).map(child => nodeToMd(child, ctx)).filter(Boolean).join('\n\n')
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
