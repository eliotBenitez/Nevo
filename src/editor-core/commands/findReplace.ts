import { TextSelection, type Command } from 'prosemirror-state'
import { findInNotePluginKey, getFindInNoteState } from '../plugins/find-in-note'
import { computeReplacementText, type FindQuery } from '../search/findMatches'

/** Sets (or clears, with `null`) the active find query. Recomputation and
 *  active-match tracking happen inside the plugin's `apply`. */
export function setFindQuery(query: FindQuery | null): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.setMeta(findInNotePluginKey, query ? { type: 'setQuery', query } : { type: 'clear' }))
    }
    return true
  }
}

/** Moves the active match forward (+1) or backward (-1), wrapping around. */
export function moveFindActive(delta: 1 | -1): Command {
  return (state, dispatch) => {
    const findState = getFindInNoteState(state)
    if (!findState || findState.matches.length === 0) return false
    if (dispatch) {
      const nextIndex = findState.activeIndex === -1 ? 0 : findState.activeIndex + delta
      dispatch(state.tr.setMeta(findInNotePluginKey, { type: 'setActive', index: nextIndex }))
    }
    return true
  }
}

/** Selects the active match in the document (used when closing the find bar
 *  so the user's place in the note is preserved as a real selection). */
export function selectActiveMatch(): Command {
  return (state, dispatch) => {
    const findState = getFindInNoteState(state)
    const match = findState && findState.activeIndex !== -1 ? findState.matches[findState.activeIndex] : null
    if (!match) return false
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView())
    }
    return true
  }
}

/** Replaces the active match. Uses `tr.insertText` (not `tr.delete` +
 *  insert) so the replacement text inherits the marks already present at
 *  the match — `insertText` itself falls back to a plain delete when the
 *  replacement is empty. No-ops while the query is an invalid regex. */
export function replaceActiveMatch(replacement: string): Command {
  return (state, dispatch) => {
    const findState = getFindInNoteState(state)
    if (!findState || findState.error || !findState.query || findState.activeIndex === -1) return false
    const match = findState.matches[findState.activeIndex]
    if (!match) return false
    if (dispatch) {
      const matchedText = state.doc.textBetween(match.from, match.to)
      const text = computeReplacementText(matchedText, findState.query, replacement)
      dispatch(state.tr.insertText(text, match.from, match.to))
    }
    return true
  }
}

/** Replaces every match in a single transaction. Matches are applied from
 *  last to first: since they never overlap and are ordered by position,
 *  editing a later match never shifts the positions of the ones still to
 *  come, so no position mapping is needed between steps. No-ops while the
 *  query is an invalid regex or there is nothing to replace. */
export function replaceAllMatches(replacement: string): Command {
  return (state, dispatch) => {
    const findState = getFindInNoteState(state)
    if (!findState || findState.error || !findState.query || findState.matches.length === 0) return false
    if (dispatch) {
      const query = findState.query
      const tr = state.tr
      for (let i = findState.matches.length - 1; i >= 0; i -= 1) {
        const match = findState.matches[i]
        const matchedText = state.doc.textBetween(match.from, match.to)
        const text = computeReplacementText(matchedText, query, replacement)
        tr.insertText(text, match.from, match.to)
      }
      dispatch(tr)
    }
    return true
  }
}
