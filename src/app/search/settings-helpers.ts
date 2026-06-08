import type { ComposerTranslation } from 'vue-i18n'
import type { AppConfig, AppLocale, HotkeyBinding, HotkeyScope, PluginManifest, ThemeMode, WorkspaceManifest, WorkspaceSettings } from '../../types/workspace'
import type { WorkspaceSettingSearchItem } from '../../types/search'

export const accentLabelKeys: Record<string, string> = {
  violet: 'settings.options.accent.violet',
  ember: 'settings.options.accent.ember',
  sage: 'settings.options.accent.sage',
  ocean: 'settings.options.accent.ocean',
  rose: 'settings.options.accent.rose',
}

export const hotkeyLabelKeys: Record<string, string> = {
  'core.undo': 'settings.hotkeys.commands.undo',
  'core.redo': 'settings.hotkeys.commands.redo',
  'core.bold': 'settings.hotkeys.commands.bold',
  'core.italic': 'settings.hotkeys.commands.italic',
  'core.strikethrough': 'settings.hotkeys.commands.strikethrough',
  'core.underline': 'settings.hotkeys.commands.underline',
  'core.kbd': 'settings.hotkeys.commands.kbd',
  'core.tag': 'settings.hotkeys.commands.tag',
  'core.heading.1': 'settings.hotkeys.commands.heading1',
  'core.heading.2': 'settings.hotkeys.commands.heading2',
  'core.heading.3': 'settings.hotkeys.commands.heading3',
  'core.heading.4': 'settings.hotkeys.commands.heading4',
  'core.heading.5': 'settings.hotkeys.commands.heading5',
  'core.heading.6': 'settings.hotkeys.commands.heading6',
  'core.orderedList': 'settings.hotkeys.commands.orderedList',
  'core.bulletList': 'settings.hotkeys.commands.bulletList',
  'core.blockquote': 'settings.hotkeys.commands.blockquote',
  'core.math.inline.insert': 'settings.hotkeys.commands.inlineMath',
  'workspace.new-note': 'settings.hotkeys.commands.newNote',
  'workspace.new-folder': 'settings.hotkeys.commands.newFolder',
  'workspace.save-note': 'settings.hotkeys.commands.saveNote',
  'workspace.search': 'settings.hotkeys.commands.searchTitles',
  'workspace.toggle-sidebar': 'settings.hotkeys.commands.toggleSidebar',
  'app.open-settings': 'settings.hotkeys.commands.openSettings',
}

export interface BuildWorkspaceSettingsSearchItemsOptions {
  t: ComposerTranslation
  manifest: WorkspaceManifest | null
  settings: WorkspaceSettings
  appConfig: AppConfig
  plugins: PluginManifest[]
  pluginValidation: Record<string, 'valid' | 'invalid'>
  locale: AppLocale
  themeMode: ThemeMode
}

export function booleanLabel(t: ComposerTranslation, value: boolean): string {
  return value ? t('settings.common.on') : t('settings.common.off')
}

export function accentLabel(t: ComposerTranslation, preset: string): string {
  const key = accentLabelKeys[preset]
  return key ? t(key) : preset
}

export function densityLabel(t: ComposerTranslation, value: 'compact' | 'comfortable'): string {
  return t(`settings.options.density.${value}`)
}

export function lineWidthLabel(t: ComposerTranslation, value: 'narrow' | 'medium' | 'wide'): string {
  return t(`settings.options.lineWidth.${value}`)
}

export function hotkeyLabel(t: ComposerTranslation, binding: HotkeyBinding): string {
  const key = hotkeyLabelKeys[binding.commandId]
  return key ? t(key) : binding.label
}

export function hotkeyScopeLabel(t: ComposerTranslation, scope: HotkeyScope): string {
  return t(`settings.hotkeys.scope.${scope}`)
}

export function themeModeLabel(t: ComposerTranslation, mode: ThemeMode): string {
  return t(`settings.options.theme.${mode}`)
}

export function languageLabel(t: ComposerTranslation, locale: AppLocale): string {
  return t(`settings.options.language.${locale}`)
}

export function displayChord(chord: string): string {
  return chord.split('+').map(s => (s === 'Space' ? 'Space' : s)).join(' + ')
}

export function sectionLabel(t: ComposerTranslation, section: WorkspaceSettingSearchItem['section']): string {
  return t(`settings.sections.${section}`)
}
