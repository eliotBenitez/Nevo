import { toRaw } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { NoteDocument } from '../types/note'
import { createNotebookSaveTransport, type NotebookSaveWorker } from '../core/notebook/saveTransport'
import { appLogger } from '../utils/logger'

const transport = createNotebookSaveTransport(() => new Worker(new URL('../core/notebook/workers/notebookSave.worker.ts', import.meta.url), { type: 'module' }) as unknown as NotebookSaveWorker)

function rawNote(note: NoteDocument): NoteDocument {
  return Object.fromEntries(Object.entries(note).map(([key, value]) => [key, toRaw(value)])) as unknown as NoteDocument
}

export function primeNotebookSave(workspacePath: string, note: NoteDocument): void {
  if (typeof Worker === 'undefined' || note.documentKind !== 'notebook') return
  void transport.prime(`${workspacePath}:${note.id}`, rawNote(note)).catch(error => {
    void appLogger.error({ source: 'frontend.note', event: 'prime_notebook_save', message: 'Notebook save worker initialization failed', error })
  })
}

export async function saveNotebookNote(workspacePath: string, note: NoteDocument): Promise<void> {
  try {
    const bytes = await transport.encode(`${workspacePath}:${note.id}`, rawNote(note))
    await invoke<void>('save_notebook_note', bytes, { headers: { 'nv-workspace-path': encodeURIComponent(workspacePath) } })
  } catch (error) {
    await appLogger.error({ source: 'frontend.note', event: 'save_notebook_note', message: 'Notebook save failed', error })
    throw error
  }
}
