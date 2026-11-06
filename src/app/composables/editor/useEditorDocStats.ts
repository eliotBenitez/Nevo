import { computed, ref } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { WorkspaceSettings } from '../../../types/workspace'
import { computeDocStats, type DocStats } from '../../../editor-core/docStats'
import { createIdleTaskScheduler } from './idleTaskScheduler'

const STATS_UPDATE_DELAY_MS = 200

/** Word/char count stats, extracted from WorkspaceEditorPane. Stats are
 *  derived in a single doc walk (`computeDocStats`) and disabled when the
 *  stats corner is hidden, instead of materializing the whole document as a
 *  string on every update. */
export function useEditorDocStats(
  core: EditorCore,
  getSettings: () => WorkspaceSettings,
) {
  const stats = ref<DocStats | null>(null)
  let lastStatsDoc: object | null = null

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
  }

  const editorWordCount = computed(() => {
    if (getSettings().editor.editorStatsVisibility !== 'corner') return null
    return stats.value
  })

  return {
    editorWordCount,
    updateEditorStatsNow,
    onTransactionDoc,
    resetStatsTracking,
    clearTimers,
  }
}
