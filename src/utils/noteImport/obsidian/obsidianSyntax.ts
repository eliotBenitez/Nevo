// Obsidian-flavored inline/block markdown syntax that the shared markdown
// parser (`markdownParser.ts`) doesn't know about: `%%comments%%`, callouts
// (`> [!type] Title`), `==highlights==`, and inline `#tags`. These operate as
// a pre-processing pass (comments, on raw markdown text) and post-parse tree
// transforms (callouts, highlights, tag extraction), mirroring the approach
// `obsidianEmbeds.ts` uses for embeds. Framework-agnostic and Tauri-free.
import type { BlockNode } from '../../../types/note'

// ---------------------------------------------------------------------------
// %%comments%%
// ---------------------------------------------------------------------------

// Matches an inline code span (kept verbatim) or a `%%...%%` comment (removed).
// The alternation lets a single scan skip code spans without a separate
// pre-pass, mirroring `EMBED_OR_CODE_SPAN_RE` in `obsidianEmbeds.ts`: when the
// regex engine lands on a backtick it prefers the code-span branch, consuming
// the whole span unchanged. `[\s\S]*?` lets a comment span multiple lines.
const CODE_SPAN_OR_COMMENT_RE = /`[^`]*`|%%[\s\S]*?%%/g

function stripCommentsFromChunk(text: string): string {
  let removed = false
  const stripped = text.replace(CODE_SPAN_OR_COMMENT_RE, (match) => {
    if (!match.startsWith('%%')) return match
    removed = true
    return ''
  })
  // The whitespace cleanups below only ever make sense as repair for a gap a
  // removed comment left behind. Running them unconditionally would rewrite
  // untouched markdown — notably collapsing the two trailing spaces that
  // encode a hard line break.
  if (!removed) return stripped
  return stripped
    // A removed inline comment can leave a double space *between* words;
    // collapse those runs only. The `\S` lookahead keeps end-of-line spaces
    // (a markdown hard break) intact, and the lookbehind keeps leading
    // indentation intact.
    .replace(/(?<=\S)[ \t]{2,}(?=\S)/g, ' ')
    // A removed block comment that occupied whole lines can leave several
    // consecutive blank lines; collapse down to a single blank line.
    .replace(/\n{3,}/g, '\n\n')
}

/** Removes `%%comment%%` regions (inline and multi-line block comments) from
 *  Obsidian markdown. Fence-aware: never touches content inside ```/~~~
 *  fenced code blocks. Also leaves inline code spans untouched. */
export function stripObsidianComments(markdown: string): string {
  const lines = markdown.split('\n')
  const outputParts: string[] = []
  let buffer: string[] = []
  let inFence = false

  const flushBuffer = () => {
    if (buffer.length === 0) return
    outputParts.push(stripCommentsFromChunk(buffer.join('\n')))
    buffer = []
  }

  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      flushBuffer()
      outputParts.push(line)
      inFence = !inFence
      continue
    }
    if (inFence) {
      outputParts.push(line)
      continue
    }
    buffer.push(line)
  }
  flushBuffer()

  return outputParts.join('\n')
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function hasCodeMark(node: BlockNode): boolean {
  return node.marks?.some(mark => mark.type === 'code') ?? false
}

// A fenced code block carries its source as an unmarked plain text child — the
// "this is code" signal lives on the parent's type, not on a mark — so the
// text-level `hasCodeMark` guard cannot see it. Both transforms below must skip
// the node itself. (`mermaid_block` and `math_*` keep their source in attrs and
// have no text children, so they are unreachable by these walks.)
function isVerbatimBlock(node: BlockNode): boolean {
  return node.type === 'code_block'
}

// ---------------------------------------------------------------------------
// Callouts (`> [!type] Title`)
// ---------------------------------------------------------------------------

export interface CalloutStyle {
  variant: string
  icon: string
}

