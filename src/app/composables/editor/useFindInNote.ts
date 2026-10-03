import { ref, watch } from 'vue'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import {
  getFindInNoteState,
  moveFindActive,
  replaceActiveMatch,
  replaceAllMatches,
  selectActiveMatch,
  setFindQuery,
  type FindMatchesOutcomeReason,
  type FindQuery,
} from '../../../editor-core'

const MAX_SEEDED_SELECTION_LENGTH = 200
/** Approximate height of the floating find bar plus a little breathing room,
 *  so scrolling to a match never tucks it behind the bar. */
const SCROLL_TOP_INSET_PX = 72

export interface UseFindInNoteOptions {
  getView: () => EditorView | null
  getScrollEl: () => HTMLElement | null
  isAvailable: () => boolean
}

/** Vue-side state and orchestration for "Find & Replace in the current
 *  note" (Ctrl+F / Ctrl+H). All document search/replace logic itself lives
 *  in the framework-agnostic `nevo-find-in-note` plugin and its commands
 *  (`src/editor-core/plugins/find-in-note.ts`,
 *  `src/editor-core/commands/findReplace.ts`); this composable only owns the
 *  UI-facing reactive state and translates it into plugin dispatches. */
export function useFindInNote(options: UseFindInNoteOptions) {
  const open = ref(false)
  const replaceOpen = ref(false)
  const query = ref('')
  const replacement = ref('')
  const caseSensitive = ref(false)
  const wholeWord = ref(false)
  const regex = ref(false)
  const matchCount = ref(0)
  const activeIndex = ref(-1)
  const hasError = ref(false)
  const errorReason = ref<FindMatchesOutcomeReason | undefined>(undefined)
  const truncated = ref(false)
  /** Bumped whenever the find input should steal focus and select its text —
   *  the bar watches this rather than `open` so re-pressing Ctrl+F while the
   *  bar is already open still re-focuses it. */
  const focusToken = ref(0)

  function runCommand(command: Command): boolean {
    const view = options.getView()
    if (!view) return false
    try {
      return command(view.state, view.dispatch.bind(view))
    } catch {
      return false
    }
  }

  function buildQuery(): FindQuery | null {
    if (!query.value) return null
    return { text: query.value, caseSensitive: caseSensitive.value, wholeWord: wholeWord.value, regex: regex.value }
  }

  function syncFromState() {
    const view = options.getView()
    const state = view ? getFindInNoteState(view.state) : undefined
    matchCount.value = state?.matches.length ?? 0
    activeIndex.value = state?.activeIndex ?? -1
    hasError.value = state?.error ?? false
    errorReason.value = state?.reason
    truncated.value = state?.truncated ?? false
  }

  function scrollActiveIntoView() {
    const view = options.getView()
    const scrollEl = options.getScrollEl()
    if (!view || !scrollEl) return
    const state = getFindInNoteState(view.state)
    const match = state && state.activeIndex !== -1 ? state.matches[state.activeIndex] : null
    if (!match) return

    try {
      const coords = view.coordsAtPos(match.from)
      const rect = scrollEl.getBoundingClientRect()
      const visibleTop = rect.top + SCROLL_TOP_INSET_PX
      if (coords.top >= visibleTop && coords.bottom <= rect.bottom) return

      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const targetTop = scrollEl.scrollTop + (coords.top - rect.top) - (rect.height + SCROLL_TOP_INSET_PX) / 2
      scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: reducedMotion ? 'auto' : 'smooth' })
    } catch {
      // coordsAtPos can throw for a stale/detached position — best-effort only.
    }
  }

  function dispatchQuery() {
    runCommand(setFindQuery(buildQuery()))
    syncFromState()
    scrollActiveIntoView()
  }

  watch([query, caseSensitive, wholeWord, regex], () => {
    if (open.value) dispatchQuery()
  })

  function seedQueryFromSelection() {
    const view = options.getView()
    if (!view) return
    const { selection } = view.state
    if (selection.empty) return
    const text = view.state.doc.textBetween(selection.from, selection.to, '\n')
    if (!text || text.includes('\n') || text.length > MAX_SEEDED_SELECTION_LENGTH) return
    query.value = text
  }

  function openFind(openOptions: { withReplace?: boolean } = {}): boolean {
    if (!options.isAvailable()) return false
    seedQueryFromSelection()
    if (openOptions.withReplace) replaceOpen.value = true
    open.value = true
    focusToken.value += 1
    dispatchQuery()
    return true
  }

  function close(closeOptions: { restoreSelection?: boolean } = {}) {
    const restoreSelection = closeOptions.restoreSelection ?? true
    if (restoreSelection) runCommand(selectActiveMatch())
    runCommand(setFindQuery(null))
    options.getView()?.focus()
    open.value = false
    replaceOpen.value = false
    syncFromState()
  }

  function next() {
    runCommand(moveFindActive(1))
    syncFromState()
    scrollActiveIntoView()
  }

  function prev() {
    runCommand(moveFindActive(-1))
    syncFromState()
    scrollActiveIntoView()
  }

  function replaceOne() {
    runCommand(replaceActiveMatch(replacement.value))
    syncFromState()
    scrollActiveIntoView()
  }

  function replaceAll() {
    runCommand(replaceAllMatches(replacement.value))
    syncFromState()
  }

  /** Called by the pane after every editor transaction so match counts stay
   *  live while the bar is open (typing, collab edits, undo/redo). */
  function onEditorTransaction() {
    if (!open.value) return
    syncFromState()
  }

  /** Closes the bar without touching the editor selection — used when the
   *  note or view mode changes out from under an open find session, where
   *  the plugin's own state has already reset against the new document. */
  function reset() {
    if (!open.value) return
    open.value = false
    replaceOpen.value = false
    syncFromState()
  }

  return {
    open,
    replaceOpen,
    query,
    replacement,
    caseSensitive,
    wholeWord,
    regex,
    matchCount,
    activeIndex,
    hasError,
    errorReason,
    truncated,
    focusToken,
    openFind,
    close,
    next,
    prev,
    replaceOne,
    replaceAll,
    onEditorTransaction,
    reset,
  }
}

export type UseFindInNoteReturn = ReturnType<typeof useFindInNote>
