import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { Root, Content, PhrasingContent, ListItem } from 'mdast'
import type { BlockNode } from '../../types/note'
import { getPluginNodeImporter } from '../../editor-core/plugin-host/active-serialization'
import { normalizeDisplayMath } from './markdownMath'
import { clampHtmlBlockHeight, HTML_BLOCK_MD_META } from '../../editor-core/schema/htmlBlock'

export interface ParsedMarkdown {
  title: string
  content: BlockNode
}

// Single shared processor instance
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

// Mark descriptor
type Mark = { type: string; attrs?: Record<string, unknown> }

// Resolver for wiki-style links: given a target note title, returns its id
// (or null when no matching note exists). Used by parseMarkdownToBlockNode.
export type WikiLinkResolver = (title: string) => string | null

export interface MarkdownLinkTarget {
  noteId: string
  title: string
  anchor?: string | null
}

export type MarkdownLinkResolver = (href: string) => MarkdownLinkTarget | null

// Matches Obsidian-style wiki links: [[Note]], [[Note#Anchor]], [[Note|Alias]],
// [[Note#Anchor|Alias]]. Group 1 = note title, 2 = optional anchor, 3 = alias.
const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

/** Split a raw text value into BlockNodes, expanding any `[[wiki links]]`
 *  into internal_link-marked text nodes. Plain segments keep their marks. */
function textWithWikiLinks(value: string, marks: Mark[], resolver?: WikiLinkResolver): BlockNode[] {
  if (!resolver || !value.includes('[[')) {
    const node: BlockNode = { type: 'text', text: value }
    if (marks.length) node.marks = marks
    return [node]
  }

  const result: BlockNode[] = []
  let lastIndex = 0
  WIKI_LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WIKI_LINK_RE.exec(value)) !== null) {
    const noteTitle = (match[1] ?? '').trim()
    if (!noteTitle) continue
    const anchor = (match[2] ?? '').trim() || null
    const alias = (match[3] ?? '').trim() || null

    // Leading plain text
    if (match.index > lastIndex) {
      const before = value.slice(lastIndex, match.index)
      const node: BlockNode = { type: 'text', text: before }
      if (marks.length) node.marks = marks
      result.push(node)
    }

    const noteId = resolver(noteTitle) ?? ''
    const displayText = alias || noteTitle
    result.push({
      type: 'text',
      text: displayText,
      marks: [
        ...marks,
        { type: 'internal_link', attrs: { noteId, title: noteTitle, anchor, alias } },
      ],
    })

    lastIndex = match.index + match[0].length
  }

  // Trailing plain text
  if (lastIndex < value.length) {
    const after = value.slice(lastIndex)
    const node: BlockNode = { type: 'text', text: after }
    if (marks.length) node.marks = marks
    result.push(node)
  }

  return result.length ? result : [{ type: 'text', text: value, ...(marks.length ? { marks } : {}) }]
}

function inlineToContent(
  nodes: PhrasingContent[],
  marks: Mark[] = [],
  resolver?: WikiLinkResolver,
  markdownLinkResolver?: MarkdownLinkResolver,
): BlockNode[] {
  const result: BlockNode[] = []
  // remark emits `<u>` and `</u>` as separate inline html siblings; toggle the
  // underline mark between them (the Markdown exporter writes underline this way).
  let current = marks
  for (const node of nodes) {
    switch (node.type) {
      case 'html': {
        const tag = node.value.trim().toLowerCase()
        if (tag === '<u>') current = [...marks, { type: 'underline' }]
        else if (tag === '</u>') current = marks
        break
      }
      case 'text': {
        if (node.value) {
          result.push(...textWithWikiLinks(node.value, current, resolver))
        }
        break
      }
      case 'strong':
        result.push(...inlineToContent(node.children as PhrasingContent[], [...current, { type: 'strong' }], resolver, markdownLinkResolver))
        break
      case 'emphasis':
        result.push(...inlineToContent(node.children as PhrasingContent[], [...current, { type: 'em' }], resolver, markdownLinkResolver))
        break
      case 'delete':
        result.push(...inlineToContent((node as { children: PhrasingContent[] }).children, [...current, { type: 'strike' }], resolver, markdownLinkResolver))
        break
      case 'inlineCode':
        if (node.value) {
          result.push({ type: 'text', text: node.value, marks: [...current, { type: 'code' }] })
        }
        break
      case 'link': {
        const internal = markdownLinkResolver?.(node.url) ?? null
        result.push(...inlineToContent(
          node.children as PhrasingContent[],
          [...current, internal
            ? { type: 'internal_link', attrs: { noteId: internal.noteId, title: internal.title, anchor: internal.anchor ?? null, alias: null } }
            : { type: 'link', attrs: { href: node.url } }],
          resolver,
          markdownLinkResolver,
        ))
        break
      }
      case 'image':
        result.push({
          type: 'image_block',
          attrs: { src: node.url, alt: node.alt || null, caption: null, sizePreset: 'full', width: null },
        })
        break
      default:
        // inlineMath — remark-math augments the type system at runtime
        if ((node as { type?: string; value?: string }).type === 'inlineMath') {
          result.push({ type: 'math_inline', attrs: { latex: (node as { type?: string; value?: string }).value ?? '', displayMode: false } })
        }
    }
  }
  return result
}

