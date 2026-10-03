import type { NoteDocument } from '../../types/note'
import { decodeNoteFormat } from './codec'

export class UnsupportedDocumentExportError extends Error {
  constructor() {
    super('This note format cannot be exported as a text document')
    this.name = 'UnsupportedDocumentExportError'
  }
}

/** Text serializers only understand the ProseMirror document representation. */
export function assertDocumentExportSupported(note: NoteDocument): void {
  if (decodeNoteFormat(note).status !== 'document') throw new UnsupportedDocumentExportError()
}
