import { createNotebookExport } from '../../../core/notebook/export'
import type { NotebookSnapshotV1 } from '../../../core/notebook/types'

interface ExportRequest {
  id: number
  snapshot: NotebookSnapshotV1
  includePaper: boolean
}

self.addEventListener('message', (event: MessageEvent<ExportRequest>) => {
  const { id, snapshot, includePaper } = event.data
  try {
    const pages = createNotebookExport(snapshot, includePaper)
    self.postMessage({ id, ok: true, pages })
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