// `inlineToContent` emits `image_block` for images, but image_block is a block
// node. Where only inline content is allowed, fall back to the alt text.
function inlineOnly(content: BlockNode[]): BlockNode[] {
  return content.flatMap((node) => {
    if (node.type !== 'image_block') return [node]
    const alt = (node.attrs as { alt?: string | null } | undefined)?.alt
    return alt ? [{ type: 'text', text: alt }] : []
  })
}

// Lift images out of a paragraph: the inline runs around them stay paragraphs
// and each image becomes its own image_block between them.
function paragraphsWithImages(content: BlockNode[]): BlockNode[] {
  const blocks: BlockNode[] = []
  let run: BlockNode[] = []
  const flush = () => {
    if (run.some((node) => node.type !== 'text' || node.text?.trim())) blocks.push({ type: 'paragraph', content: run })
    run = []
  }
  for (const node of content) {
    if (node.type === 'image_block') {
      flush()
      blocks.push(node)
    } else {
      run.push(node)
    }
  }
  flush()
  return blocks.length ? blocks : [{ type: 'paragraph', content: [] }]
}

function cellParagraph(cells: PhrasingContent[], resolver?: WikiLinkResolver, markdownLinkResolver?: MarkdownLinkResolver): BlockNode {
  const content = inlineOnly(inlineToContent(cells, [], resolver, markdownLinkResolver))
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function listItemToNode(
  item: ListItem,
  resolver?: WikiLinkResolver,
  asyncImports?: WeakMap<object, BlockNode | null>,
  markdownLinkResolver?: MarkdownLinkResolver,
): BlockNode {
  // Checklist item: content is inline*
  if (typeof item.checked === 'boolean') {
    const content: BlockNode[] = []
    for (const child of item.children) {
      if (child.type === 'paragraph') content.push(...inlineOnly(inlineToContent(child.children as PhrasingContent[], [], resolver, markdownLinkResolver)))
    }
    return { type: 'checklist_item', attrs: { checked: item.checked }, content }
  }
  // Regular list item: content is paragraph block*
  const content = item.children.flatMap((child) => blockToNodes(child, resolver, asyncImports, markdownLinkResolver))
  return { type: 'list_item', content: content.length ? content : [{ type: 'paragraph' }] }
}

function blockToNodes(
  node: Content,
  resolver?: WikiLinkResolver,
  asyncImports?: WeakMap<object, BlockNode | null>,
  markdownLinkResolver?: MarkdownLinkResolver,
): BlockNode[] {
  switch (node.type) {
    case 'paragraph': {
      return paragraphsWithImages(inlineToContent(node.children as PhrasingContent[], [], resolver, markdownLinkResolver))
    }
    case 'heading': {
      const content = inlineOnly(inlineToContent(node.children as PhrasingContent[], [], resolver, markdownLinkResolver))
      return [{ type: 'heading', attrs: { level: node.depth }, content }]
    }
    case 'code': {
      if (node.lang === 'mermaid') {
        return [{ type: 'mermaid_block', attrs: { code: node.value } }]
      }
      if (node.lang === 'html' && node.meta?.split(/\s+/).includes(HTML_BLOCK_MD_META)) {
        const height = clampHtmlBlockHeight(Number(/(?:^|\s)height=(\d+)/.exec(node.meta)?.[1]))
        return [{ type: 'html_block', attrs: { code: node.value, height } }]
      }
      if (asyncImports?.has(node)) {
        const imported = asyncImports.get(node)
        if (imported) return [imported]
      }
      if (node.lang) {
        const importer = getPluginNodeImporter(node.lang)
        const imported = importer?.fromFenced(node.value)
        if (imported && !(imported instanceof Promise)) return [imported as BlockNode]
      }
      const content = node.value ? [{ type: 'text', text: node.value }] : []
      return [{ type: 'code_block', attrs: { language: node.lang ?? null }, content }]
    }
    case 'blockquote': {
      const content = node.children.flatMap((child) => blockToNodes(child, resolver, asyncImports, markdownLinkResolver))
      return [{ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] }]
    }
    case 'list': {
      const isChecklist = node.children.some(item => typeof item.checked === 'boolean')
      if (isChecklist) {
        return node.children.map((item) => listItemToNode(item, resolver, asyncImports, markdownLinkResolver))
      }
      const listType = node.ordered ? 'ordered_list' : 'bullet_list'
      return [{
        type: listType,
        content: node.children.map((item) => listItemToNode(item, resolver, asyncImports, markdownLinkResolver)),
      }]
    }
    case 'table': {
      const rows = node.children.map((row, rowIndex) => ({
        type: 'table_row',
        content: row.children.map(cell => ({
          type: rowIndex === 0 ? 'table_header' : 'table_cell',
          attrs: { colspan: 1, rowspan: 1, colwidth: null },
          content: [cellParagraph(cell.children as PhrasingContent[], resolver, markdownLinkResolver)],
        })),
      }))
      return [{ type: 'table', content: rows }]
    }
    case 'thematicBreak':
      return [{ type: 'divider' }]
    default: {
      // math block — added by remark-math
      if ((node as { type?: string; value?: string }).type === 'math') {
        return [{ type: 'math_block', attrs: { latex: (node as { type?: string; value?: string }).value ?? '', displayMode: true } }]
      }
      return []
    }
  }
}

