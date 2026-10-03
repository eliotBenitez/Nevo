import type { NoteDocument } from '../../types/note'
import { createNotebookSavePatch, type NotebookSavePatch } from './savePatch'

export type NotebookSaveRequest =
  | { id: number; kind: 'prime'; note: NoteDocument }
  | { id: number; kind: 'encode'; patch: NotebookSavePatch }
export type NotebookSaveResponse = { id: number; ok: true; bytes?: ArrayBuffer } | { id: number; ok: false; error: string }
export interface NotebookSaveWorker {
  postMessage(request: NotebookSaveRequest): void
  onmessage: ((event: MessageEvent<NotebookSaveResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: (() => void) | null
  terminate(): void
}

export function createNotebookSaveTransport(factory: () => NotebookSaveWorker) {
  let worker: NotebookSaveWorker | null = null
  let previous: NoteDocument | null = null
  let previousKey: string | null = null
  let nextId = 0
  const pending = new Map<number, { resolve(bytes?: ArrayBuffer): void; reject(error: Error): void }>()

  function fail(error: Error): void {
    worker?.terminate()
    worker = null
    previous = null
    previousKey = null
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }

  function request(message: NotebookSaveRequest): Promise<ArrayBuffer | undefined> {
    if (!worker) {
      try {
        worker = factory()
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error))
        fail(failure)
        throw failure
      }
      worker.onmessage = ({ data }) => {
        const waiter = pending.get(data.id)
        if (!waiter) return
        pending.delete(data.id)
        if (data.ok) waiter.resolve(data.bytes)
        else { waiter.reject(new Error(data.error)); fail(new Error(data.error)) }
      }
      worker.onerror = event => fail(new Error(event.message || 'Notebook save worker failed.'))
      worker.onmessageerror = () => fail(new Error('Notebook save worker response is unreadable.'))
    }
    return new Promise((resolve, reject) => {
      pending.set(message.id, { resolve, reject })
      try { worker!.postMessage(message) } catch (error) { fail(error instanceof Error ? error : new Error(String(error))) }
    })
  }

  async function prime(key: string, note: NoteDocument): Promise<void> {
    if (previousKey === key && previous?.notebook === note.notebook) return
    previousKey = key
    previous = { ...note }
    await request({ id: ++nextId, kind: 'prime', note })
  }

  async function encode(key: string, note: NoteDocument): Promise<ArrayBuffer> {
    if (previousKey !== key || !previous) {
      // Post the base and its delta together before awaiting: another note can
      // be primed while this write waits, without changing the captured request.
      previousKey = key
      previous = { ...note }
      void request({ id: ++nextId, kind: 'prime', note }).catch(() => {})
    }
    const patch = createNotebookSavePatch(previous, note)
    previous = { ...note }
    const bytes = await request({ id: ++nextId, kind: 'encode', patch })
    if (!bytes) throw new Error('Notebook save worker returned no data.')
    return bytes
  }

  return { prime, encode }
}
