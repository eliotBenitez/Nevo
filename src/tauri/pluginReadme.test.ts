import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import { pluginReadmeCommands } from './pluginReadme'

describe('pluginReadmeCommands', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('reads a local README with camelCase args', async () => {
    invokeMock.mockResolvedValue('# Hi')
    await expect(pluginReadmeCommands.readLocal('/ws', 'p', 'ru', 'en')).resolves.toBe('# Hi')
    expect(invokeMock).toHaveBeenCalledWith('plugin_readme_read', {
      workspacePath: '/ws',
      pluginId: 'p',
      locale: 'ru',
      defaultLocale: 'en',
    })
  })

  it('fetches a marketplace README with camelCase args', async () => {
    invokeMock.mockResolvedValue(null)
    await expect(pluginReadmeCommands.fetchMarketplace('p', 'README.md')).resolves.toBeNull()
    expect(invokeMock).toHaveBeenCalledWith('marketplace_plugin_readme', {
      pluginId: 'p',
      fileName: 'README.md',
    })
  })
})
