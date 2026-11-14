import { describe, expect, it } from 'vitest'
import { SYSTEM_PLUGIN_IDS } from '../../utils/system-plugins'
import { loadSystemPluginReadme } from './systemPluginReadmes'

describe('loadSystemPluginReadme', () => {
  it.each(SYSTEM_PLUGIN_IDS)('bundles a README for %s in every locale', async (id) => {
    for (const locale of ['en', 'ru', 'fr', 'es', 'de']) {
      expect((await loadSystemPluginReadme(id, locale))?.trim()).toBeTruthy()
    }
  })

  it('falls back to English for an unknown locale', async () => {
    expect(await loadSystemPluginReadme('nevo.kanban', 'xx')).toBe(await loadSystemPluginReadme('nevo.kanban', 'en'))
  })
})
