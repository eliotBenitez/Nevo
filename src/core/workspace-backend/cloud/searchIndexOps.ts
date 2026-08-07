// Client-side full-text index for cloud workspaces.
//
// A local workspace is searched by Rust reading the note files. The relay
// cannot do the equivalent: note bodies are end-to-end encrypted, so it holds
// nothing it could index. The client therefore keeps the searchable text
// itself, in the manifest document, written whenever a note is saved.
//
// Entries are the flattened per-block text of a note, keyed by note id — one
// key per note so saving one note never rewrites another's entry, and so the
// array index doubles as the block index search results point at.

import * as Y from 'yjs'
import { plainClone } from './manifest'
import { CLOUD_LOCAL_ORIGIN } from './session'

const SEARCH_INDEX_MAP = 'note_search_index'

function indexMap(ydoc: Y.Doc): Y.Map<string[]> {
  return ydoc.getMap<string[]>(SEARCH_INDEX_MAP)
}

/**
 * Block texts for every indexed note, **read-only**.
 *
 * Deliberately not cloned: search runs on every keystroke and the index holds
 * the text of the whole workspace, so a defensive deep copy here costs
 * milliseconds of main-thread time per character typed (measurably ~12× the
 * cost of the read itself). Callers must not mutate what they get back — the
 * arrays are the ones held inside the document.
 */
export function readSearchIndex(ydoc: Y.Doc): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {}
  for (const [noteId, blocks] of indexMap(ydoc).entries()) {
    if (Array.isArray(blocks)) out[noteId] = blocks
  }
  return out
}

/** Replaces one note's indexed text. An empty note drops out of the index. */
export function writeSearchIndex(ydoc: Y.Doc, noteId: string, blocks: string[]): void {
  ydoc.transact(() => {
    if (blocks.length === 0) indexMap(ydoc).delete(noteId)
    else indexMap(ydoc).set(noteId, plainClone(blocks))
  }, CLOUD_LOCAL_ORIGIN)
}

export function deleteSearchIndex(ydoc: Y.Doc, noteId: string): void {
  ydoc.transact(() => {
    indexMap(ydoc).delete(noteId)
  }, CLOUD_LOCAL_ORIGIN)
}
