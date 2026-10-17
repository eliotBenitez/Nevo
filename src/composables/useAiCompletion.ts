import { useWorkspaceStore } from '../stores/workspace'
import { aiCommands } from '../tauri/ai'
import { secureStore, SECRET_AI_API_KEY } from '../tauri/secureStore'

export interface AiGenerateOptions {
  system?: string
  prompt: string
  onToken: (t: string) => void
  onDone?: () => void
  onError?: (msg: string) => void
}

export function useAiCompletion() {
  const workspaceStore = useWorkspaceStore()

  function isEnabled(): boolean {
    return workspaceStore.settings.ai.enabled
  }

  // Read per request so the key never sits in a store or settings snapshot.
  async function readApiKey(): Promise<string | undefined> {
    if (workspaceStore.settings.ai.apiKind !== 'openai') return undefined
    return (await secureStore.get(SECRET_AI_API_KEY)) ?? undefined
  }

  async function testConnection(): Promise<string[]> {
    const { baseUrl, apiKind } = workspaceStore.settings.ai
    return aiCommands.listModels(baseUrl, apiKind, await readApiKey())
  }

  async function generate(opts: AiGenerateOptions): Promise<void> {
    const settings = workspaceStore.settings.ai
    if (!settings.enabled) {
      opts.onError?.('AI is disabled. Enable it in Settings → AI.')
      return
    }

    let apiKey: string | undefined
    try {
      apiKey = await readApiKey()
    } catch (err) {
      opts.onError?.(err instanceof Error ? err.message : String(err))
      return
    }

    const req = {
      baseUrl: settings.baseUrl,
      model: settings.defaultModel,
      prompt: opts.prompt,
      system: opts.system,
      maxTokens: settings.maxTokensPerRequest,
      privacyMode: settings.privacyMode,
      providerKind: settings.apiKind,
      apiKey,
    }

    if (settings.streamingOutput) {
      try {
        await aiCommands.completeStream(req, (e) => {
          if (e.type === 'token') {
            opts.onToken(e.text)
          } else if (e.type === 'done') {
            opts.onDone?.()
          } else if (e.type === 'error') {
            opts.onError?.(e.message)
          }
        })
      } catch (err) {
        opts.onError?.(err instanceof Error ? err.message : String(err))
      }
    } else {
      try {
        const text = await aiCommands.complete(req)
        opts.onToken(text)
        opts.onDone?.()
      } catch (err) {
        opts.onError?.(err instanceof Error ? err.message : String(err))
      }
    }
  }

  return {
    isEnabled,
    testConnection,
    generate,
  }
}
