import { EditorState, type Transaction } from 'prosemirror-state'
import { parseNoteContentToDocSafe, serializeDocToNoteContent } from '../../../editor-core'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { createEditorSnapshot } from '../../../editor-core/plugin-host/sandboxTransactions'
import { decodeNoteFormat } from '../../../core/notebook'
import type { WorkspaceBackend } from '../../../core/workspace-backend'
import type { NoteDocument } from '../../../types/note'
import { useNoteStore } from '../../../stores/note'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import { getActiveEditor } from './activeEditorRegistry'
import {
  assertEditorFormatSupportsEdit,
  buildEditTransaction,
  buildMarkdownTransaction,
  EditorUnavailableError,
  type ApplyEditRequest,
  type ApplyEditResult,
  type EditorSnapshotResult,
  type WriteMarkdownRequest,
} from './mcpEditorOperations'

/**
 * MCP edits to a note that is not open in the editor. With no live
 * `EditorView` owning the document, `note.json` is the only copy, so the edit
 * is applied to a headless ProseMirror state built from it and saved back —
 * the same parse/serialize pair the editor uses, and the same validated
 * transactions as an edit to the open note.
 */

/** True when MCP content calls for `noteId` belong to the live editor rather than to `note.json`. */
export function isOpenInEditor(noteId: string | null | undefined): boolean {
  return !noteId || getActiveEditor()?.noteId === noteId
}

/**
 * Stands in for the editor's revision counter on a closed note: a 32-bit
 * FNV-1a hash of the persisted body, so it changes exactly when the body does.
 */
export function persistedRevision(content: unknown): number {
  const text = JSON.stringify(content ?? null)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

interface ClosedNote {
  backend: WorkspaceBackend
  note: NoteDocument
  state: EditorState
  revision: number
}

async function loadClosedNote(noteId: string): Promise<ClosedNote> {
  const noteStore = useNoteStore()
  if (noteStore.activeNote?.id === noteId) {
    assertEditorFormatSupportsEdit(noteStore.getActiveNoteFormat(noteId))
    throw new EditorUnavailableError(`Note ${noteId} is still opening in the editor. Try again in a moment.`)
  }
  const backend = useWorkspaceStore().backend
  if (!backend) throw new EditorUnavailableError('No workspace is open in Nevo.')

  // Straight from disk, not the note cache: the cache may predate the last save.
  const note = await backend.loadNoteWithContent(noteId)
  assertEditorFormatSupportsEdit(decodeNoteFormat(note))
  // Plugin node types are only known once an editor has mounted with them.
  const schema = getActiveEditor()?.view.state.schema ?? nevoBaseSchema
  const { doc, degraded } = parseNoteContentToDocSafe(schema, note.content)
  if (degraded) {
    // Saving the plain-text fallback would destroy the original content.
    throw new EditorUnavailableError(
      `Note ${noteId} contains content that cannot be edited while it is closed. Open it with nevo_open_note and edit it there.`,
    )
  }
  return { backend, note, state: EditorState.create({ schema, doc }), revision: persistedRevision(note.content) }
}

async function commit(closed: ClosedNote, tr: Transaction): Promise<ApplyEditResult> {
  const noteStore = useNoteStore()
  const workspaceStore = useWorkspaceStore()
  const noteId = closed.note.id
  if (noteStore.activeNote?.id === noteId || workspaceStore.backend !== closed.backend) {
    throw new EditorUnavailableError(`Note ${noteId} was opened while the edit was prepared. Read a fresh snapshot and retry.`)
  }

  const content = serializeDocToNoteContent(closed.state.apply(tr).doc)
  const note: NoteDocument = { ...closed.note, content, updatedAt: new Date().toISOString() }
  await closed.backend.saveNote(note)

  noteStore.invalidateNoteCache(noteId)
  useTreeStore().syncNoteMeta(noteId, { title: note.title, icon: note.icon }, note.updatedAt)
  void workspaceStore.refreshSidebarNotePreviews()
  // Opened while the write was in flight, the editor may hold the old body;
  // reload it unless the user has already typed into it.
  if (noteStore.activeNote?.id === noteId && !noteStore.isDirty) {
    await noteStore.loadNote(noteId, { force: true })
  }
  return { applied: true, noteId, revision: persistedRevision(content) }
}

export async function readClosedNoteSnapshot(noteId: string): Promise<EditorSnapshotResult> {
  const { state, revision } = await loadClosedNote(noteId)
  const snapshot = createEditorSnapshot(state, revision, true)
  return {
    noteId,
    revision,
    doc: snapshot.doc,
    selection: { from: snapshot.selection.from, to: snapshot.selection.to },
  }
}

export async function applyClosedNoteEdit(request: ApplyEditRequest): Promise<ApplyEditResult> {
  const closed = await loadClosedNote(request.noteId)
  return commit(closed, buildEditTransaction(closed.state, request, closed.revision))
}

export async function writeClosedNoteMarkdown(request: WriteMarkdownRequest): Promise<ApplyEditResult> {
  const closed = await loadClosedNote(request.noteId)
  return commit(closed, buildMarkdownTransaction(closed.state, request, closed.revision))
}