const CALLOUT_STYLES: Record<string, CalloutStyle> = {
  note: { variant: 'info', icon: '📝' },
  info: { variant: 'info', icon: 'ℹ️' },
  todo: { variant: 'info', icon: 'ℹ️' },
  tip: { variant: 'info', icon: '💡' },
  hint: { variant: 'info', icon: '💡' },
  important: { variant: 'info', icon: '💡' },
  success: { variant: 'success', icon: '✅' },
  check: { variant: 'success', icon: '✅' },
  done: { variant: 'success', icon: '✅' },
  question: { variant: 'info', icon: '❓' },
  help: { variant: 'info', icon: '❓' },
  faq: { variant: 'info', icon: '❓' },
  warning: { variant: 'warning', icon: '⚠️' },
  caution: { variant: 'warning', icon: '⚠️' },
  attention: { variant: 'warning', icon: '⚠️' },
  failure: { variant: 'danger', icon: '❌' },
  fail: { variant: 'danger', icon: '❌' },
  missing: { variant: 'danger', icon: '❌' },
  danger: { variant: 'danger', icon: '⛔' },
  error: { variant: 'danger', icon: '⛔' },
  bug: { variant: 'danger', icon: '🐛' },
  example: { variant: 'info', icon: '📋' },
  quote: { variant: 'info', icon: '💬' },
  cite: { variant: 'info', icon: '💬' },
  abstract: { variant: 'info', icon: '📄' },
  summary: { variant: 'info', icon: '📄' },
  tldr: { variant: 'info', icon: '📄' },
}

const DEFAULT_CALLOUT_STYLE: CalloutStyle = { variant: 'info', icon: '💡' }

/** Maps an Obsidian callout TYPE (case-insensitive) to a `callout` node's
 *  `{ variant, icon }` attrs, falling back to the generic info style. */
export function calloutVariantForType(type: string): CalloutStyle {
  return CALLOUT_STYLES[type.toLowerCase()] ?? DEFAULT_CALLOUT_STYLE
}

// `m` (multiline) makes `$` match at the end of the *first* line rather than
// requiring the whole text node to end there, so `(.*)$` captures only the
// Title even when the text node's value continues (via an embedded `\n`)
// into the callout body.
// `[ \t]*` (never `\s*`) keeps the separator from crossing a newline: in
// Obsidian the title is only what follows the marker on the *same* line, so a
// greedy `\s*` would wrongly promote the body's first line to the title.
const CALLOUT_MARKER_RE = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/m

function recurseIntoChildren(node: BlockNode): BlockNode {
  if (!node.content) return node
  return { ...node, content: node.content.map(transformCalloutNode) }
}

function transformBlockquote(blockquote: BlockNode): BlockNode {
  const children = blockquote.content ?? []
  const firstParagraph = children[0]
  const paragraphContent = firstParagraph?.type === 'paragraph' ? (firstParagraph.content ?? []) : null
  const firstText = paragraphContent?.[0]

  if (!paragraphContent || !firstText || firstText.type !== 'text' || typeof firstText.text !== 'string') {
    return recurseIntoChildren(blockquote)
  }

  const match = CALLOUT_MARKER_RE.exec(firstText.text)
  if (!match) return recurseIntoChildren(blockquote)

  const { variant, icon } = calloutVariantForType(match[1])
  const title = (match[3] ?? '').trim()

  const newlineIndex = firstText.text.indexOf('\n')
  const remainder = newlineIndex === -1 ? '' : firstText.text.slice(newlineIndex + 1)

  const rebuiltFirstParaContent: BlockNode[] = []
  if (remainder) {
    rebuiltFirstParaContent.push({ type: 'text', text: remainder, ...(firstText.marks ? { marks: firstText.marks } : {}) })
  }
  rebuiltFirstParaContent.push(...paragraphContent.slice(1))

  const body: BlockNode[] = []
  if (rebuiltFirstParaContent.length > 0) {
    body.push({ ...firstParagraph, content: rebuiltFirstParaContent })
  }
  body.push(...children.slice(1))

  if (title) {
    body.unshift({ type: 'paragraph', content: [{ type: 'text', text: title, marks: [{ type: 'strong' }] }] })
  }

  const content = body.length > 0 ? body.map(transformCalloutNode) : [{ type: 'paragraph' }]
  return { type: 'callout', attrs: { variant, icon }, content }
}

