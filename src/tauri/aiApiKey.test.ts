import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAiApiKey, endpointOrigin, hasAiApiKey, readAiApiKey, saveAiApiKey } from './aiApiKey'

const secrets = new Map<string, string>()
const get = vi.fn(async (key: string) => secrets.get(key) ?? null)

vi.mock('./secureStore', () => ({
  SECRET_AI_API_KEY: 'nevo:ai.apiKey',
  secureStore: {
    get: (key: string) => get(key),
    set: async (key: string, value: string) => { secrets.set(key, value) },
    delete: async (key: string) => { secrets.delete(key) },
  },
}))

const OPENROUTER = 'https://openrouter.ai/api/v1'

describe('aiApiKey', () => {
  beforeEach(() => {
    secrets.clear()
    get.mockClear()
  })

  it('reads the key only for the origin it was saved for', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-or')
    expect(await readAiApiKey('https://openrouter.ai/api/v2')).toBe('sk-or')
    expect(await readAiApiKey('https://evil.example/v1')).toBeUndefined()
    expect(await readAiApiKey('http://openrouter.ai/api/v1')).toBeUndefined()
    expect(await hasAiApiKey('https://evil.example/v1')).toBe(false)
    expect(await hasAiApiKey(OPENROUTER)).toBe(true)
  })

  it('reads the key and its origin in one secure-store lookup', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-or')
    get.mockClear()
    await readAiApiKey(OPENROUTER)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('never sends or reports a legacy key saved without an endpoint', async () => {
    secrets.set('nevo:ai.apiKey', 'sk-legacy')
    expect(await hasAiApiKey(OPENROUTER)).toBe(false)
    expect(await readAiApiKey(OPENROUTER)).toBeUndefined()
    expect(secrets.get('nevo:ai.apiKey')).toBe('sk-legacy')
  })

  it('does not send a key to an unparseable endpoint and refuses to save for one', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-or')
    expect(await readAiApiKey('not a url')).toBeUndefined()
    await expect(saveAiApiKey('not a url', 'sk')).rejects.toThrow()
    expect(endpointOrigin('not a url')).toBeNull()
  })

  it('deletes the key', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-or')
    await deleteAiApiKey()
    expect(secrets.size).toBe(0)
  })
})
