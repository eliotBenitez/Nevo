import { buildChatPrompt, type ChatSource } from '../../../core/ai-chat/prompt'
import { classifyAiError } from '../../../core/ai-chat/endpoint'
import { i18n } from '../../../i18n'
import { aiCommands } from '../../../tauri/ai'
import { useAiCompletion } from '../../../composables/useAiCompletion'
import { useAiChatStore, type AiChatMessage, type AiChatSelection } from '../../../stores/aiChat'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import { getActiveEditor } from '../editor/activeEditorRegistry'
import { noteContextText } from '../../../core/ai-chat/noteText'

type AssistantMessage = Extract<AiChatMessage, { role: 'assistant' }>

const NOTE_TEXT_LIMIT = 6000
const SEARCH_LIMIT = 8
// Mirrors MAX_HITS_PER_NOTE in src-tauri/src/commands/note/context_search.rs.
const MAX_HITS_PER_NOTE = 3

export function useAiChatSession() {
  const store = useAiChatStore()
  const tree = useTreeStore()
  const workspace = useWorkspaceStore()
  const completion = useAiCompletion()

  function captureEditor(): { source: ChatSource | null; selection?: AiChatSelection } {
    const active = getActiveEditor()
    if (!active) return { source: null }
    const { doc, selection } = active.view.state
    const noteTitle = tree.noteById.get(active.noteId)?.title ?? ''
    // "This note only" without the note itself would send the model nothing to work with.
    const source: ChatSource | null = store.scope === 'note' || store.includeCurrentNote
      ? {
        n: 1,
        noteId: active.noteId,
        noteTitle,
        blockIndex: null,
        text: noteContextText(noteTitle, doc.toJSON()).slice(0, NOTE_TEXT_LIMIT),
        current: true,
      }
      : null
    const text = selection.empty ? '' : doc.textBetween(selection.from, selection.to)
    return {
      source,
      selection: text ? { noteId: active.noteId, from: selection.from, to: selection.to, text } : undefined,
    }
  }

  async function collectSources(question: string, current: ChatSource | null): Promise<ChatSource[]> {
    const sources = current ? [current] : []
    const path = workspace.activePath
    if (store.scope !== 'workspace' || !path) return sources
    const currentId = getActiveEditor()?.noteId
    // The open note's hits are dropped below, so ask for enough to still fill the limit.
    const limit = currentId ? SEARCH_LIMIT + MAX_HITS_PER_NOTE : SEARCH_LIMIT
    const hits = await aiCommands.searchNoteContext(path, question, limit)
    for (const hit of hits) {
      if (sources.length - (current ? 1 : 0) >= SEARCH_LIMIT) break
      if (hit.noteId === currentId || !tree.noteById.has(hit.noteId)) continue
      sources.push({
        n: sources.length + 1,
        noteId: hit.noteId,
        noteTitle: tree.noteById.get(hit.noteId)?.title ?? hit.noteTitle,
        blockIndex: hit.blockIndex,
        text: hit.text,
      })
    }
    return sources
  }

  async function send(question: string): Promise<void> {
    const trimmed = question.trim()
    if (!trimmed || store.streaming) return

    const history = store.messages
      .filter(m => m.role === 'user' || m.status === 'done' || m.status === 'stopped')
      .map(m => ({ role: m.role, text: m.text }))
    const generation = store.generation
    store.messages.push({ id: store.nextMessageId(), role: 'user', text: trimmed })
    const assistant: AssistantMessage = {
      id: store.nextMessageId(),
      role: 'assistant',
      text: '',
      status: 'streaming',
      sources: [],
    }
    store.messages.push(assistant)
    // Mutate the reactive proxy, not the raw object that was pushed.
    const message = store.messages[store.messages.length - 1] as AssistantMessage
    store.streaming = true

    const live = () => store.generation === generation
    const fail = (error: string) => {
      if (!live()) return
      message.status = 'error'
      message.errorMessage = error
      message.errorKind = classifyAiError(error)
      store.streaming = false
    }

    try {
      const { source, selection } = captureEditor()
      message.selection = selection
      message.sources = await collectSources(trimmed, source)
      if (!live()) return
      const { system, prompt } = buildChatPrompt({
        question: trimmed,
        history,
        sources: message.sources,
        selection: selection?.text,
        locale: i18n.global.locale.value,
      })
      // shortcut: Stop only ignores further tokens; the backend stream runs to completion.
      // Upgrade with a cancel command if long generations become a problem.
      await completion.generate({
        system,
        prompt,
        onToken: (t) => {
          if (live()) message.text += t
        },
        onDone: () => {
          if (!live()) return
          message.status = 'done'
          store.streaming = false
          if (!store.open) store.unread = true
        },
        onError: fail,
      })
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
  }

  function stop(): void {
    if (!store.streaming) return
    store.generation += 1
    store.streaming = false
    for (const m of store.messages) {
      if (m.role === 'assistant' && m.status === 'streaming') m.status = 'stopped'
    }
  }

  function retry(messageId: string): Promise<void> {
    const index = store.messages.findIndex(m => m.id === messageId)
    if (index < 1 || store.streaming) return Promise.resolve()
    const question = store.messages[index - 1]
    if (question.role !== 'user') return Promise.resolve()
    store.messages.splice(index - 1)
    return send(question.text)
  }

  return { send, stop, retry }
}
