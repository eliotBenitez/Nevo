import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import { deleteAiApiKey, hasAiApiKey, saveAiApiKey } from './aiApiKey'

describe('aiApiKey', () => {
  beforeEach(() => invoke.mockReset().mockResolvedValue(undefined))

  it('saves, checks and deletes the key through Rust commands with camelCase payloads', async () => {
    await saveAiApiKey('https://openrouter.ai/api/v1', 'sk-or')
    expect(invoke).toHaveBeenCalledWith('ai_api_key_save', { baseUrl: 'https://openrouter.ai/api/v1', key: 'sk-or' })

    invoke.mockResolvedValue(true)
    await expect(hasAiApiKey('https://openrouter.ai/api/v1')).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('ai_api_key_status', { baseUrl: 'https://openrouter.ai/api/v1' })

    await deleteAiApiKey()
    expect(invoke).toHaveBeenCalledWith('ai_api_key_delete')
  })

  it('never reads the key back through the generic secure store', async () => {
    await hasAiApiKey('https://openrouter.ai/api/v1')
    expect(invoke).not.toHaveBeenCalledWith('secure_store_get', expect.anything())
  })
})