export interface ParseMarkdownOptions {
  /** When false, the first H1 is left in `content` as a regular heading node
   *  and `title` is always `fallbackTitle`. Used by importers (e.g. Obsidian)
   *  where the note title comes from the filename and the body H1 must be
   *  preserved verbatim. Defaults to true (existing H1-as-title behavior). */
  extractTitle?: boolean
  /** Resolves regular Markdown links to notes created by an archive importer. */
  markdownLinkResolver?: MarkdownLinkResolver
}

export function parseMarkdownToBlockNode(
  markdown: string,
  fallbackTitle: string,
  resolver?: WikiLinkResolver,
  options?: ParseMarkdownOptions,
): ParsedMarkdown {
  const extractTitle = options?.extractTitle ?? true
  const tree = processor.parse(normalizeDisplayMath(markdown)) as Root
  let title = fallbackTitle
  let titleExtracted = false
  const blocks: BlockNode[] = []

  for (const node of tree.children) {
    // Extract first H1 as note title
    if (extractTitle && !titleExtracted && node.type === 'heading' && node.depth === 1) {
      title = inlineToContent(node.children as PhrasingContent[], [], resolver, options?.markdownLinkResolver)
        .filter(n => n.type === 'text')
        .map(n => n.text ?? '')
        .join('')
      titleExtracted = true
      continue
    }
    blocks.push(...blockToNodes(node, resolver, undefined, options?.markdownLinkResolver))
  }

  return {
    title,
    content: { type: 'doc', content: blocks },
  }
}

async function collectAsyncImports(
  node: unknown,
  imports: WeakMap<object, BlockNode | null>,
): Promise<void> {
  if (!node || typeof node !== 'object') return
  const record = node as { type?: string; lang?: string | null; value?: string; children?: unknown[] }
  if (record.type === 'code' && record.lang) {
    const importer = getPluginNodeImporter(record.lang)
    if (importer) {
      const imported = await importer.fromFenced(record.value ?? '')
      imports.set(node, imported as BlockNode | null)
    }
  }
  await Promise.all((record.children ?? []).map(child => collectAsyncImports(child, imports)))
}

/** Worker-aware Markdown import used by file import flows. */
export async function parseMarkdownToBlockNodeAsync(
  markdown: string,
  fallbackTitle: string,
  resolver?: WikiLinkResolver,
  options?: ParseMarkdownOptions,
): Promise<ParsedMarkdown> {
  const extractTitle = options?.extractTitle ?? true
  const tree = processor.parse(normalizeDisplayMath(markdown)) as Root
  const imports = new WeakMap<object, BlockNode | null>()
  await collectAsyncImports(tree, imports)
  let title = fallbackTitle
  let titleExtracted = false
  const blocks: BlockNode[] = []
  for (const node of tree.children) {
    if (extractTitle && !titleExtracted && node.type === 'heading' && node.depth === 1) {
      title = inlineToContent(node.children as PhrasingContent[], [], resolver, options?.markdownLinkResolver)
        .filter(value => value.type === 'text')
        .map(value => value.text ?? '')
        .join('')
      titleExtracted = true
      continue
    }
    blocks.push(...blockToNodes(node, resolver, imports, options?.markdownLinkResolver))
  }
  return { title, content: { type: 'doc', content: blocks } }
}
