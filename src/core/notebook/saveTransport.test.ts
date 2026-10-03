import { describe, expect, it } from 'vitest'
import { createNotebook } from './codec'
import { applyNotebookSavePatch } from './savePatch'
import { createNotebookSaveTransport, type NotebookSaveRequest, type NotebookSaveWorker } from './saveTransport'
import type { NoteDocument } from '../../types/note'

function note(id: string): NoteDocument {
  return { id, title: id, icon: '', folderId: null, createdAt: '', updatedAt: '',
    content: { type: 'doc' }, documentKind: 'notebook', notebook: createNotebook() }
}

describe('notebook save transport', () => {
  it('rejects worker construction failure asynchronously and retries from a fresh base', async () => {
    let attempts = 0
    const transport = createNotebookSaveTransport(() => {
      attempts++
      throw new Error('Worker unavailable')
    })
    const a = note('a')
    await expect(transport.prime('a', a)).rejects.toThrow('Worker unavailable')
    await expect(transport.prime('a', a)).rejects.toThrow('Worker unavailable')
    expect(attempts).toBe(2)
  })

  it('captures each concurrent write even when another note primes the worker', async () => {
    let current: NoteDocument | null = null
    const messages: NotebookSaveRequest[] = []
    const worker: NotebookSaveWorker = {
      onmessage: null, onerror: null, onmessageerror: null, terminate() {},
      postMessage(request) {
        messages.push(request)
        queueMicrotask(() => {
          if (request.kind === 'prime') current = structuredClone(request.note)
          else current = applyNotebookSavePatch(current!, structuredClone(request.patch))
          const bytes = request.kind === 'encode' ? new TextEncoder().encode(JSON.stringify(current)).buffer : undefined
          worker.onmessage?.({ data: { id: request.id, ok: true, bytes } } as never)
        })
      },
    }
    const transport = createNotebookSaveTransport(() => worker)
    const a = note('a')
    await transport.prime('workspace:a', a)
    const changed = { ...a, title: 'Captured' }
    const savingA = transport.encode('workspace:a', changed)
    const primingB = transport.prime('workspace:b', note('b'))
    const savedA = JSON.parse(new TextDecoder().decode(await savingA))
    await primingB
    expect(savedA.id).toBe('a')
    expect(savedA.title).toBe('Captured')
    const retryA = JSON.parse(new TextDecoder().decode(await transport.encode('workspace:a', a)))
    expect(retryA).toEqual(a)
    expect(messages[1].kind).toBe('encode')
  })

  it('rejects a worker failure and can initialize a fresh worker on retry', async () => {
    let created = 0
    const transport = createNotebookSaveTransport(() => {
      created++
      const worker: NotebookSaveWorker = { onmessage: null, onerror: null, onmessageerror: null, terminate() {}, postMessage(request) {
        queueMicrotask(() => worker.onerror?.({ message: 'worker failed' } as ErrorEvent))
        void request
      } }
      return worker
    })
    await expect(transport.encode('a', note('a'))).rejects.toThrow('worker failed')
    await expect(transport.encode('a', note('a'))).rejects.toThrow('worker failed')
    expect(created).toBe(2)
  })
})
