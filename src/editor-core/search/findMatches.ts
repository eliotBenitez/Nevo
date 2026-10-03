import type { Node as PMNode } from 'prosemirror-model'
import { isSafeRegexSource } from './isSafeRegexSource'

/** Find & Replace query, framework-agnostic (no Vue/store dependency). */
export interface FindQuery {
  text: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface FindMatch {
  from: number
  to: number
}

/** Why a query failed to produce a usable regexp. `invalid` is a syntax
 *  error in the user's pattern; `unsafe` is a syntactically valid pattern
 *  rejected by `isSafeRegexSource` because it is shaped like a known
 *  catastrophic-backtracking case. */
export type FindRegExpErrorReason = 'invalid' | 'unsafe'

export type BuildFindRegExpResult =
  | { regexp: RegExp; error: false }
  | { regexp: null; error: false }
  | { regexp: null; error: true; reason: FindRegExpErrorReason }

export interface FindMatchesResult {
  matches: FindMatch[]
  error: boolean
  reason?: FindRegExpErrorReason
  truncated: boolean
}

/** One contiguous run of plain text within a textblock, split at inline
 *  atoms (hard breaks, inline math, mentions, ...) so a match can never
 *  straddle a non-text inline node. `start` is the run's position in the
 *  owning ProseMirror doc. Deliberately plain data (no `PMNode`) so it can
 *  cross a worker boundary via structured clone. */
export interface TextRun {
  text: string
  start: number
}

const WORD_BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])'
const WORD_BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])'

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Builds the RegExp for a find query. Empty text yields a null regexp (no
 *  search active) rather than an error — an empty query is not invalid, it
 *  simply matches nothing. An invalid user-supplied regex source, or one
 *  shaped like a known catastrophic-backtracking pattern, sets `error` (with
 *  a `reason`) so callers can surface a matching state instead of throwing
 *  or hanging. The safety check runs before `new RegExp` is even attempted:
 *  the hang happens inside a single `exec` call, so rejecting after
 *  construction would be too late. */
export function buildFindRegExp(query: FindQuery): BuildFindRegExpResult {
  if (!query.text) return { regexp: null, error: false }

  if (query.regex && !isSafeRegexSource(query.text)) {
    return { regexp: null, error: true, reason: 'unsafe' }
  }

  let source = query.regex ? query.text : escapeLiteral(query.text)
  if (query.wholeWord) {
    source = `${WORD_BOUNDARY_BEFORE}(?:${source})${WORD_BOUNDARY_AFTER}`
  }

  const flags = `g${query.caseSensitive ? '' : 'i'}u`
  try {
    return { regexp: new RegExp(source, flags), error: false }
  } catch {
    return { regexp: null, error: true, reason: 'invalid' }
  }
}

/** Runs `query` over pre-collected text runs (see `collectTextRuns`). Pure
 *  and dependency-free on `prosemirror-model`, so it can run either on the
 *  main thread (literal search, and as the sync fallback when a worker is
 *  unavailable) or inside `findMatchesWorker.ts`. Stops (and reports
 *  `truncated`) once `limit` matches have been collected. */
export function findMatchesInRuns(runs: TextRun[], query: FindQuery, limit = 5000): FindMatchesResult {
  const built = buildFindRegExp(query)
  if (built.error) return { matches: [], error: true, reason: built.reason, truncated: false }
  if (!built.regexp) return { matches: [], error: false, truncated: false }
  const regexp = built.regexp

  const matches: FindMatch[] = []
  let truncated = false

  for (const run of runs) {
    if (truncated) break
    if (!run.text) continue
    regexp.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regexp.exec(run.text))) {
      if (match[0].length === 0) {
        regexp.lastIndex += 1
        if (regexp.lastIndex > run.text.length) break
        continue
      }
      const from = run.start + match.index
      const to = from + match[0].length
      matches.push({ from, to })
      if (matches.length >= limit) {
        truncated = true
        break
      }
    }
  }

  return { matches, error: false, truncated }
}

/** Splits every textblock in `doc` into contiguous text runs, exactly as
 *  `findMatchesInDoc` used to inline this logic — extracted so the same run
 *  list can be handed to `findMatchesInRuns` synchronously or shipped across
 *  a worker boundary. */
export function collectTextRuns(doc: PMNode): TextRun[] {
  const runs: TextRun[] = []

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    let runText = ''
    let runStart = -1

    function flush() {
      if (runText) runs.push({ text: runText, start: runStart })
      runText = ''
      runStart = -1
    }

    node.forEach((child, offset) => {
      if (child.isText) {
        if (runStart === -1) runStart = pos + 1 + offset
        runText += child.text ?? ''
        return
      }
      flush()
    })
    flush()

    return false
  })

  return runs
}

/** Finds every match of `query` in `doc`, never spanning inline atoms (hard
 *  breaks, inline math, mentions, ...). Still used directly by the
 *  synchronous literal-search path and by test/tooling code; regex search
 *  driven from the editor goes through `collectTextRuns` +
 *  `findMatchesInRuns` via the worker client instead (see
 *  `plugins/find-in-note.ts`). */
export function findMatchesInDoc(doc: PMNode, query: FindQuery, limit = 5000): FindMatchesResult {
  return findMatchesInRuns(collectTextRuns(doc), query, limit)
}

/** Computes the replacement text for one matched substring. In literal mode
 *  the replacement is used verbatim; in regex mode it is run back through
 *  the (non-global) query pattern so `$1`-style backreferences resolve
 *  against the captured groups of that specific match. */
export function computeReplacementText(matchedText: string, query: FindQuery, replacement: string): string {
  if (!query.regex) return replacement

  const built = buildFindRegExp(query)
  if (!built.regexp) return replacement

  const singleMatchRegexp = new RegExp(built.regexp.source, built.regexp.flags.replace('g', ''))
  return matchedText.replace(singleMatchRegexp, replacement)
}
