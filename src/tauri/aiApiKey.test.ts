import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAiApiKey, endpointOrigin, hasAiApiKey, readAiApiKey, saveAiApiKey } from './aiApiKey'

const secrets = new Map<string, string>()
const set = vi.fn(async (key: string, value: string) => { secrets.set(key, value) })

vi.mock('./secureStore', () => ({
  SECRET_AI_API_KEY: 'nevo:ai.apiKey',
  secureStore: {
    get: async (key: string) => secrets.get(key) ?? null,
    set: (key: string, value: string) => set(key, value),
    delete: async (key: string) => { secrets.delete(key) },
  },
}))

const OPENROUTER = 'https://openrouter.ai/api/v1'

describe('aiApiKey', () => {
  beforeEach(() => {
    secrets.clear()
    set.mockClear()
  })

  it('reads the key only for the origin it was saved for', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-or')
    expect(await readAiApiKey('https://openrouter.ai/api/v2')).toBe('sk-or')
    expect(await readAiApiKey('https://evil.example/v1')).toBeUndefined()
    expect(await readAiApiKey('http://openrouter.ai/api/v1')).toBeUndefined()
    expect(await hasAiApiKey('https://evil.example/v1')).toBe(false)
    expect(await hasAiApiKey(OPENROUTER)).toBe(true)
  })

  it('binds a key saved before endpoint binding to the endpoint first used', async () => {
    secrets.set('nevo:ai.apiKey', 'sk-legacy')
    expect(await hasAiApiKey(OPENROUTER)).toBe(true)
    expect(await readAiApiKey(OPENROUTER)).toBe('sk-legacy')
    expect(await readAiApiKey('https://other.example')).toBeUndefined()
  })

  it('does not send a key to an unparseable endpoint and refuses to save for one', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-or')
    expect(await readAiApiKey('not a url')).toBeUndefined()
    await expect(saveAiApiKey('not a url', 'sk')).rejects.toThrow()
    expect(endpointOrigin('not a url')).toBeNull()
  })

  it('drops a new key whose origin could not be stored', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-old')
    set.mockImplementationOnce(async (key, value) => { secrets.set(key, value) })
      .mockImplementationOnce(async () => { throw new Error('keychain locked') })
    await expect(saveAiApiKey('https://other.example', 'sk-new')).rejects.toThrow('keychain locked')
    expect(await readAiApiKey(OPENROUTER)).toBeUndefined()
  })

  it('deletes the key together with its origin', async () => {
    await saveAiApiKey(OPENROUTER, 'sk-or')
    await deleteAiApiKey()
    expect(secrets.size).toBe(0)
  })
})
