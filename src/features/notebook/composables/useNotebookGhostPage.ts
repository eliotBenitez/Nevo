import { computed, shallowRef } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import { createNotebookId } from '../../../core/notebook/codec'
import { appendNotebookPage } from '../../../core/notebook/operations'
import { estimateNotebookBytes } from '../../../core/notebook/snapshotBytes'
import { NOTEBOOK_PAGE_LIMIT } from '../../../core/notebook/types'
import type { NotebookPageV1, NotebookSnapshotV1 } from '../../../core/notebook/types'

type NotebookCounts = [objects: number, points: number, bytes: number]

export interface NotebookGhostHost {
  snapshot: ShallowRef<NotebookSnapshotV1>
  snapshotStats: WeakMap<NotebookSnapshotV1, { objects: number; points: number; bytes: number }>
  counts: { get(): NotebookCounts; set(counts: NotebookCounts): void }
  selectPage(pageId: string): void
}

export interface NotebookGhostPage {
  ghostPage: ComputedRef<NotebookPageV1 | null>
  onGhostPage(pageId: string | null | undefined, action: () => void): void
  /** Snapshot before the page was staged; the first commit of a gesture uses it as its Undo target. */
  stagedBase(): NotebookSnapshotV1 | null
}

/**
 * A session-only blank page that always follows the last page. It never enters the snapshot
 * on its own: the first commit that lands content on it carries the page with it, so a single
 * undo removes both.
 */
export function useNotebookGhostPage(host: NotebookGhostHost): NotebookGhostPage {
  let staged: { base: NotebookSnapshotV1; counts: NotebookCounts } | null = null
  const ghostId = shallowRef(createNotebookId())
  const ghostPage = computed<NotebookPageV1 | null>(() => {
    const snapshot = host.snapshot.value
    if (snapshot.pages.length >= NOTEBOOK_PAGE_LIMIT) return null
    return appendNotebookPage(snapshot, { id: ghostId.value }).pages.at(-1) ?? null
  })

  function onGhostPage(pageId: string | null | undefined, action: () => void): void {
    const ghost = ghostPage.value
    const base = host.snapshot.value
    if (!ghost || !pageId || pageId !== ghost.id || base.pages.some(page => page.id === pageId)) {
      action()
      return
    }
    const next = appendNotebookPage(base, { id: ghost.id })
    const counts = host.counts.get()
    const grown: NotebookCounts = [counts[0], counts[1], counts[2] + estimateNotebookBytes(ghost) + 1]
    staged = { base, counts }
    host.snapshotStats.set(next, { objects: grown[0], points: grown[1], bytes: grown[2] })
    host.counts.set(grown)
    host.snapshot.value = next
    try {
      action()
      if (host.snapshot.value !== next) {
        host.selectPage(ghost.id)
        ghostId.value = createNotebookId()
      }
    } finally {
      // Nothing was committed (or the action threw): drop the staged blank page.
      if (host.snapshot.value === next) {
        host.snapshot.value = base
        host.counts.set(counts)
      }
      staged = null
    }
  }

  return { ghostPage, onGhostPage, stagedBase: () => staged?.base ?? null }
}
