export interface TextDiffPart {
  kind: 'same' | 'added' | 'removed'
  text: string
}

/**
 * Token budget per side. The LCS table below is O(n·m); two 1200-token paragraphs
 * already cost ~1.4M cells, which is the most we are willing to spend inside a
 * synchronous render. Past that the pair degrades to a whole-block replacement,
 * which is exactly what callers rendered before this existed.
 */
const MAX_TOKENS = 1200

/**
 * Each token is a word plus the whitespace that follows it, so joining tokens is
 * lossless and a run of changed words stays one highlight instead of being cut apart
 * by the spaces between them (which match on both sides and would otherwise interleave).
 */
function tokenize(value: string): string[] {
  return value.match(/\S+\s*|\s+/g) ?? []
}

function push(parts: TextDiffPart[], kind: TextDiffPart['kind'], text: string): void {
  const last = parts[parts.length - 1]
  if (last && last.kind === kind) last.text += text
  else parts.push({ kind, text })
}

/**
 * Word-level diff of two block texts.
 *
 * A "changed" history row used to render both sides in full, so a paragraph where one
 * word moved produced two walls of near-identical text. This marks only what actually
 * differs.
 */
export function diffWords(before: string, after: string): TextDiffPart[] {
  if (before === after) return before ? [{ kind: 'same', text: before }] : []

  const a = tokenize(before)
  const b = tokenize(after)

  if (!a.length) return b.length ? [{ kind: 'added', text: after }] : []
  if (!b.length) return [{ kind: 'removed', text: before }]
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [{ kind: 'removed', text: before }, { kind: 'added', text: after }]
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: TextDiffPart[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(parts, 'same', a[i])
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push(parts, 'removed', a[i])
      i += 1
    } else {
      push(parts, 'added', b[j])
      j += 1
    }
  }
  while (i < a.length) { push(parts, 'removed', a[i]); i += 1 }
  while (j < b.length) { push(parts, 'added', b[j]); j += 1 }

  return parts
}
