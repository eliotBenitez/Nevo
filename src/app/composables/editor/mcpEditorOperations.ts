import {
  applyTransactionIntent,
  createEditorSnapshot,
  validateTransactionIntent,
} from '../../../editor-core/plugin-host/sandboxTransactions'
import { getActiveEditor } from './activeEditorRegistry'
import { parseMarkdownToSlice } from './markdownPaste'
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

export interface WriteMarkdownRequest {
  noteId: string
  markdown: string
  mode: 'append' | 'replace'
  /** Required for `replace`: replacing a document the agent has not seen would discard the user's typing. */
  revision?: number
}

export function writeEditorMarkdown(request: WriteMarkdownRequest): ApplyEditResult {
  const active = requireActiveEditor(request.noteId)
  if (request.mode === 'replace' && request.revision !== active.revision) {
    throw new Error(
      `The note changed since revision ${request.revision ?? 'unknown'} (now ${active.revision}). Read a fresh snapshot and retry.`,
    )
  }

  const { state } = active.view
  const slice = parseMarkdownToSlice(request.markdown, state.schema)
  if (!slice) throw new Error('The Markdown produced no content.')

  const doc = state.doc
  // A fresh note is a single empty paragraph; appending after it would leave a blank first line.
  const isBlank = doc.childCount === 1 && doc.firstChild!.isTextblock && doc.firstChild!.content.size === 0
  const from = request.mode === 'replace' || isBlank ? 0 : doc.content.size
  active.view.dispatch(state.tr.replaceWith(from, doc.content.size, slice.content).scrollIntoView())

  return {
    applied: true,
    noteId: active.noteId,
    revision: getActiveEditor()?.revision ?? active.revision,
  }
}

const OPEN_POLL_MS = 50

/**
 * Resolves once the editor for `noteId` has mounted. Opening a note is a route
 * change followed by an async load, so there is no single event to await.
 */
export async function waitForActiveEditor(noteId: string, timeoutMs = 10_000): Promise<EditorSnapshotResult> {
  const deadline = Date.now() + timeoutMs
  while (getActiveEditor()?.noteId !== noteId) {
    if (Date.now() >= deadline) {
      throw new EditorUnavailableError(`Note ${noteId} did not open in the editor in time.`)
    }
    await new Promise(resolve => setTimeout(resolve, OPEN_POLL_MS))
  }
  return readEditorSnapshot(noteId)
}
