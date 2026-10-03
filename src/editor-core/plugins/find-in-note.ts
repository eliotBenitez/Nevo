import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import { buildFindRegExp, collectTextRuns, findMatchesInDoc, type FindMatch, type FindQuery } from '../search/findMatches'
import { FindMatchesClient, type FindMatchesOutcomeReason } from '../search/findMatchesClient'

export const findInNotePluginKey = new PluginKey<FindInNoteState>('nevo-find-in-note')

export interface FindInNoteState {
  query: FindQuery | null
  matches: FindMatch[]
  activeIndex: number
  error: boolean
  /** Set alongside `error`: why the query has no matches. `undefined` when
   *  `error` is false. Regex-only ('invalid' | 'unsafe' come from the static
   *  check in `buildFindRegExp`; 'timeout' comes from the async worker
   *  request taking too long). */
  reason?: FindMatchesOutcomeReason
  truncated: boolean
  /** True while a regex query's match computation is running in the worker.
   *  `matches`/`decorations` still hold the last-known-good result (mapped
   *  through intervening edits) so highlights do not flash empty. Always
   *  false for literal queries, which compute synchronously. */
  pending: boolean
  /** Bumped every time the regex path needs a fresh worker computation. The
   *  view plugin below reads it to know when to fire a new request, and a
   *  `setResults` meta is only applied if it still matches the request it
   *  was computed for — anything older is a stale, discarded result. */
  requestId: number
  decorations: DecorationSet
}

type FindInNoteMeta =
  | { type: 'setQuery'; query: FindQuery | null }
  | { type: 'setActive'; index: number }
  | { type: 'clear' }
  | { type: 'setResults'; requestId: number; matches: FindMatch[]; truncated: boolean; error: boolean; reason?: FindMatchesOutcomeReason }

const MATCH_LIMIT = 5000

function buildDecorations(doc: PMNode, matches: FindMatch[], activeIndex: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty
  const decorations = matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === activeIndex ? 'nv-find-match nv-find-match--active' : 'nv-find-match',
    }),
  )
  return DecorationSet.create(doc, decorations)
}

/** First match at or after `pos`; wraps to the first match overall when
 *  every match lies before `pos`; -1 when there are no matches at all. */
function activeIndexNear(matches: FindMatch[], pos: number): number {
  if (matches.length === 0) return -1
  const index = matches.findIndex((match) => match.from >= pos)
  return index === -1 ? 0 : index
}

const EMPTY_STATE: Omit<FindInNoteState, 'decorations'> = {
  query: null,
  matches: [],
  activeIndex: -1,
  error: false,
  reason: undefined,
  truncated: false,
  pending: false,
  requestId: 0,
}

function emptyState(): FindInNoteState {
  return { ...EMPTY_STATE, decorations: DecorationSet.empty }
}

/** Builds the state for a brand-new query (the `setQuery` meta). Literal
 *  queries compute synchronously, exactly as before — they cannot backtrack
 *  catastrophically and must stay instant. A regex query is validated
 *  synchronously (syntax + `isSafeRegexSource`) but its matches are never
 *  computed here: it comes back `pending`, keeping whatever matches were
 *  already on screen, and the view plugin below requests the real result
 *  off the UI thread. */
function buildQueryState(doc: PMNode, query: FindQuery | null, activeNearPos: number, prev: FindInNoteState): FindInNoteState {
  if (!query || !query.text) return emptyState()

  if (!query.regex) {
    const { matches, error, reason, truncated } = findMatchesInDoc(doc, query, MATCH_LIMIT)
    const activeIndex = activeIndexNear(matches, activeNearPos)
    return {
      query, matches, activeIndex, error, reason, truncated, pending: false, requestId: prev.requestId,
      decorations: buildDecorations(doc, matches, activeIndex),
    }
  }

  // Validate the pattern (syntax + `isSafeRegexSource`) without ever
  // running it against document text — matching itself always happens off
  // the UI thread for a regex query, even a safe one.
  const built = buildFindRegExp(query)
  if (built.error) {
    const { reason } = built
    return {
      query, matches: [], activeIndex: -1, error: true, reason, truncated: false, pending: false, requestId: prev.requestId,
      decorations: DecorationSet.empty,
    }
  }

  // Valid & safe: keep any matches already on screen (from a prior query or
  // doc state) while the fresh regex computation runs asynchronously.
  const carriedMatches = prev.error ? [] : prev.matches
  const activeIndex = activeIndexNear(carriedMatches, activeNearPos)
  return {
    query, matches: carriedMatches, activeIndex, error: false, reason: undefined, truncated: prev.truncated,
    pending: true, requestId: prev.requestId + 1,
    decorations: buildDecorations(doc, carriedMatches, activeIndex),
  }
}

/** Handles a doc-changing transaction while a query is active. Literal
 *  search recomputes synchronously (unchanged behavior). Regex search never
 *  runs on the UI thread here: existing matches are remapped through
 *  `tr.mapping` so highlights stay roughly in place, `pending` is set, and
 *  `requestId` is bumped so the view plugin fires a fresh async request —
 *  which supersedes (and, via the id check, discards the result of) any
 *  request already in flight for the pre-edit doc. */
