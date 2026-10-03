import { describe, expect, it } from 'vitest'
import { createNotebook } from '../core/notebook'
import type { NoteDocument } from '../types/note'
import { useNoteExport } from './useNoteExport'
import { UnsupportedDocumentExportError } from '../core/notebook/documentExport'

function notebookNote(): NoteDocument {
  return {
    id: 'notebook-export',
    title: 'Notebook export',
    icon: '📓',
    folderId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    documentKind: 'notebook',
    notebook: createNotebook(),
  }
}

describe('useNoteExport notebook boundary', () => {
  it('rejects every ProseMirror text export entry point for notebooks', async () => {
    const exporter = useNoteExport()
    const note = notebookNote()
    const unsupported = expect.objectContaining({ name: 'UnsupportedDocumentExportError' })

    await expect(exporter.exportAsMarkdown(note, '/workspace')).rejects.toEqual(unsupported)
    await expect(exporter.exportAsHtml(note, '/workspace')).rejects.toEqual(unsupported)
    await expect(exporter.exportAsDocx(note, '/workspace')).rejects.toEqual(unsupported)
    await expect(exporter.exportAsTypst(note, '/workspace')).rejects.toEqual(unsupported)
    await expect(exporter.exportAsPdf(note, '/workspace')).rejects.toEqual(unsupported)
    await expect(exporter.saveDocxWithOptions(note, '/workspace', {} as never)).rejects.toBeInstanceOf(UnsupportedDocumentExportError)
  })
})
