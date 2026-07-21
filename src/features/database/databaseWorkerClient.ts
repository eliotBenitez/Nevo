import { visibleRecords } from '../../editor-core/databaseFilterSort'
import type { DbField, DbFilterRule, DbRecord, DbSortRule } from '../../types/database-block'

let sequence = 0
const REQUEST_TIMEOUT_MS = 30_000

interface WorkerResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let sharedWorker: Worker | null = null
const pending = new Map<number, PendingRequest>()

function rejectAll(message: string) {
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.reject(new Error(message))
  }
  pending.clear()
  sharedWorker?.terminate()
  sharedWorker = null
}

function workerInstance(): Worker {
  if (sharedWorker) return sharedWorker
  const worker = new Worker(new URL('./databaseWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    clearTimeout(request.timer)
    if (event.data.ok) request.resolve(event.data.result)
    else request.reject(new Error(event.data.error || 'Database worker failed'))
  }
  worker.onerror = () => rejectAll('Database worker failed')
  worker.onmessageerror = () => rejectAll('Database worker could not read a response')
  sharedWorker = worker
  return worker
}

function run<T>(request: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Web Worker is unavailable'))
  const id = ++sequence
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Database worker request was cancelled', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Database worker request timed out'))
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, {
      resolve: value => resolve(value as T),
      reject,
      timer,
    })
    signal?.addEventListener('abort', () => {
      const active = pending.get(id)
      if (!active) return
      pending.delete(id)
      clearTimeout(active.timer)
      active.reject(new DOMException('Database worker request was cancelled', 'AbortError'))
    }, { once: true })
    workerInstance().postMessage({ ...request, id })
  })
}

export function disposeDatabaseWorker() {
  rejectAll('Database worker was disposed')
}

export interface CsvWorkerResult { headers: string[]; rows: string[][]; delimiter: string; types: string[] }
export function parseCsvInWorker(text: string, delimiter?: string, signal?: AbortSignal) {
  return run<CsvWorkerResult>({ type: 'csv', text, delimiter }, signal)
}

export async function filterAndSortInWorker(
  records: DbRecord[], fields: DbField[], filters: DbFilterRule[], sorts: DbSortRule[], signal?: AbortSignal,
): Promise<DbRecord[]> {
  if (typeof Worker === 'undefined') return visibleRecords(records, filters, sorts, fields)
  return run<DbRecord[]>({ type: 'visibleRecords', records, fields, filters, sorts }, signal)
}
