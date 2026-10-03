import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../core/notebook/codec'
import { applyNotebookSavePatch } from '../core/notebook/savePatch'
import type { NotebookSaveRequest, NotebookSaveResponse } from '../core/notebook/saveTransport'
import type { NoteDocument } from '../types/note'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))
import { primeNotebookSave, saveNotebookNote } from './notebookSave'

class SaveWorker {
  onmessage: ((event: MessageEvent<NotebookSaveResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  note: NoteDocument | null = null
  postMessage(message: NotebookSaveRequest) {
    const request = structuredClone(message)
    queueMicrotask(() => {
      if (request.kind === 'prime') this.note = request.note
      else this.note = applyNotebookSavePatch(this.note!, request.patch)
      const bytes = request.kind === 'encode' ? new TextEncoder().encode(JSON.stringify(this.note)).buffer : undefined
      this.onmessage?.({ data: { id: request.id, ok: true, bytes } } as never)
    })
  }
  terminate() {}
}

describe('notebook binary save wrapper', () => {
  beforeEach(() => { invoke.mockReset(); vi.stubGlobal('Worker', SaveWorker) })
  afterEach(() => vi.unstubAllGlobals())

  it('encodes Vue metadata without proxies and sends lossless bytes with an encoded workspace header', async () => {
    const original: NoteDocument = { id: 'raw-note', title: 'Original', icon: '📓', folderId: null,
      createdAt: '', updatedAt: '', properties: { type: null, tags: ['keep'], date: null, status: null }, content: { type: 'doc' },
      documentKind: 'notebook', notebook: createNotebook(), future: { keep: true } }
    primeNotebookSave('C:/русский путь', original)
    const note = reactive(original)
    note.title = 'Changed'
    await saveNotebookNote('C:/русский путь', note)
    const [command, body, options] = invoke.mock.calls[0]
    expect(command).toBe('save_notebook_note')
    expect(Object.prototype.toString.call(body)).toBe('[object ArrayBuffer]')
    expect(options).toEqual({ headers: { 'nv-workspace-path': 'C%3A%2F%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9%20%D0%BF%D1%83%D1%82%D1%8C' } })
    const saved = JSON.parse(new TextDecoder().decode(body))
    expect(saved.title).toBe('Changed')
    expect(saved.properties.tags).toEqual(['keep'])
    expect(saved.future).toEqual({ keep: true })
    expect(saved.notebook).toEqual(original.notebook)
  })
})
