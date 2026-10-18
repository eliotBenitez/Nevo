import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '../stores/workspace'
import type { WorkspaceSettings } from '../types/workspace'
import { useAiModels } from './useAiModels'

const listModels = vi.fn()

vi.mock('../tauri/ai', () => ({ aiCommands: { listModels: (...a: unknown[]) => listModels(...a) } }))
vi.mock('../tauri/secureStore', () => ({
  SECRET_AI_API_KEY: 'nevo:ai.apiKey',
  secureStore: { get: vi.fn().mockResolvedValue(null) },
}))

function setup(ai: Partial<WorkspaceSettings['ai']>) {
  const store = useWorkspaceStore()
  store.settings = { ...store.settings, ai: { ...store.settings.ai, enabled: true, ...ai } }
  store.updateSettings = vi.fn(async (mutator: (d: WorkspaceSettings) => void) => {
    const draft = structuredClone(store.settings)
    mutator(draft)
    store.settings = draft
  })
  return store
}

describe('useAiModels', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAiModels().reset()
    listModels.mockReset().mockResolvedValue(['qwen3:8b', 'llama3'])
  })

  it('caches the list per endpoint and refetches when forced or the endpoint changes', async () => {
    const store = setup({ apiKind: 'ollama', baseUrl: 'http://localhost:11434' })
    const models = useAiModels()
    await models.load()
    await models.load()
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(models.models.value).toEqual(['qwen3:8b', 'llama3'])

    await models.load(true)
    expect(listModels).toHaveBeenCalledTimes(2)

    store.settings = { ...store.settings, ai: { ...store.settings.ai, baseUrl: 'http://localhost:11435' } }
    await models.load()
    expect(listModels).toHaveBeenCalledTimes(3)
  })

  it('drops a response for an endpoint that changed mid-request', async () => {
    const store = setup({ apiKind: 'ollama', baseUrl: 'http://localhost:11434' })
    let resolve!: (v: string[]) => void
    listModels.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const models = useAiModels()
    const pending = models.load()
    store.settings = { ...store.settings, ai: { ...store.settings.ai, baseUrl: 'http://other:1' } }
    resolve(['stale'])
    await pending
    expect(models.models.value).toEqual([])
  })

  it('reports a failed listing', async () => {
    setup({ apiKind: 'ollama', baseUrl: 'http://localhost:11434' })
    listModels.mockRejectedValue(new Error('Connection refused'))
    const models = useAiModels()
    await models.load()
    expect(models.status.value).toBe('error')
  })

  it('keeps a paid OpenRouter model the endpoint serves and replaces an unknown one', async () => {
    listModels.mockResolvedValue(['anthropic/claude', 'b:free', 'a:free'])
    const store = setup({ apiKind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude' })
    const models = useAiModels()
    await models.load()
    expect(models.models.value).toEqual(['a:free', 'b:free'])
    expect(store.settings.ai.defaultModel).toBe('anthropic/claude')

    store.settings = { ...store.settings, ai: { ...store.settings.ai, defaultModel: 'llama3' } }
    await models.load(true)
    expect(store.settings.ai.defaultModel).toBe('a:free')
  })

  it('selects a model in settings', async () => {
    const store = setup({ apiKind: 'ollama', defaultModel: 'llama3' })
    await useAiModels().select('qwen3:8b')
    expect(store.settings.ai.defaultModel).toBe('qwen3:8b')
  })
})