function transformCalloutNode(node: BlockNode): BlockNode {
  if (node.type === 'blockquote') return transformBlockquote(node)
  return recurseIntoChildren(node)
}

/** Converts every `blockquote` whose body opens with a `[!type] Title`
 *  marker into a `callout` node (recursively, including callouts nested
 *  inside lists or other blockquotes). Returns a new tree; the input is not
 *  mutated. Blockquotes without the marker are left unchanged. */
export function transformCallouts(doc: BlockNode): BlockNode {
  return transformCalloutNode(doc)
}

// ---------------------------------------------------------------------------
// ==highlights==
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLOR = '#fef08a'

function splitHighlightsInText(node: BlockNode): BlockNode[] {
  const text = node.text
  if (typeof text !== 'string' || hasCodeMark(node)) return [node]

  const result: BlockNode[] = []
  let lastIndex = 0
  let found = false
  const re = /==([^=]+)==/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    found = true
    if (match.index > lastIndex) {
      result.push({ ...node, text: text.slice(lastIndex, match.index) })
    }
    result.push({
      ...node,
      text: match[1],
      marks: [...(node.marks ?? []), { type: 'highlight', attrs: { color: HIGHLIGHT_COLOR } }],
    })
    lastIndex = match.index + match[0].length
  }
  if (!found) return [node]
  if (lastIndex < text.length) {
    result.push({ ...node, text: text.slice(lastIndex) })
  }
  return result
}

function applyHighlightsToNode(node: BlockNode): BlockNode {
  if (!node.content || isVerbatimBlock(node)) return node
  return { ...node, content: node.content.flatMap(child => (
    typeof child.text === 'string' ? splitHighlightsInText(child) : [applyHighlightsToNode(child)]
  )) }
}

/** Splits `==highlight==` runs out of every plain text node (skipping ones
 *  already carrying a `code` mark) into a separate text node with a
 *  `highlight` mark added, preserving any pre-existing marks. Returns a new
 *  tree; the input is not mutated. */
export function applyHighlights(doc: BlockNode): BlockNode {
  return applyHighlightsToNode(doc)
}

// ---------------------------------------------------------------------------
// Inline #tags
// ---------------------------------------------------------------------------

// Requires a letter right after `#` (so `#1`/`#123` never match) and requires
// the `#` to be preceded by whitespace or the start of the text (so `C#`
// never matches, since there's no whitespace before its `#`).
const INLINE_TAG_RE = /(?:^|\s)#([A-Za-z][\w/-]*)/g

function collectInlineTags(node: BlockNode, seen: Set<string>, order: string[]): void {
  if (isVerbatimBlock(node)) return
  if (typeof node.text === 'string') {
    if (hasCodeMark(node)) return
    const re = new RegExp(INLINE_TAG_RE)
    let match: RegExpExecArray | null
    while ((match = re.exec(node.text)) !== null) {
      const tag = match[1]
      if (!seen.has(tag)) {
        seen.add(tag)
        order.push(tag)
      }
    }
    return
  }
  if (node.content) {
    for (const child of node.content) collectInlineTags(child, seen, order)
  }
}

/** Read-only scan for conservative inline `#tag` references across the whole
 *  tree (skipping text nodes carrying a `code` mark). Returns de-duplicated
 *  tag names (without the leading `#`), preserving first-seen order. Does
 *  not mutate the input. */
export function extractInlineTags(doc: BlockNode): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  collectInlineTags(doc, seen, order)
  return order
}
