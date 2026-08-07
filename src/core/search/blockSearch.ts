// Block-level note search, ported from the Rust `search_workspace_blocks`
// (src-tauri/src/commands/note/search.rs).
//
// Local workspaces search on disk in Rust. A cloud workspace cannot: note
// bodies are end-to-end encrypted, so the relay has nothing to index and the
// search has to run on the client. Keeping the two implementations behaviourally
// identical matters — the same query should rank the same way in either kind of
// workspace — so the scoring, flattening, and snippet rules below mirror the
// Rust ones deliberately. Change them together.

import type { BlockNode } from '../../types/note'

/** Ranked matches are capped the same way the Rust command caps them. */
export const MAX_BLOCK_SEARCH_RESULTS = 24

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

/** Code points, so scoring indices line up with Rust's `chars()`. */
function chars(value: string): string[] {
  return Array.from(value)
}

/**
 * Scores a subsequence match ("ordered fuzzy"): every query character appears
 * in order, rewarding an early and tightly-packed match.
 */
function orderedFuzzyScore(query: string, text: string): number | null {
  const queryChars = chars(query)
  const textChars = chars(text)
  if (queryChars.length === 0) return null

  let queryIndex = 0
  let firstMatchIndex: number | null = null

  for (let textIndex = 0; textIndex < textChars.length; textIndex++) {
    if (textChars[textIndex] !== queryChars[queryIndex]) continue
    if (firstMatchIndex === null) firstMatchIndex = textIndex
    queryIndex++
    if (queryIndex === queryChars.length) {
      const first = firstMatchIndex ?? textIndex
      const span = textIndex - first + 1
      const densityPenalty = span - queryChars.length
      return 1_000 - first * 6 - densityPenalty * 8
    }
  }
  return null
}

/** Relevance of `text` for `query`, or null when it does not match at all. */
export function textSearchScore(query: string, text: string): number | null {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedText = normalizeSearchText(text)
  if (!normalizedQuery || !normalizedText) return null

  if (normalizedText.startsWith(normalizedQuery)) {
    return 3_000 - normalizedText.length
  }
  const index = normalizedText.indexOf(normalizedQuery)
  if (index !== -1) {
    return 2_000 - index * 8 - normalizedText.length
  }
  return orderedFuzzyScore(normalizedQuery, normalizedText)
}

function attrString(node: BlockNode, key: string): string {
  const value = node.attrs?.[key]
  return typeof value === 'string' ? value : ''
}

function joinPresent(values: string[]): string {
  return values.filter(value => value !== '').join(' ')
}

/** Flattens one node (and its descendants) to searchable plain text. */
export function flattenBlockText(node: BlockNode): string {
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? node.text : ''
    case 'hard_break':
      return '\n'
    case 'bookmark_embed':
      return joinPresent([attrString(node, 'title'), attrString(node, 'description'), attrString(node, 'url')])
    case 'note_embed':
      return joinPresent([attrString(node, 'title'), attrString(node, 'previewText')])
    case 'properties_block':
      return joinPresent([attrString(node, 'status'), attrString(node, 'tags'), attrString(node, 'owner')])
    default:
      return (node.content ?? []).map(flattenBlockText).join('')
  }
}

/** Top-level blocks as trimmed, non-empty text. The array index is the block
 *  index the search results refer to. */
export function flattenNoteBlocks(content: BlockNode | undefined): string[] {
  return (content?.content ?? [])
    .map(flattenBlockText)
    .map(text => text.trim())
    .filter(text => text !== '')
}

/** A window of the block around the match, ellipsised, or a leading excerpt. */
export function buildMatchSnippet(blockText: string, query: string): string {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedText = normalizeSearchText(blockText)
  const textChars = chars(blockText)

  const matchIndex = normalizedQuery ? normalizedText.indexOf(normalizedQuery) : -1
  if (matchIndex !== -1) {
    // indexOf is UTF-16 based; convert to a code-point offset to match Rust.
    const prefixChars = chars(normalizedText.slice(0, matchIndex)).length
    const start = Math.max(0, prefixChars - 28)
    const end = Math.min(prefixChars + chars(normalizedQuery).length + 44, textChars.length)
    const snippet = textChars.slice(start, end).join('')
    return start > 0 || end < textChars.length ? `…${snippet.trim()}…` : snippet
  }

  if (textChars.length <= 96) return blockText
  return `${textChars.slice(0, 96).join('').trim()}…`
}

export interface BlockSearchSource {
  noteId: string
  noteTitle: string
  folderId: string | null
  /** Pre-flattened block texts, in document order. Read-only: a cloud
   *  workspace passes the arrays held inside its document, uncopied. */
  blocks: readonly string[]
}

export interface ScoredBlockMatch {
  score: number
  noteId: string
  noteTitle: string
  folderId: string | null
  blockIndex: number
  snippet: string
  blockText: string
}

/**
 * Scores every block of every source against the query and returns the best
 * matches, ordered by score then note title then block index — the same
 * ordering and cap the Rust command applies.
 */
export function searchBlocks(sources: BlockSearchSource[], query: string): ScoredBlockMatch[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const matches: ScoredBlockMatch[] = []
  for (const source of sources) {
    source.blocks.forEach((blockText, blockIndex) => {
      const score = textSearchScore(normalizedQuery, blockText)
      if (score === null) return
      matches.push({
        score,
        noteId: source.noteId,
        noteTitle: source.noteTitle,
        folderId: source.folderId,
        blockIndex,
        snippet: buildMatchSnippet(blockText, normalizedQuery),
        blockText,
      })
    })
  }

  matches.sort((left, right) =>
    right.score - left.score
    || left.noteTitle.localeCompare(right.noteTitle)
    || left.blockIndex - right.blockIndex)
  return matches.slice(0, MAX_BLOCK_SEARCH_RESULTS)
}
