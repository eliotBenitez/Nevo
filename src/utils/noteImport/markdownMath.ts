// Display-math normalization for the shared markdown parser.
//
// `remark-math` only produces a block-level `math` node when the `$$` fences
// sit on their own lines. A whole-line `$$x^2$$` — the form Obsidian, KaTeX and
// Pandoc all render as display math — parses as `inlineMath`, so importing an
// Obsidian vault turned block formulas into inline ones. mdast keeps no record
// of which delimiter was used (`$x$` and `$$x$$` yield identical nodes, both
// tagged `math-inline`), so the distinction has to be restored on the raw
// markdown before parsing.
//
// Only a line that consists *entirely* of a `$$…$$` span is rewritten. Display
// math embedded in a sentence stays inline, which matches how the surrounding
// paragraph reads.

// Whole line is one `$$…$$` span. Up to 3 leading spaces keeps indented code
// blocks (4+ spaces) out of scope. The lazy body plus the `$$`-free assertion
// stops `$$a$$ and $$b$$` — two spans, not one — from being folded together.
const WHOLE_LINE_DISPLAY_MATH_RE = /^([ \t]{0,3})\$\$(?!\$)([^\n]*?)\$\$[ \t]*$/

/** Rewrites whole-line `$$…$$` display math into the fenced form
 *  (`$$` / body / `$$`) that `remark-math` reports as a block-level `math`
 *  node. Fence-aware: content inside ```/~~~ code blocks is left verbatim.
 *  Lines carrying a blockquote or list marker are skipped, since splitting
 *  them across three lines would change the surrounding block structure. */
export function normalizeDisplayMath(markdown: string): string {
  if (!markdown.includes('$$')) return markdown

  const lines = markdown.split('\n')
  const result: string[] = []
  let inFence = false

  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      result.push(line)
      continue
    }
    if (inFence) {
      result.push(line)
      continue
    }

    const match = WHOLE_LINE_DISPLAY_MATH_RE.exec(line)
    const body = match?.[2]?.trim()
    if (!match || !body || body.includes('$$')) {
      result.push(line)
      continue
    }

    const indent = match[1] ?? ''
    result.push(`${indent}$$`, body, `${indent}$$`)
  }

  return result.join('\n')
}
