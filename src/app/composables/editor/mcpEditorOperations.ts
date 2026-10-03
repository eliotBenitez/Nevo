import {
  applyTransactionIntent,
  createEditorSnapshot,
  validateTransactionIntent,
} from '../../../editor-core/plugin-host/sandboxTransactions'
import { getActiveEditor } from './activeEditorRegistry'
import type { NoteFormatResult } from '../../../core/notebook/types'

/**
 * Editor operations the MCP bridge asks the webview to perform. Kept free of
 * Vue so the rules — which note is addressable, what a stale revision means —
 * can be tested without mounting anything.
 *
 * These reuse the plugin sandbox's transaction helpers rather than touching
 * ProseMirror directly, so an agent's edit is validated by exactly the same
 * rules as a plugin's.
 */

export interface EditorSnapshotResult {
  noteId: string
  revision: number
  doc: Record<string, unknown> | undefined
  selection: { from: number, to: number }
}

export interface ApplyEditRequest {
  noteId: string
  revision: number
  operations: unknown[]
}

export interface ApplyEditResult {
  applied: true
  noteId: string
  revision: number
}

export class EditorUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditorUnavailableError'
  }
}

export function assertEditorFormatSupportsEdit(format: NoteFormatResult | null): void {
  if (format && format.status !== 'document') {
    throw new EditorUnavailableError('MCP editor.applyEdit is not supported for this note format.')
  }
}

function requireActiveEditor(expectedNoteId?: string | null) {
  const active = getActiveEditor()
  if (!active) {
    throw new EditorUnavailableError(
      'No note is open in Nevo. Open the note you want to edit and try again.',
    )
  }
  if (expectedNoteId && expectedNoteId !== active.noteId) {
    // Editing a note that is not on screen would mean writing the file behind
    // the editor's back, which the editor then overwrites on its next autosave.
    throw new EditorUnavailableError(
      `Note ${expectedNoteId} is not the note currently open (${active.noteId}). Only the open note can be edited.`,
    )
  }
  return active
}

export function readEditorSnapshot(noteId?: string | null): EditorSnapshotResult {
  const active = requireActiveEditor(noteId)
  const snapshot = createEditorSnapshot(active.view.state, active.revision, true)
  return {
    noteId: active.noteId,
    revision: active.revision,
    doc: snapshot.doc,
    selection: { from: snapshot.selection.from, to: snapshot.selection.to },
  }
}

/**
 * Plugin intents default omitted positions to the user's current selection.
 * That is correct for a plugin operating in response to an editor gesture, but
 * it makes a position-free MCP insertion land wherever the user left the
 * caret, usually at the beginning of a freshly opened note. For agents, an
 * omitted insertion position deliberately means append to the document end.
 *
 * `document.end` is resolved while the transaction is applied rather than
 * converted to a numeric position here. That keeps multiple implicit
 * insertions ordered after one another as the document grows.
 */
function normalizeMcpInsertionPositions(operations: unknown[]): unknown[] {
  return operations.map(operation => {
    if (!operation || typeof operation !== 'object') return operation
    const record = operation as Record<string, unknown>
    if (record.type === 'insertText') {
      if (record.from === undefined && record.to === undefined) {
        return { ...record, from: 'document.end', to: 'document.end' }
      }
      if (record.from !== undefined && record.to === undefined) {
        return { ...record, to: record.from }
      }
    }
    if (record.type === 'insertNode' && record.at === undefined) {
      return { ...record, at: 'document.end' }
    }
    return operation
  })
}

export function applyEditorEdit(request: ApplyEditRequest): ApplyEditResult {
  const active = requireActiveEditor(request.noteId)

  let intent
  try {
    intent = validateTransactionIntent(
      {
        type: 'transaction',
        revision: request.revision,
        operations: normalizeMcpInsertionPositions(request.operations),
      },
      active.revision,
    )
  } catch (error) {
    // Rethrow the original error with a message the agent can act on: the
    // sandbox wording ("stale editor state") does not say what to do next.
    if (error instanceof Error && error.name === 'STALE_EDITOR_STATE') {
      error.message = `The note changed since revision ${request.revision} (now ${active.revision}). Read a fresh snapshot and retry.`
    }
    throw error
  }

  active.view.dispatch(applyTransactionIntent(active.view.state, intent))

  const after = getActiveEditor()
  return {
    applied: true,
    noteId: active.noteId,
    revision: after?.revision ?? active.revision,
  }
}
