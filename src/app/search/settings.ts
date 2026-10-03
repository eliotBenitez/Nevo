import type { WorkspaceSettingSearchItem } from '../../types/search'
import { resolveBindingChord } from '../../utils/workspace-settings'
import { LOCAL_SHORTCUT_COMMAND_IDS } from '../../utils/hotkeys'
import { isSystemPluginId, SYSTEM_PLUGIN_SHORT_IDS } from '../../utils/system-plugins'
import type { BuildWorkspaceSettingsSearchItemsOptions } from './settings-helpers'
import {
  booleanLabel, accentLabel, densityLabel, lineWidthLabel,
  hotkeyLabel, hotkeyScopeLabel, themeModeLabel, languageLabel,
  displayChord, sectionLabel,
} from './settings-helpers'
import { buildWorkspaceSearchItems } from './settings-workspace-items'

export type { BuildWorkspaceSettingsSearchItemsOptions }

export function buildWorkspaceSettingsSearchItems(options: BuildWorkspaceSettingsSearchItemsOptions): WorkspaceSettingSearchItem[] {
  const { t, settings, appConfig, plugins, pluginValidation, locale, themeMode } = options

  const items: WorkspaceSettingSearchItem[] = [
    {
      type: 'setting', id: 'general.language', section: 'general',
      sectionLabel: sectionLabel(t, 'general'),
      title: t('settings.general.language.title'),
      description: t('settings.general.language.description'),
      value: languageLabel(t, locale),
    },
    {
      type: 'setting', id: 'general.restoreLastContext', section: 'general',
      sectionLabel: sectionLabel(t, 'general'),
      title: t('settings.general.restoreLastContext.title'),
      description: t('settings.general.restoreLastContext.description'),
      value: booleanLabel(t, settings.general.restoreLastContext),
    },
    {
      type: 'setting', id: 'general.deleteConfirmations', section: 'general',
      sectionLabel: sectionLabel(t, 'general'),
      title: t('settings.general.deleteConfirmations.title'),
      description: t('settings.general.deleteConfirmations.description'),
      value: booleanLabel(t, settings.general.confirmBeforeDelete),
    },
    {
      type: 'setting', id: 'general.productTour', section: 'general',
      sectionLabel: sectionLabel(t, 'general'),
      title: t('settings.general.productTour.title'),
      description: t('settings.general.productTour.description'),
      value: t('settings.general.productTour.takeAgain'),
    },
    {
      type: 'setting', id: 'general.firstStepsOnHome', section: 'general',
      sectionLabel: sectionLabel(t, 'general'),
      title: t('settings.general.firstStepsOnHome.title'),
      description: t('settings.general.firstStepsOnHome.description'),
      value: booleanLabel(t, !appConfig.onboarding.firstStepsHidden),
    },
    {
      type: 'setting', id: 'general.firstUseHints', section: 'general',
      sectionLabel: sectionLabel(t, 'general'),
      title: t('settings.general.firstUseHints.title'),
      description: t('settings.general.firstUseHints.description'),
      value: booleanLabel(t, appConfig.onboarding.hintsEnabled),
    },
    {
      type: 'setting', id: 'appearance.mode', section: 'appearance',
      sectionLabel: sectionLabel(t, 'appearance'),
      title: t('settings.appearance.mode.title'),
      description: t('settings.appearance.mode.description'),
      value: themeModeLabel(t, themeMode),
    },
    {
      type: 'setting', id: 'appearance.accent', section: 'appearance',
      sectionLabel: sectionLabel(t, 'appearance'),
      title: t('settings.appearance.accent.title'),
      description: t('settings.appearance.accent.description'),
      value: accentLabel(t, settings.appearance.accentPreset),
    },
    {
      type: 'setting', id: 'appearance.interfaceDensity', section: 'appearance',
      sectionLabel: sectionLabel(t, 'appearance'),
      title: t('settings.appearance.interfaceDensity.title'),
      description: t('settings.appearance.interfaceDensity.description'),
      value: densityLabel(t, appConfig.interfaceDensity),
    },
    {
      type: 'setting', id: 'appearance.reducedMotion', section: 'appearance',
      sectionLabel: sectionLabel(t, 'appearance'),
      title: t('settings.appearance.reducedMotion.title'),
      description: t('settings.appearance.reducedMotion.description'),
      value: t(`settings.options.${appConfig.reducedMotion === 'system' ? 'theme' : 'reducedMotion'}.${appConfig.reducedMotion}`),
    },
    {
      type: 'setting', id: 'appearance.scrollbarVisibility', section: 'appearance',
      sectionLabel: sectionLabel(t, 'appearance'),
      title: t('settings.appearance.scrollbarVisibility.title'),
      description: t('settings.appearance.scrollbarVisibility.description'),
      value: t(`settings.options.scrollbarVisibility.${appConfig.scrollbarVisibility}`),
    },
    {
      type: 'setting', id: 'appearance.contrastMode', section: 'appearance',
      sectionLabel: sectionLabel(t, 'appearance'),
      title: t('settings.appearance.contrastMode.title'),
      description: t('settings.appearance.contrastMode.description'),
      value: t(`settings.options.contrastMode.${settings.appearance.contrastMode}`),
    },
    {
      type: 'setting', id: 'editor.documentWidth', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.documentWidth.title'),
      description: t('settings.editor.documentWidth.description'),
      value: lineWidthLabel(t, settings.appearance.editorLineWidth),
    },
    {
      type: 'setting', id: 'editor.fontSize', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.fontSize.title'),
      description: t('settings.editor.fontSize.description'),
      value: `${settings.appearance.editorFontSize} px`,
    },
    {
      type: 'setting', id: 'editor.editorFont', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.appearance.editorFont.title'),
      description: t('settings.appearance.editorFont.description'),
      value: ['ui', 'serif', 'mono'].includes(settings.appearance.editorFontFamily)
        ? t(`settings.options.editorFont.${settings.appearance.editorFontFamily}`)
        : settings.appearance.editorFontFamily,
    },
    {
      type: 'setting', id: 'editor.accentColoredHeadings', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.accentColoredHeadings.title'),
      description: t('settings.editor.accentColoredHeadings.description'),
      value: booleanLabel(t, settings.appearance.accentColoredHeadings),
    },
    {
      type: 'setting', id: 'editor.spellcheck', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.spellcheck.title'),
      description: t('settings.editor.spellcheck.description'),
      value: booleanLabel(t, settings.editor.spellCheck),
    },
    {
      type: 'setting', id: 'editor.slashCommands', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.slashCommands.title'),
      description: t('settings.editor.slashCommands.description'),
      value: booleanLabel(t, settings.editor.slashCommands),
    },
    {
      type: 'setting', id: 'editor.smoothScrolling', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.smoothScrolling.title'),
      description: t('settings.editor.smoothScrolling.description'),
      value: booleanLabel(t, settings.editor.smoothScrolling),
    },
    {
      type: 'setting', id: 'editor.markdownShortcuts', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.markdownShortcuts.title'),
      description: t('settings.editor.markdownShortcuts.description'),
      value: booleanLabel(t, settings.editor.markdownShortcuts),
    },
    {
      type: 'setting', id: 'editor.focusMode', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.focusMode.title'),
      description: t('settings.editor.focusMode.description'),
      value: t(`settings.options.focusMode.${settings.editor.focusMode}`),
    },
    {
      type: 'setting', id: 'editor.typewriterScrolling', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.typewriterScrolling.title'),
      description: t('settings.editor.typewriterScrolling.description'),
      value: booleanLabel(t, settings.editor.typewriterScrolling),
    },
    {
      type: 'setting', id: 'editor.typewriterPosition', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.typewriterPosition.title'),
      description: t('settings.editor.typewriterPosition.description'),
      value: t(`settings.options.typewriterPosition.${settings.editor.typewriterPosition}`),
    },
    {
      type: 'setting', id: 'editor.activeBlockEmphasis', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.activeBlockEmphasis.title'),
      description: t('settings.editor.activeBlockEmphasis.description'),
      value: booleanLabel(t, settings.editor.activeBlockEmphasis),
    },
    {
      type: 'setting', id: 'editor.caretAnimation', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.caretAnimation.title'),
      description: t('settings.editor.caretAnimation.description'),
      value: t(`settings.options.caretAnimation.${settings.editor.caretAnimation}`),
    },
    {
      type: 'setting', id: 'editor.tabKeyBehavior', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.tabKeyBehavior.title'),
      description: t('settings.editor.tabKeyBehavior.description'),
      value: t(`settings.options.tabKeyBehavior.${settings.editor.tabKeyBehavior}`),
    },
    {
      type: 'setting', id: 'editor.autosavePolicy', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.autosavePolicy.title'),
      description: t('settings.editor.autosavePolicy.description'),
      value: t(`settings.options.autosavePolicy.${settings.editor.autosavePolicy === 'window-idle' ? 'windowIdle' : 'immediate'}`),
    },
    {
      type: 'setting', id: 'editor.pasteBehavior', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.pasteBehavior.title'),
      description: t('settings.editor.pasteBehavior.description'),
      value: t(`settings.options.pasteBehavior.${settings.editor.pasteBehavior === 'plain-text' ? 'plainText' : 'smart'}`),
    },
    {
      type: 'setting', id: 'editor.slashMenuLayout', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.slashMenuLayout.title'),
      description: t('settings.editor.slashMenuLayout.description'),
      value: t(`settings.options.slashMenuLayout.${settings.editor.slashMenuLayout}`),
    },
    {
      type: 'setting', id: 'editor.slashMenuHints', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.slashMenuHints.title'),
      description: t('settings.editor.slashMenuHints.description'),
      value: booleanLabel(t, settings.editor.slashMenuHints),
    },
    {
      type: 'setting', id: 'editor.editorStats', section: 'editor',
      sectionLabel: sectionLabel(t, 'editor'),
      title: t('settings.editor.editorStats.title'),
      description: t('settings.editor.editorStats.description'),
      value: t(`settings.options.editorStats.${settings.editor.editorStatsVisibility}`),
    },
    ...buildWorkspaceSearchItems(options),
    {
      type: 'setting', id: 'ai.defaultModel', section: 'ai',
      sectionLabel: sectionLabel(t, 'ai'),
      title: t('settings.ai.defaultModel.title'),
      description: t('settings.ai.defaultModel.description'),
      value: t('settings.state.coming'),
    },
    {
      type: 'setting', id: 'ai.privacyMode', section: 'ai',
      sectionLabel: sectionLabel(t, 'ai'),
      title: t('settings.ai.privacyMode.title'),
      description: t('settings.ai.privacyMode.description'),
      value: t('settings.state.coming'),
    },
    {
      type: 'setting', id: 'ai.slashCommands', section: 'ai',
      sectionLabel: sectionLabel(t, 'ai'),
      title: t('settings.ai.slashCommands.title'),
      description: t('settings.ai.slashCommands.description'),
      value: t('settings.state.coming'),
    },
    {
      type: 'setting', id: 'ai.contextSuggestions', section: 'ai',
      sectionLabel: sectionLabel(t, 'ai'),
      title: t('settings.ai.contextSuggestions.title'),
      description: t('settings.ai.contextSuggestions.description'),
      value: t('settings.state.coming'),
    },
    {
      type: 'setting', id: 'ai.streamingOutput', section: 'ai',
      sectionLabel: sectionLabel(t, 'ai'),
      title: t('settings.ai.streamingOutput.title'),
      description: t('settings.ai.streamingOutput.description'),
      value: t('settings.state.coming'),
    },
    {
      type: 'setting', id: 'files.snapshotRetention', section: 'files',
      sectionLabel: sectionLabel(t, 'files'),
      title: t('settings.files.snapshotRetention.title'),
      description: t('settings.files.snapshotRetention.searchDescription'),
      value: `${settings.files.snapshotRetentionCount}`,
    },
    {
      type: 'setting', id: 'mcp.mode', section: 'mcp',
      sectionLabel: sectionLabel(t, 'mcp'),
      title: t('settings.mcp.mode.title'),
      description: t('settings.mcp.mode.description'),
      value: t(`settings.mcp.modes.${settings.mcp.mode === 'read-only' ? 'readOnly' : settings.mcp.mode}`),
    },
    {
      type: 'setting', id: 'mcp.autoSnapshot', section: 'mcp',
      sectionLabel: sectionLabel(t, 'mcp'),
      title: t('settings.mcp.autoSnapshot.title'),
      description: t('settings.mcp.autoSnapshot.description'),
      value: booleanLabel(t, settings.mcp.autoSnapshot),
    },
    {
      type: 'setting', id: 'advanced.experimentalGraphTools', section: 'advanced',
      sectionLabel: sectionLabel(t, 'advanced'),
      title: t('settings.advanced.experimentalGraphTools.title'),
      description: t('settings.advanced.experimentalGraphTools.description'),
      value: booleanLabel(t, settings.advanced.experimentalGraphTools),
    },
    {
      type: 'setting', id: 'advanced.developerLogging', section: 'advanced',
      sectionLabel: sectionLabel(t, 'advanced'),
      title: t('settings.advanced.developerLogging.title'),
      description: t('settings.advanced.developerLogging.description'),
      value: booleanLabel(t, settings.advanced.developerLogging),
    },
  ]

  for (const plugin of plugins) {
    const systemPluginKey = isSystemPluginId(plugin.id) ? SYSTEM_PLUGIN_SHORT_IDS[plugin.id] : null
    items.push({
      type: 'setting', id: `plugins.${plugin.id}`, section: 'plugins',
      sectionLabel: sectionLabel(t, 'plugins'),
      title: systemPluginKey ? t(`settings.plugins.${systemPluginKey}.title`) : plugin.name,
      description: systemPluginKey
        ? t(`settings.plugins.${systemPluginKey}.description`)
        : plugin.description || t('settings.plugins.fallbackDescription'),
      value: pluginValidation[plugin.id] === 'invalid'
        ? t('settings.state.coming')
        : plugin.enabled ? t('settings.common.enabled') : t('settings.common.disabled'),
    })
  }

  for (const binding of settings.hotkeys.bindings) {
    const isEditable = LOCAL_SHORTCUT_COMMAND_IDS.has(binding.commandId)
    items.push({
      type: 'setting', id: `hotkeys.${binding.commandId}`, section: 'hotkeys',
      sectionLabel: sectionLabel(t, 'hotkeys'),
      title: hotkeyLabel(t, binding),
      description: hotkeyScopeLabel(t, binding.scope),
      value: isEditable
        ? displayChord(resolveBindingChord(binding))
        : `${displayChord(resolveBindingChord(binding))} · ${t('settings.hotkeys.fixed')}`,
    })
  }

  return items
}
