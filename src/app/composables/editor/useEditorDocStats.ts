import { computed, ref } from 'vue'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorCore } from './useEditorCore'
import type { WorkspaceSettings } from '../../../types/workspace'
import { useGraphStore } from '../../../stores/graph'
import { extractLinks } from '../../../editor-core/extract-links'
import { countWordsInText } from '../../../utils/noteWordCount'

const STATS_UPDATE_DELAY_MS = 200
const GRAPH_UPDATE_DELAY_MS = 600

/** Word/char count stats + debounced graph-edge extraction, extracted from
 *  WorkspaceEditorPane. Large-doc textContent reads are deferred and disabled
 *  when the stats corner is hidden. */
export function useEditorDocStats(
  core: EditorCore,
  getSettings: () => WorkspaceSettings,
  getNoteId: () => string | undefined,
) {
  const graphStore = useGraphStore()

  const editorDocText = ref('')
  const editorWordText = ref('')
  let statsUpdateTimer: ReturnType<typeof setTimeout> | null = null
  let lastStatsDoc: object | null = null
  let graphUpdateTimer: ReturnType<typeof setTimeout> | null = null
  let pendingGraphDoc: ProseMirrorNode | null = null
  let pendingGraphNoteId: string | null = null

  function clearStatsUpdateTimer() {
    if (statsUpdateTimer) {
      clearTimeout(statsUpdateTimer)
      statsUpdateTimer = null
    }
  }

  function clearGraphUpdateTimer() {
    if (graphUpdateTimer) {
      clearTimeout(graphUpdateTimer)
      graphUpdateTimer = null
    }
  }

  function statsVisible() {
    return getSettings().editor.editorStatsVisibility === 'corner'
  }

  function updateEditorStatsNow() {
    clearStatsUpdateTimer()
    if (!statsVisible()) {
      if (editorDocText.value) editorDocText.value = ''
      if (editorWordText.value) editorWordText.value = ''
      return
    }
    const currentDoc = core.editorView?.state.doc ?? null
    const nextDocText = currentDoc?.textContent ?? ''
    const nextWordText = currentDoc?.textBetween(0, currentDoc.content.size, '\n', '\n') ?? ''
    if (nextDocText !== editorDocText.value) editorDocText.value = nextDocText
    if (nextWordText !== editorWordText.value) editorWordText.value = nextWordText
    lastStatsDoc = currentDoc
  }

  function scheduleEditorStatsUpdate() {
    clearStatsUpdateTimer()
    if (!statsVisible()) {
      if (editorDocText.value) editorDocText.value = ''
      if (editorWordText.value) editorWordText.value = ''
      return
    }
    statsUpdateTimer = setTimeout(updateEditorStatsNow, STATS_UPDATE_DELAY_MS)
  }

  function scheduleGraphUpdate(doc: ProseMirrorNode) {
    const noteId = getNoteId()
    if (!noteId) return
    pendingGraphDoc = doc
    pendingGraphNoteId = noteId
    clearGraphUpdateTimer()
    graphUpdateTimer = setTimeout(() => {
      graphUpdateTimer = null
      const nextDoc = pendingGraphDoc
      const nextNoteId = pendingGraphNoteId
      pendingGraphDoc = null
      pendingGraphNoteId = null
      if (nextDoc && nextNoteId) {
        graphStore.updateNoteEdges(nextNoteId, extractLinks(nextDoc))
      }
    }, GRAPH_UPDATE_DELAY_MS)
  }

  /** Stats half of the editor's after-transaction hook: re-measure only when
   *  the document actually changed. */
  function onTransactionDoc(doc: object) {
    if (doc !== lastStatsDoc) {
      lastStatsDoc = doc
      scheduleEditorStatsUpdate()
    }
  }

  /** Force a re-measure (e.g. when the stats-visibility setting changes). */
  function resetStatsTracking() {
    lastStatsDoc = null
    updateEditorStatsNow()
  }

  function clearTimers() {
    clearStatsUpdateTimer()
    clearGraphUpdateTimer()
    pendingGraphDoc = null
    pendingGraphNoteId = null
  }

  const editorWordCount = computed(() => {
    if (getSettings().editor.editorStatsVisibility !== 'corner') return null
    return {
      words: countWordsInText(editorWordText.value),
      chars: editorDocText.value.length,
    }
  })

  return {
    editorDocText,
    editorWordCount,
    updateEditorStatsNow,
    scheduleGraphUpdate,
    onTransactionDoc,
    resetStatsTracking,
    clearTimers,
  }
}
