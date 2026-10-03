/// <reference lib="webworker" />
import type { NoteDocument } from '../../../types/note'
import { applyNotebookSavePatch } from '../savePatch'
import type { NotebookSaveRequest, NotebookSaveResponse } from '../saveTransport'

let note: NoteDocument | null = null
self.onmessage = ({ data }: MessageEvent<NotebookSaveRequest>) => {
  let response: NotebookSaveResponse
  try {
    if (data.kind === 'prime') {
      note = data.note
      response = { id: data.id, ok: true }
    } else {
      if (!note) throw new Error('Notebook save worker has no base snapshot.')
      note = applyNotebookSavePatch(note, data.patch)
      const bytes = new TextEncoder().encode(JSON.stringify(note)).buffer
      response = { id: data.id, ok: true, bytes }
    }
  } catch (error) {
    response = { id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (response.ok && response.bytes) self.postMessage(response, [response.bytes])
  else self.postMessage(response)
}
