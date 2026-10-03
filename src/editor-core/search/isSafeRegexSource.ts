/** Conservative, framework-agnostic detector for regex sources shaped like
 *  known catastrophic-backtracking patterns (`(a+)+`, `(a|aa)+`, a quantified
 *  backreference, ...). It parses the source into a tree of atoms/groups
 *  rather than pattern-matching a couple of literal strings, so it also
 *  catches nested and bracket-quantified variants (`([a-z]+)+`, `(a{2,})+`).
 *
 *  False positives are acceptable — the caller shows an "unsupported
 *  pattern" message and the user can rewrite it. False negatives on the
 *  well-known shapes are not: this exists specifically to reject patterns
 *  like `(a+)+$` before a single `RegExp.exec` call, which is where the
 *  actual hang happens (the existing match-count `limit` never runs).
 *
 *  This function only judges backtracking risk. It assumes the source is
 *  syntactically well-formed; if parsing fails (unbalanced brackets,
 *  trailing backslash, ...) it returns `true` and leaves rejection of the
 *  malformed source itself to `new RegExp()`. */
export function isSafeRegexSource(source: string): boolean {
  try {
    return !sequenceIsUnsafe(parseSequence(source, 0, NO_STOP).atoms)
  } catch {
    return true
  }
}

interface Atom {
  /** This atom (char, class, group, or backreference) is directly followed
   *  by a quantifier (`+`, `*`, `?`, `{n,}`, `{n,m}`), possibly lazy (`+?`). */
  quantified: boolean
  /** The atom-with-its-own-quantifier can match zero characters: a bare `*`,
   *  `?`, or `{0,m}` quantifier, or an unquantified group whose body can. */
  canBeEmpty: boolean
  isBackreference: boolean
  isGroup: boolean
  /** Raw source text this atom spans, used only for the alternation-overlap
   *  heuristic (comparing branch text, not full regex semantics). */
  text: string
  /** True when this atom's own subtree already contains a catastrophic
   *  shape, so the flag propagates up through enclosing groups. */
  unsafe: boolean
}

const NO_STOP: ReadonlySet<string> = new Set()
const ALTERNATION_STOP: ReadonlySet<string> = new Set(['|', ')'])

function sequenceIsUnsafe(atoms: Atom[]): boolean {
  return atoms.some((atom) => atom.unsafe || (atom.isBackreference && atom.quantified))
}

function sequenceCanBeEmpty(atoms: Atom[]): boolean {
  return atoms.every((atom) => atom.canBeEmpty)
}

/** Two branches of an alternation are treated as ambiguous (and therefore
 *  risky once the whole group is quantified) when one branch's text is a
 *  prefix of another's (`a` vs `aa`) or when any branch can match the empty
 *  string (`a` vs `a?`) — the classic shapes behind `(a|aa)+`/`(a|a?)*`. */
function alternationIsAmbiguous(branches: Atom[][]): boolean {
  if (branches.length < 2) return false
  if (branches.some((branch) => sequenceCanBeEmpty(branch))) return true
  const texts = branches.map((branch) => branch.map((atom) => atom.text).join(''))
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = 0; j < texts.length; j += 1) {
      if (i === j) continue
      if (texts[i] !== '' && texts[j].startsWith(texts[i])) return true
    }
  }
  return false
}

function parseAlternation(source: string, start: number): { branches: Atom[][]; end: number } {
  const branches: Atom[][] = []
  let pos = start
  for (;;) {
    const { atoms, end } = parseSequence(source, pos, ALTERNATION_STOP)
    branches.push(atoms)
    pos = end
    if (source[pos] === '|') {
      pos += 1
      continue
    }
    return { branches, end: pos }
  }
}

/** Consumes a quantifier at `pos` if present, returning whether one was
 *  found, whether it allows zero repetitions, and the index after it. */
function consumeQuantifier(source: string, pos: number): { quantified: boolean; canBeEmpty: boolean; end: number } {
  const ch = source[pos]
  if (ch === '*' || ch === '?') {
    const end = source[pos + 1] === '?' ? pos + 2 : pos + 1
    return { quantified: true, canBeEmpty: true, end }
  }
  if (ch === '+') {
    const end = source[pos + 1] === '?' ? pos + 2 : pos + 1
    return { quantified: true, canBeEmpty: false, end }
  }
  if (ch === '{') {
    const close = source.indexOf('}', pos)
    if (close !== -1) {
      const body = source.slice(pos + 1, close)
      const match = /^(\d+)(,(\d*))?$/.exec(body)
      if (match) {
        const min = Number(match[1])
        const end = source[close + 1] === '?' ? close + 2 : close + 1
        return { quantified: true, canBeEmpty: min === 0, end }
      }
    }
  }
  return { quantified: false, canBeEmpty: false, end: pos }
}

