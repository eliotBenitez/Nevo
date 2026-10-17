import { stripCitations } from '../../../core/ai-chat/citations'
import type { ChatSource } from '../../../core/ai-chat/prompt'
import type { AiChatSelection } from '../../../stores/aiChat'
import { useNoteStore } from '../../../stores/note'
import { useTreeStore } from '../../../stores/tree'
import { getActiveEditor } from '../editor/activeEditorRegistry'
import {
  assertEditorFormatSupportsEdit,
  EditorUnavailableError,
  waitForActiveEditor,
  writeEditorMarkdown,
} from '../editor/mcpEditorOperations'
import { insertAnswer, replaceSelection } from './aiChatEditorActions'

export interface AiChatActionsOptions {
  openNote(noteId: string): void
  openSource(source: ChatSource): void
}

const TITLE_LIMIT = 60

export function titleFromQuestion(question: string, fallback = 'Untitled'): string {
  const line = question.split(/\r?\n/).find(l => l.trim())?.trim() ?? ''
  return line.slice(0, TITLE_LIMIT) || fallback
}

export function useAiChatActions(options: AiChatActionsOptions) {
  const noteStore = useNoteStore()
  const treeStore = useTreeStore()

  function requireEditor() {
    const active = getActiveEditor()
    if (!active) throw new EditorUnavailableError('No note is open in the editor.')
    assertEditorFormatSupportsEdit(noteStore.getActiveNoteFormat(active.noteId))
    return active
  }

  function insert(markdown: string): void {
    insertAnswer(requireEditor().view, stripCitations(markdown))
  }

  function replace(capture: AiChatSelection, markdown: string): void {
    const active = requireEditor()
    if (active.noteId !== capture.noteId) {
      throw new EditorUnavailableError('The note with the selection is no longer open.')
    }
    replaceSelection(active.view, capture, stripCitations(markdown))
  }

  async function copy(markdown: string): Promise<void> {
    await navigator.clipboard.writeText(stripCitations(markdown))
  }

  async function createNote(question: string, markdown: string, fallbackTitle?: string): Promise<string> {
    const folderId = noteStore.activeNote ? treeStore.noteById.get(noteStore.activeNote.id)?.folderId ?? null : null
    const note = await treeStore.createNote(folderId, titleFromQuestion(question, fallbackTitle))
    if (!note) throw new Error('The note could not be created.')
    options.openNote(note.id)
    await waitForActiveEditor(note.id)
    assertEditorFormatSupportsEdit(noteStore.getActiveNoteFormat(note.id))
    writeEditorMarkdown({ noteId: note.id, markdown: stripCitations(markdown), mode: 'append' })
    return note.id
  }

  function openSource(source: ChatSource): void {
    options.openSource(source)
  }

  return { insert, replace, copy, createNote, openSource }
}
