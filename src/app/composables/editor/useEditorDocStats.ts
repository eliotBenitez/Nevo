import { computed, ref } from 'vue'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorCore } from './useEditorCore'
import type { WorkspaceSettings } from '../../../types/workspace'
import type { ExtractedEdge } from '../../../types/graph'
import { useGraphStore } from '../../../stores/graph'
import { extractLinks } from '../../../editor-core/extract-links'
import { computeDocStats, type DocStats } from '../../../editor-core/docStats'
import { createIdleTaskScheduler } from './idleTaskScheduler'

const STATS_UPDATE_DELAY_MS = 200
const GRAPH_UPDATE_DELAY_MS = 600

function edgesEqual(a: readonly ExtractedEdge[], b: readonly ExtractedEdge[]): boolean {
  if (a.length !== b.length) return false
  return a.every((edge, index) => {
    const other = b[index]
    return edge.target === other.target
      && edge.kind === other.kind
      && edge.anchor === other.anchor
      && edge.position === other.position
  })
}

/** Word/char count stats + debounced graph-edge extraction, extracted from
 *  WorkspaceEditorPane. Stats are derived in a single doc walk
 *  (`computeDocStats`) and disabled when the stats corner is hidden, instead
 *  of materializing the whole document as a string on every update. */
export function useEditorDocStats(
  core: EditorCore,
  getSettings: () => WorkspaceSettings,
  getNoteId: () => string | undefined,
) {
  const graphStore = useGraphStore()

  const stats = ref<DocStats | null>(null)
  let lastStatsDoc: object | null = null
  let pendingGraphDoc: ProseMirrorNode | null = null
  let pendingGraphNoteId: string | null = null
  // Edge list last actually sent to the backend, per note, so a transaction
  // that touched the document but not any link mark (the common case) skips
  // the `graphUpdateNoteEdges` IPC round trip and its SQLite/manifest write.
  const lastSentEdgesByNoteId = new Map<string, ExtractedEdge[]>()

  function statsVisible() {
    return getSettings().editor.editorStatsVisibility === 'corner'
  }

  function calculateEditorStats() {
    if (!statsVisible()) {
      if (stats.value) stats.value = null
      return
    }
    const currentDoc = core.editorView?.state.doc ?? null
    stats.value = currentDoc ? computeDocStats(currentDoc) : null
    lastStatsDoc = currentDoc
  }

  const statsUpdateTask = createIdleTaskScheduler(calculateEditorStats, {
    delayMs: STATS_UPDATE_DELAY_MS,
    idleTimeoutMs: 800,
  })

  function updateEditorStatsNow() {
    statsUpdateTask.cancel()
    calculateEditorStats()
  }

  function scheduleEditorStatsUpdate() {
    if (!statsVisible()) {
      statsUpdateTask.cancel()
      if (stats.value) stats.value = null
      return
    }
    statsUpdateTask.schedule()
  }

  function flushGraphUpdate() {
    const nextDoc = pendingGraphDoc
    const nextNoteId = pendingGraphNoteId
    pendingGraphDoc = null
    pendingGraphNoteId = null
    if (!nextDoc || !nextNoteId) return

    const edges = extractLinks(nextDoc)
    const lastEdges = lastSentEdgesByNoteId.get(nextNoteId)
    if (lastEdges && edgesEqual(lastEdges, edges)) return

    lastSentEdgesByNoteId.set(nextNoteId, edges)
    graphStore.updateNoteEdges(nextNoteId, edges)
  }

  const graphUpdateTask = createIdleTaskScheduler(flushGraphUpdate, {
    delayMs: GRAPH_UPDATE_DELAY_MS,
    idleTimeoutMs: 1_200,
  })

  function scheduleGraphUpdate(doc: ProseMirrorNode) {
    const noteId = getNoteId()
    if (!noteId) return
    pendingGraphDoc = doc
    pendingGraphNoteId = noteId
    graphUpdateTask.schedule()
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
    statsUpdateTask.cancel()
    graphUpdateTask.flush()
  }

  const editorWordCount = computed(() => {
    if (getSettings().editor.editorStatsVisibility !== 'corner') return null
    return stats.value
  })

  return {
    editorWordCount,
    updateEditorStatsNow,
    scheduleGraphUpdate,
    onTransactionDoc,
    resetStatsTracking,
    clearTimers,
  }
}
