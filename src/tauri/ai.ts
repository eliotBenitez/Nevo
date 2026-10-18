import { invoke, Channel } from '@tauri-apps/api/core'

export interface AiCompleteRequest {
  baseUrl: string
  model: string
  prompt: string
  system?: string
  maxTokens: number
  privacyMode: boolean
  providerKind: 'ollama' | 'openai'
  apiKey?: string
}

export type AiStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export const aiCommands = {
  listModels: (baseUrl: string, providerKind: string, apiKey?: string, privacyMode = false): Promise<string[]> =>
    invoke('ai_list_models', { baseUrl, providerKind, apiKey, privacyMode }),

  complete: (req: AiCompleteRequest): Promise<string> =>
    invoke('ai_complete', { req }),

  searchNoteContext: (workspacePath: string, query: string, limit?: number): Promise<NoteContextHit[]> =>
    invoke('search_note_context', { workspacePath, query, limit }),

  completeStream: (req: AiCompleteRequest, onEvent: (e: AiStreamEvent) => void): Promise<void> => {
    const ch = new Channel<AiStreamEvent>()
    ch.onmessage = onEvent
    return invoke('ai_complete_stream', { req, onEvent: ch })
  },
}

export interface NoteContextHit {
  noteId: string
  noteTitle: string
  folderId: string | null
  blockIndex: number
  text: string
  score: number
}
