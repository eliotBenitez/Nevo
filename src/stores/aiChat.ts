import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ChatSource } from '../core/ai-chat/prompt'
import type { AiErrorKind } from '../core/ai-chat/endpoint'
import { useWorkspaceStore } from './workspace'

export interface AiChatSelection {
  noteId: string
  from: number
  to: number
  text: string
}

export type AiChatMessage =
  | { id: string; role: 'user'; text: string }
  | {
    id: string
    role: 'assistant'
    text: string
    status: 'streaming' | 'done' | 'stopped' | 'error'
    errorKind?: AiErrorKind
    errorMessage?: string
    sources: ChatSource[]
    selection?: AiChatSelection
  }

export const useAiChatStore = defineStore('aiChat', () => {
  const workspaceStore = useWorkspaceStore()

  const open = ref(false)
  const docked = ref(false)
  const scope = ref<'workspace' | 'note'>('workspace')
  const includeCurrentNote = ref(true)
  const messages = ref<AiChatMessage[]>([])
  const streaming = ref(false)
  const unread = ref(false)
  /** Bumped by newChat/reset/stop; a stream only appends tokens while its captured value still matches. */
  const generation = ref(0)
  let idCounter = 0

  function nextMessageId(): string {
    idCounter += 1
    return `ai-msg-${idCounter}`
  }

  function setOpen(value: boolean) {
    open.value = value
    if (value) unread.value = false
  }

  function toggle() {
    setOpen(!open.value)
  }

  function setDocked(value: boolean) {
    docked.value = value
  }

  function newChat() {
    generation.value += 1
    messages.value = []
    streaming.value = false
    unread.value = false
  }

  function reset() {
    newChat()
    open.value = false
  }

  // History is per workspace: a different workspace must not see another's notes in the transcript.
  watch(() => workspaceStore.activePath, reset)

  return {
    open,
    docked,
    scope,
    includeCurrentNote,
    messages,
    streaming,
    unread,
    generation,
    nextMessageId,
    setOpen,
    toggle,
    setDocked,
    newChat,
    reset,
  }
})
