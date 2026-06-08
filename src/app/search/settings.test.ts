import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import { createDefaultAppConfig, createDefaultWorkspaceSettings } from '../../utils/workspace-settings'
import { buildWorkspaceSettingsSearchItems } from './settings'
import type { BuildWorkspaceSettingsSearchItemsOptions } from './settings'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function buildItems() {
  const appConfig = createDefaultAppConfig()
  appConfig.locale = 'en'

  return buildWorkspaceSettingsSearchItems({
    t: i18n.global.t as unknown as BuildWorkspaceSettingsSearchItemsOptions['t'],
    manifest: null,
    settings: createDefaultWorkspaceSettings(),
    appConfig,
    plugins: [],
    pluginValidation: {},
    locale: 'en',
    themeMode: 'system',
  })
}

describe('buildWorkspaceSettingsSearchItems', () => {
  it('marks roadmap settings as coming later', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'workspace.workspaceType')?.value).toBe('Coming later')
    expect(items.find(item => item.id === 'workspace.graphEntryMode')?.value).toBe('Coming later')
    expect(items.find(item => item.id === 'ai.privacyMode')?.value).toBe('Coming later')
  })

  it('shows developer logging as a boolean label', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'advanced.developerLogging')?.value).toBe('Off')
  })

  it('labels fixed editor hotkeys without hiding editable workspace hotkeys', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'hotkeys.core.bold')?.value).toContain('Fixed')
    expect(items.find(item => item.id === 'hotkeys.workspace.search')?.value).toBe('Ctrl + P')
  })
})
