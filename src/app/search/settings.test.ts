import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import { createDefaultAppConfig, createDefaultWorkspaceSettings } from '../../utils/workspace-settings'
import { buildWorkspaceSettingsSearchItems } from './settings'
import type { BuildWorkspaceSettingsSearchItemsOptions } from './settings'
import type { PluginManifest } from '../../types/workspace'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function buildItems(plugins: PluginManifest[] = [], slashMenuLayout?: 'list' | 'grid' | 'preview') {
  const appConfig = createDefaultAppConfig()
  appConfig.locale = 'en'
  const settings = createDefaultWorkspaceSettings()
  if (slashMenuLayout) settings.editor.slashMenuLayout = slashMenuLayout

  return buildWorkspaceSettingsSearchItems({
    t: i18n.global.t as unknown as BuildWorkspaceSettingsSearchItemsOptions['t'],
    manifest: null,
    settings,
    appConfig,
    plugins,
    pluginValidation: {},
    locale: 'en',
    themeMode: 'system',
  })
}

describe('buildWorkspaceSettingsSearchItems', () => {
  it.each([['list', 'List'], ['grid', 'Tiles'], ['preview', 'Previews']] as const)('shows the %s slash menu setting', (layout, label) => {
    expect(buildItems([], layout).find(item => item.id === 'editor.slashMenuLayout')?.value).toBe(label)
  })
  it('marks roadmap settings as coming later', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'workspace.workspaceType')?.value).toBe('General')
    expect(items.find(item => item.id === 'workspace.graphEntryMode')?.value).toBe('Global')
    expect(items.find(item => item.id === 'ai.privacyMode')?.value).toBe('Coming later')
  })

  it('shows developer logging as a boolean label', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'advanced.developerLogging')?.value).toBe('Off')
  })

  it('shows experimental graph tools as a boolean label', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'advanced.experimentalGraphTools')?.value).toBe('Off')
  })

  it('labels fixed editor hotkeys without hiding editable workspace hotkeys', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'hotkeys.core.bold')?.value).toContain('Fixed')
    expect(items.find(item => item.id === 'hotkeys.workspace.search')?.value).toBe('Ctrl + P')
  })

  it('uses localized system-plugin metadata instead of manifest display strings', () => {
    const items = buildItems([{
      id: 'nevo.github-sync',
      name: 'Raw plugin title',
      version: '1.0.0',
      description: 'Raw plugin description',
      enabled: true,
      kind: 'system',
      entryPoint: '',
      apiVersion: '1',
      editorCapabilities: [],
    }])
    const item = items.find(candidate => candidate.id === 'plugins.nevo.github-sync')

    expect(item?.title).toBe(i18n.global.t('settings.plugins.githubSync.title'))
    expect(item?.description).toBe(i18n.global.t('settings.plugins.githubSync.description'))
  })

  it('does not expose internal command ids in hotkey descriptions', () => {
    const item = buildItems().find(candidate => candidate.id === 'hotkeys.workspace.search')

    expect(item?.description).toBe(i18n.global.t('settings.hotkeys.scope.workspace'))
    expect(item?.description).not.toContain('workspace.search')
  })

  it('no longer exposes the removed visual-style search entries (Borderless is the only style)', () => {
    const items = buildItems()

    expect(items.find(item => item.id === 'appearance.backgroundScene')).toBeUndefined()
    expect(items.find(item => item.id === 'appearance.surfaceStyle')).toBeUndefined()
    expect(items.find(item => item.id === 'appearance.sidebarStyle')).toBeUndefined()
    expect(items.find(item => item.id === 'appearance.focusRingStyle')).toBeUndefined()
    expect(items.find(item => item.id === 'appearance.windowChromeStyle')).toBeUndefined()
    expect(items.find(item => item.id === 'workspace.sidebarContentMode')).toBeUndefined()
  })
})
