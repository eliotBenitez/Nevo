import { beforeEach, describe, expect, it, vi } from 'vitest'

const commands = vi.hoisted(() => ({
  readLocal: vi.fn(),
  fetchMarketplace: vi.fn(),
}))
vi.mock('../../tauri/pluginMessages', () => ({ pluginMessagesCommands: commands }))

import {
  clearPluginMessagesCache,
  loadLocalPluginMessages,
  loadRemotePluginMessages,
  localeChain,
  pluginText,
  readmeFileForLocale,
} from './pluginMessages'

beforeEach(() => {
  clearPluginMessagesCache()
  commands.readLocal.mockReset()
  commands.fetchMarketplace.mockReset()
})

describe('localeChain', () => {
  it('goes locale, base language, default without duplicates', () => {
    expect(localeChain('pt-BR', 'en')).toEqual(['pt-BR', 'pt', 'en'])
    expect(localeChain('ru', 'ru')).toEqual(['ru'])
    expect(localeChain('de', 'en')).toEqual(['de', 'en'])
  })
})

describe('readmeFileForLocale', () => {
  const files = ['manifest.json', 'Readme.md', 'README.RU.md', 'README.en.md']

  it('prefers the locale file with the catalog spelling', () => {
    expect(readmeFileForLocale(files, 'ru', 'en')).toBe('README.RU.md')
  })

  it('falls back to the default locale, then README.md', () => {
    expect(readmeFileForLocale(files, 'fr', 'en')).toBe('README.en.md')
    expect(readmeFileForLocale(['Readme.md'], 'fr', 'en')).toBe('Readme.md')
    expect(readmeFileForLocale(['index.js'], 'fr', 'en')).toBeNull()
  })
})

describe('pluginText', () => {
  it('returns the fallback for missing or empty keys and interpolates', () => {
    expect(pluginText({ a: 'Hi {name}' }, 'a', 'x', { name: 'Bo' })).toBe('Hi Bo')
    expect(pluginText({ a: '' }, 'a', 'x')).toBe('x')
    expect(pluginText(undefined, 'a', 'x')).toBe('x')
    expect(pluginText({}, 'toString', 'x')).toBe('x')
  })
})

describe('message loaders', () => {
  it('caches local catalogs per id, version and locale', async () => {
    commands.readLocal.mockResolvedValue({ locale: 'ru', messages: { k: 'v' } })
    const manifest = { id: 'a.b', version: '1.0.0', defaultLocale: 'de' }
    expect(await loadLocalPluginMessages('/w', manifest, 'ru')).toEqual({ k: 'v' })
    await loadLocalPluginMessages('/w', manifest, 'ru')
    expect(commands.readLocal).toHaveBeenCalledTimes(1)
    expect(commands.readLocal).toHaveBeenCalledWith('/w', 'a.b', 'ru', 'de')
    await loadLocalPluginMessages('/w', manifest, 'fr')
    expect(commands.readLocal).toHaveBeenCalledTimes(2)
  })

  it('returns an empty catalog on null', async () => {
    commands.readLocal.mockResolvedValue(null)
    expect(await loadLocalPluginMessages('/w', { id: 'a.b', version: '1' }, 'en')).toEqual({})
  })

  it('fetches remote catalogs only when the item ships locales/*.json', async () => {
    commands.fetchMarketplace.mockResolvedValue({ locale: 'en', messages: { k: 'v' } })
    const base = { pluginId: 'a.b', treeSha: 'sha', manifest: null }
    expect(await loadRemotePluginMessages({ ...base, files: ['index.js'] }, 'en')).toEqual({})
    expect(commands.fetchMarketplace).not.toHaveBeenCalled()
    const item = { ...base, files: ['locales/en.json'] }
    expect(await loadRemotePluginMessages(item, 'en')).toEqual({ k: 'v' })
    await loadRemotePluginMessages(item, 'en')
    expect(commands.fetchMarketplace).toHaveBeenCalledTimes(1)
  })
})
