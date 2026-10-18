import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '../stores/workspace'
import { useAiCompletion } from './useAiCompletion'

const complete = vi.fn()
const listModels = vi.fn()
const secretGet = vi.fn()

vi.mock('../tauri/ai', () => ({
  aiCommands: {
    complete: (...a: unknown[]) => complete(...a),
    completeStream: vi.fn(),
    listModels: (...a: unknown[]) => listModels(...a),
  },
}))
vi.mock('../tauri/secureStore', () => ({
  SECRET_AI_API_KEY: 'nevo:ai.apiKey',
  secureStore: { get: (...a: unknown[]) => secretGet(...a), set: vi.fn() },
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

describe('useAiCompletion API key', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    complete.mockReset().mockResolvedValue('ok')
    listModels.mockReset().mockResolvedValue([])
    secretGet.mockReset().mockImplementation(async (key: string) =>
      key === 'nevo:ai.apiKey' ? 'sk-test' : 'https://openrouter.ai')
  })

  it('reads the key from the secure store and sends it to OpenAI-compatible endpoints', async () => {
    const store = configure('openai')
    await useAiCompletion().generate({ prompt: 'hi', onToken: vi.fn() })
    expect(secretGet).toHaveBeenCalledWith('nevo:ai.apiKey')
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-test' }))
    expect(JSON.stringify(store.settings)).not.toContain('sk-test')
  })

  it('passes the key to the model listing', async () => {
    configure('openai')
    await useAiCompletion().testConnection()
    expect(listModels).toHaveBeenCalledWith('https://openrouter.ai/api/v1', 'openai', 'sk-test', expect.any(Boolean))
  })

  it('passes privacy mode to the model listing so Rust can block remote endpoints', async () => {
    const store = configure('openai')
    store.settings.ai.privacyMode = true
    await useAiCompletion().testConnection()
    expect(listModels).toHaveBeenCalledWith('https://openrouter.ai/api/v1', 'openai', 'sk-test', true)
  })

  it('does not send a key saved for another endpoint', async () => {
    const store = configure('openai')
    store.settings.ai.baseUrl = 'https://other.example/v1'
    await useAiCompletion().generate({ prompt: 'hi', onToken: vi.fn() })
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }))
  })

  it('does not read or send a key for Ollama', async () => {
    configure('ollama')
    await useAiCompletion().generate({ prompt: 'hi', onToken: vi.fn() })
    expect(secretGet).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }))
  })

  it('reports a keychain failure instead of sending an unauthenticated request', async () => {
    configure('openai')
    secretGet.mockRejectedValue(new Error('keychain locked'))
    const onError = vi.fn()
    await useAiCompletion().generate({ prompt: 'hi', onToken: vi.fn(), onError })
    expect(onError).toHaveBeenCalledWith('keychain locked')
    expect(complete).not.toHaveBeenCalled()
  })
})
