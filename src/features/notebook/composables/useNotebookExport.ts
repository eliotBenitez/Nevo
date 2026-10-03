import { ref } from 'vue'
import type { NotebookExportV1, NotebookSnapshotV1 } from '../../../core/notebook/types'
import { exportNotebookPdf } from '../../../tauri/notebook'

interface NotebookExportWorker {
  postMessage(message: ExportRequest): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ExportResponse>) => void, options?: AddEventListenerOptions): void
  addEventListener(type: 'error' | 'messageerror', listener: (event: ErrorEvent | MessageEvent) => void, options?: AddEventListenerOptions): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<ExportResponse>) => void): void
  removeEventListener(type: 'error' | 'messageerror', listener: (event: ErrorEvent | MessageEvent) => void): void
  terminate(): void
}

interface ExportRequest {
  id: number
  snapshot: NotebookSnapshotV1
  includePaper: boolean
}

type ExportResponse =
  | { id: number; ok: true; pages: NotebookExportV1['pages'] }
  | { id: number; ok: false; error: string }

let nextExportId = 0

function createWorker(): NotebookExportWorker {
  return new Worker(new URL('../workers/notebookExport.worker.ts', import.meta.url), { type: 'module' }) as unknown as NotebookExportWorker
}

export function renderNotebookExport(
  snapshot: NotebookSnapshotV1,
  includePaper = true,
  workerFactory: () => NotebookExportWorker = createWorker,
): Promise<NotebookExportV1['pages']> {
  const worker = workerFactory()
  const id = ++nextExportId
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<ExportResponse>) => {
      if (event.data.id !== id) return
      cleanup()
      if (event.data.ok) resolve(event.data.pages)
      else reject(new Error(event.data.error))
    }
    const onFailure = (event: ErrorEvent | MessageEvent) => {
      cleanup()
      reject(event instanceof ErrorEvent ? event.error ?? new Error(event.message) : new Error('Notebook export worker failed to clone its response.'))
    }
    const cleanup = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onFailure)
      worker.removeEventListener('messageerror', onFailure)
      worker.terminate()
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onFailure)
    worker.addEventListener('messageerror', onFailure)
    worker.postMessage({ id, snapshot, includePaper })
  })
}

export function useNotebookExport(options: {
  noteId: string
  workspacePath: string
  title: () => string
  snapshot: () => NotebookSnapshotV1
  pauseInput(): void
  resumeInput(): void
  includePaper?: () => boolean
  flushDurably(): Promise<{ ok: true } | { ok: false; error: unknown }>
  render?: (snapshot: NotebookSnapshotV1, includePaper: boolean) => Promise<NotebookExportV1['pages']>
  savePdf?: typeof exportNotebookPdf
  onError(error: unknown): void
}) {
  const exporting = ref(false)

  async function exportPdf(): Promise<boolean> {
    if (exporting.value) return false
    exporting.value = true
    let inputResumed = false
    try {
      options.pauseInput()
      const flush = await options.flushDurably()
      if (!flush.ok) {
        options.onError(flush.error)
        return false
      }
      const capturedSnapshot = options.snapshot()
      options.resumeInput()
      inputResumed = true
      const pages = await (options.render ?? renderNotebookExport)(capturedSnapshot, options.includePaper?.() ?? true)
      const fileName = `${safeFileStem(options.title()) || 'Notebook'}.pdf`
      const output = await (options.savePdf ?? exportNotebookPdf)({
        workspacePath: options.workspacePath,
        noteId: options.noteId,
        fileName,
        pages,
      })
      return output.status === 'exported'
    } catch (error) {
      options.onError(error)
      return false
    } finally {
      if (!inputResumed) options.resumeInput()
      exporting.value = false
    }
  }

  return { exporting, exportPdf }
}

function safeFileStem(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, ' ').split('').map(character => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('').replace(/[. ]+$/g, '').trim().slice(0, 120)
}