/** Finds the end of a `[...]` character class starting at `pos` (which must
 *  point at `[`), treating an escaped or leading `]` as literal content. */
function findClassEnd(source: string, pos: number): number {
  let i = pos + 1
  if (source[i] === '^') i += 1
  if (source[i] === ']') i += 1
  while (i < source.length && source[i] !== ']') {
    i += source[i] === '\\' ? 2 : 1
  }
  if (source[i] !== ']') throw new Error('Unterminated character class')
  return i + 1
}

/** Skips a `(?...)` group-opening prefix (non-capturing, named, lookaround)
 *  and returns the index where the group's body starts. Plain `(` capturing
 *  groups have no prefix to skip. */
function skipGroupPrefix(source: string, openParenIndex: number): number {
  let i = openParenIndex + 1
  if (source[i] !== '?') return i
  i += 1
  if (source[i] === ':' || source[i] === '=' || source[i] === '!') return i + 1
  if (source[i] === '<') {
    if (source[i + 1] === '=' || source[i + 1] === '!') return i + 2
    const close = source.indexOf('>', i)
    if (close === -1) throw new Error('Unterminated named group')
    return close + 1
  }
  throw new Error('Unsupported group syntax')
}

function parseSequence(source: string, start: number, stop: ReadonlySet<string>): { atoms: Atom[]; end: number } {
  const atoms: Atom[] = []
  let i = start

  while (i < source.length && !stop.has(source[i])) {
    const ch = source[i]

    if (ch === '\\') {
      const next = source[i + 1]
      if (next === undefined) throw new Error('Trailing backslash')
      const isBackreference = /[1-9]/.test(next)
      let atomEnd = i + 2
      if (isBackreference) {
        while (/[0-9]/.test(source[atomEnd] ?? '')) atomEnd += 1
      }
      const { quantified, canBeEmpty, end } = consumeQuantifier(source, atomEnd)
      atoms.push({
        quantified,
        canBeEmpty: quantified && canBeEmpty,
        isBackreference,
        isGroup: false,
        text: source.slice(i, atomEnd),
        unsafe: false,
      })
      i = end
      continue
    }

    if (ch === '[') {
      const classEnd = findClassEnd(source, i)
      const { quantified, canBeEmpty, end } = consumeQuantifier(source, classEnd)
      atoms.push({
        quantified,
        canBeEmpty: quantified && canBeEmpty,
        isBackreference: false,
        isGroup: false,
        text: source.slice(i, classEnd),
        unsafe: false,
      })
      i = end
      continue
    }

    if (ch === '(') {
      const bodyStart = skipGroupPrefix(source, i)
      const { branches, end: bodyEnd } = parseAlternation(source, bodyStart)
      if (source[bodyEnd] !== ')') throw new Error('Unbalanced group')
      const { quantified, canBeEmpty, end } = consumeQuantifier(source, bodyEnd + 1)

      const bodyUnsafe = branches.some((branch) => sequenceIsUnsafe(branch))
      const hasTopLevelQuantifiedAtom = branches.some((branch) => branch.some((atom) => atom.quantified))
      const ambiguous = alternationIsAmbiguous(branches)
      const groupUnsafe = bodyUnsafe || (quantified && (hasTopLevelQuantifiedAtom || ambiguous))
      const bodyCanBeEmpty = branches.some((branch) => sequenceCanBeEmpty(branch))

      atoms.push({
        quantified,
        canBeEmpty: (quantified && canBeEmpty) || (!quantified && bodyCanBeEmpty) || (quantified && !canBeEmpty && bodyCanBeEmpty),
        isBackreference: false,
        isGroup: true,
        text: source.slice(i, end),
        unsafe: groupUnsafe,
      })
      i = end
      continue
    }

    // Plain literal atom: any other character, including regex metacharacters
    // with no special group/class meaning here (`.`, `^`, `$`, ...).
    const atomStart = i
    const { quantified, canBeEmpty, end } = consumeQuantifier(source, i + 1)
    atoms.push({
      quantified,
      canBeEmpty: quantified && canBeEmpty,
      isBackreference: false,
      isGroup: false,
      text: source.slice(atomStart, end),
      unsafe: false,
    })
    i = end
  }

  return { atoms, end: i }
}
