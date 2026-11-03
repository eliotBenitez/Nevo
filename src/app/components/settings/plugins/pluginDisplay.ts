import { markRaw } from 'vue'
import type { Component } from 'vue'
import { BarChart3, GitBranch, Kanban, LayoutTemplate, Network } from '../../../../ui/icons'
import type { PluginManifest } from '../../../../types/workspace'
import { isSystemPluginId, SYSTEM_PLUGIN_SHORT_IDS } from '../../../../utils/system-plugins'
import { pluginText, type PluginCatalogMessages } from '../../../../core/plugins/pluginMessages'

type Translate = (key: string) => string

export const systemPluginIcons: Record<string, Component> = {
  'nevo.kanban': markRaw(Kanban),
  'nevo.templates': markRaw(LayoutTemplate),
  'nevo.vega': markRaw(BarChart3),
  'nevo.markmap': markRaw(Network),
  'nevo.github-sync': markRaw(GitBranch),
}

export function pluginTitle(
  plugin: PluginManifest,
  t: Translate,
  messages?: PluginCatalogMessages,
): string {
  if (!isSystemPluginId(plugin.id)) return pluginText(messages, 'manifest.name', plugin.name)
  return t(`settings.plugins.${SYSTEM_PLUGIN_SHORT_IDS[plugin.id]}.title`)
}

export function pluginDescription(
  plugin: PluginManifest,
  t: Translate,
  messages?: PluginCatalogMessages,
): string {
  if (!isSystemPluginId(plugin.id)) {
    return pluginText(messages, 'manifest.description', plugin.description || t('settings.plugins.noDescription'))
  }
  return t(`settings.plugins.${SYSTEM_PLUGIN_SHORT_IDS[plugin.id]}.description`)
}

/** Full capability list; callers slice for compact displays. */
export function pluginCapabilities(manifest: PluginManifest): string[] {
  if (manifest.executionMode === 'sandboxed-worker') return [...(manifest.capabilities ?? [])]
  return [
    ...manifest.editorCapabilities,
    ...(manifest.uiCapabilities ?? []),
    ...(manifest.workspaceCapabilities ?? []),
  ]
}
