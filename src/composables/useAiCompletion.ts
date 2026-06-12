import { useWorkspaceStore } from '../stores/workspace'
import { aiCommands } from '../tauri/ai'

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

  async function testConnection(): Promise<string[]> {
    return aiCommands.listModels(workspaceStore.settings.ai.baseUrl, workspaceStore.settings.ai.apiKind)
  }

  async function generate(opts: AiGenerateOptions): Promise<void> {
    const settings = workspaceStore.settings.ai
    if (!settings.enabled) {
      opts.onError?.('AI is disabled. Enable it in Settings → AI.')
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
