import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '../stores/workspace'
import { useAiCompletion } from './useAiCompletion'

const complete = vi.fn()
const listModels = vi.fn()

vi.mock('../tauri/ai', () => ({
  aiCommands: {
    complete: (...a: unknown[]) => complete(...a),
    completeStream: vi.fn(),
    listModels: (...a: unknown[]) => listModels(...a),
  },
}))

function configure(apiKind: 'ollama' | 'openai') {
  const store = useWorkspaceStore()
  store.settings.ai = {
    ...store.settings.ai,
    enabled: true,
    apiKind,
    baseUrl: 'https://openrouter.ai/api/v1',
    streamingOutput: false,
  }
  return store
}

describe('useAiCompletion', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    complete.mockReset().mockResolvedValue('ok')
    listModels.mockReset().mockResolvedValue([])
  })

  it('never puts an API key in the request; Rust adds the endpoint-bound key', async () => {
    configure('openai')
    await useAiCompletion().generate({ prompt: 'hi', onToken: vi.fn() })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0]).not.toHaveProperty('apiKey')
  })

  it('passes privacy mode to the model listing so Rust can block remote endpoints', async () => {
    const store = configure('openai')
    store.settings.ai.privacyMode = true
    await useAiCompletion().testConnection()
    expect(listModels).toHaveBeenCalledWith('https://openrouter.ai/api/v1', 'openai', true)
  })
})
