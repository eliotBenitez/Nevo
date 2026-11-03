import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import { pluginMessagesCommands } from './pluginMessages'

describe('pluginMessagesCommands', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('reads local messages with camelCase args', async () => {
    const result = { locale: 'ru', messages: { a: 'b' } }
    invokeMock.mockResolvedValue(result)
    await expect(pluginMessagesCommands.readLocal('/ws', 'p', 'ru', 'en')).resolves.toEqual(result)
    expect(invokeMock).toHaveBeenCalledWith('plugin_messages_read', {
      workspacePath: '/ws',
      pluginId: 'p',
      locale: 'ru',
      defaultLocale: 'en',
    })
  })

  it('fetches marketplace messages with camelCase args', async () => {
    invokeMock.mockResolvedValue(null)
    await expect(pluginMessagesCommands.fetchMarketplace('p', 'pt-BR', 'en')).resolves.toBeNull()
    expect(invokeMock).toHaveBeenCalledWith('marketplace_plugin_messages', {
      pluginId: 'p',
      locale: 'pt-BR',
      defaultLocale: 'en',
    })
  })
})
