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
  listModels: (baseUrl: string, providerKind: string): Promise<string[]> =>
    invoke('ai_list_models', { baseUrl, providerKind }),

  complete: (req: AiCompleteRequest): Promise<string> =>
    invoke('ai_complete', { req }),

  completeStream: (req: AiCompleteRequest, onEvent: (e: AiStreamEvent) => void): Promise<void> => {
    const ch = new Channel<AiStreamEvent>()
    ch.onmessage = onEvent
    return invoke('ai_complete_stream', { req, onEvent: ch })
  },
}