function buildDocChangedState(newDoc: PMNode, tr: Transaction, prev: FindInNoteState, activeNearPos: number): FindInNoteState {
  if (!prev.query) return prev

  const mappedActiveNearPos = tr.mapping.map(activeNearPos)

  if (!prev.query.regex) {
    return buildQueryState(newDoc, prev.query, mappedActiveNearPos, prev)
  }

  const mappedMatches = prev.matches.map((match) => ({
    from: tr.mapping.map(match.from, -1),
    to: tr.mapping.map(match.to, 1),
  }))
  const activeIndex = activeIndexNear(mappedMatches, mappedActiveNearPos)
  return {
    ...prev,
    matches: mappedMatches,
    activeIndex,
    pending: true,
    requestId: prev.requestId + 1,
    decorations: buildDecorations(newDoc, mappedMatches, activeIndex),
  }
}

/** Fires the async regex match request when the plugin state says one is
 *  pending, and applies the result via `setResults` once it resolves — or
 *  discards it if a newer request has since superseded it. Owns one
 *  `FindMatchesClient` (and its worker) per editor view unless one is
 *  injected (tests only — see `CreateFindInNotePluginOptions`). Kept
 *  entirely inside this ProseMirror plugin's `view` hook so no Vue/store
 *  code is involved in driving regex search. */
function createRegexSearchViewPlugin(options: CreateFindInNotePluginOptions) {
  return (editorView: EditorView) => {
    const client = options.client ?? new FindMatchesClient()
    let lastRequestedId = -1

    function maybeRequest(view: EditorView) {
      const findState = findInNotePluginKey.getState(view.state)
      if (!findState || !findState.pending || !findState.query || findState.requestId === lastRequestedId) return
      lastRequestedId = findState.requestId

      const { requestId, query } = findState
      const runs = collectTextRuns(view.state.doc)
      client.requestMatches(runs, query, MATCH_LIMIT).then((outcome) => {
        if (view.isDestroyed) return
        view.dispatch(view.state.tr.setMeta(findInNotePluginKey, {
          type: 'setResults',
          requestId,
          matches: outcome.matches,
          truncated: outcome.truncated,
          error: outcome.error,
          reason: outcome.reason,
        }))
      })
    }

    maybeRequest(editorView)

    return {
      update: maybeRequest,
      destroy() {
        client.dispose()
      },
    }
  }
}

/** Find & Replace state for the current note. Literal queries recompute
 *  synchronously on every doc-changing transaction, exactly as before.
 *  Regex queries are computed off the UI thread (see
 *  `createRegexSearchViewPlugin` above) so a pathological pattern can never
 *  freeze the editor. See `commands/findReplace.ts` for the commands that
 *  drive this plugin via `setMeta`. */
export interface CreateFindInNotePluginOptions {
  /** Replaces the internally constructed `FindMatchesClient`. Tests only —
   *  lets a test control (and delay) when a regex request resolves via an
   *  injected worker factory; production code never passes this. */
  client?: FindMatchesClient
}

export function createFindInNotePlugin(options: CreateFindInNotePluginOptions = {}): Plugin<FindInNoteState> {
  return new Plugin<FindInNoteState>({
    key: findInNotePluginKey,
    state: {
      init() {
        return emptyState()
      },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(findInNotePluginKey) as FindInNoteMeta | undefined

        if (meta?.type === 'clear') {
          return emptyState()
        }
        if (meta?.type === 'setQuery') {
          return buildQueryState(newState.doc, meta.query, newState.selection.from, prev)
        }
        if (meta?.type === 'setActive') {
          if (prev.matches.length === 0) return prev
          const index = ((meta.index % prev.matches.length) + prev.matches.length) % prev.matches.length
          if (index === prev.activeIndex) return prev
          return { ...prev, activeIndex: index, decorations: buildDecorations(newState.doc, prev.matches, index) }
        }
        if (meta?.type === 'setResults') {
          if (meta.requestId !== prev.requestId) return prev // superseded by a newer request
          const activeNearPos = prev.matches[prev.activeIndex]?.from ?? newState.selection.from
          const activeIndex = activeIndexNear(meta.matches, activeNearPos)
          return {
            ...prev,
            matches: meta.matches,
            truncated: meta.truncated,
            error: meta.error,
            reason: meta.reason,
            pending: false,
            activeIndex,
            decorations: buildDecorations(newState.doc, meta.matches, activeIndex),
          }
        }

        if (!prev.query || !tr.docChanged) return prev

        const prevActive = prev.matches[prev.activeIndex] ?? null
        const activeNearPos = prevActive ? prevActive.from : newState.selection.from
        return buildDocChangedState(newState.doc, tr, prev, activeNearPos)
      },
    },
    props: {
      decorations(state) {
        return findInNotePluginKey.getState(state)?.decorations
      },
    },
    view: createRegexSearchViewPlugin(options),
  })
}

export function getFindInNoteState(state: EditorState): FindInNoteState | undefined {
  return findInNotePluginKey.getState(state)
}
