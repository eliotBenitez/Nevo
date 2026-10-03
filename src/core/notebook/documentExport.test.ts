import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '../../types/note'
import { assertDocumentExportSupported, UnsupportedDocumentExportError } from './documentExport'
import { createNotebook } from './codec'

function note(documentKind?: 'document' | 'notebook'): NoteDocument {
  return {
    id: 'export-note',
    title: 'Export note',
    icon: '📄',
    folderId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    ...(documentKind ? { documentKind } : {}),
    ...(documentKind === 'notebook' ? { notebook: createNotebook() } : {}),
  }
}

describe('assertDocumentExportSupported', () => {
  it('allows only supported ProseMirror documents through text export', () => {
    expect(() => assertDocumentExportSupported(note())).not.toThrow()
    expect(() => assertDocumentExportSupported(note('notebook'))).toThrow(UnsupportedDocumentExportError)
  })

  it('blocks future and malformed notebook formats instead of exporting an empty document', () => {
    const future = note('notebook')
    future.notebook = { version: 2, pages: [] } as never
    expect(() => assertDocumentExportSupported(future)).toThrow(UnsupportedDocumentExportError)
  })
})
