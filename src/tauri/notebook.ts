import { invoke } from '@tauri-apps/api/core'
import type { NoteDocument } from '../types/note'
import type { NotebookExportV1, NotebookPaperKind } from '../core/notebook/types'
import { appLogger } from '../utils/logger'

export interface CreateNotebookArgs {
  workspacePath: string
  folderId?: string | null
  title: string
  icon: string
  paper: NotebookPaperKind
}

export interface ExportNotebookPdfArgs {
  workspacePath: string
  noteId: string
  fileName: string
  pages: NotebookExportV1['pages']
}

export type ExportNotebookPdfResult = { status: 'exported' | 'cancelled' }
export type ExportNotebookSourceResult = { status: 'exported' | 'cancelled' }

async function invokeNotebook<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({
      source: 'frontend.invoke',
      event: command,
      message: 'Tauri command failed',
      workspacePath: args.workspacePath as string,
      error,
    })
    throw error
  }
}

export function createNotebook(args: CreateNotebookArgs): Promise<NoteDocument> {
  return invokeNotebook<NoteDocument>('create_notebook', { ...args })
}

export function exportNotebookPdf(args: ExportNotebookPdfArgs): Promise<ExportNotebookPdfResult> {
  return invokeNotebook<ExportNotebookPdfResult>('export_notebook_pdf', { ...args })
}

export function exportNotebookSource(args: { workspacePath: string; noteId: string }): Promise<ExportNotebookSourceResult> {
  return invokeNotebook<ExportNotebookSourceResult>('export_note_source', { ...args })
}
