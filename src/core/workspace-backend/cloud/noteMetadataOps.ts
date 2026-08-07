// Per-note metadata that lives outside the note's own document.
//
// A cloud note's body is its own Yjs document, but its properties (type, tags,
// date, status) and cover are note-level fields the shell reads without opening
// the body — the sidebar, the trash, and `query_block` all need them. They ride
// in the manifest document, keyed per note so that editing one note's
// properties cannot clobber another's (the manifest, kanban and graph maps are
// each a single atomically-replaced value; that is too coarse here, because
// every note would share one).

import * as Y from 'yjs'
import type { NoteProperties } from '../../../types/note'
import { plainClone } from './manifest'
import { CLOUD_LOCAL_ORIGIN } from './session'

const NOTE_METADATA_MAP = 'note_metadata'

export interface CloudNoteMetadata {
  properties?: NoteProperties
  cover?: string
}

function metadataMap(ydoc: Y.Doc): Y.Map<CloudNoteMetadata> {
  return ydoc.getMap<CloudNoteMetadata>(NOTE_METADATA_MAP)
}

export function readNoteMetadata(ydoc: Y.Doc, noteId: string): CloudNoteMetadata {
  const stored = metadataMap(ydoc).get(noteId)
  return stored ? plainClone(stored) : {}
}

/** Every note's metadata at once, for the sidebar and cross-note queries. */
export function readAllNoteMetadata(ydoc: Y.Doc): Record<string, CloudNoteMetadata> {
  const out: Record<string, CloudNoteMetadata> = {}
  for (const [noteId, value] of metadataMap(ydoc).entries()) {
    out[noteId] = plainClone(value)
  }
  return out
}

export function writeNoteMetadata(ydoc: Y.Doc, noteId: string, metadata: CloudNoteMetadata): void {
  ydoc.transact(() => {
    metadataMap(ydoc).set(noteId, plainClone(metadata))
  }, CLOUD_LOCAL_ORIGIN)
}

export function deleteNoteMetadata(ydoc: Y.Doc, noteId: string): void {
  ydoc.transact(() => {
    metadataMap(ydoc).delete(noteId)
  }, CLOUD_LOCAL_ORIGIN)
}
