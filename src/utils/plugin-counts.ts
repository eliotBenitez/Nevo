import type { PluginManifest, WorkspaceSettings } from '../types/workspace'

const SYSTEM_PLUGIN_FEATURE_KEYS = ['kanban', 'templates', 'vega', 'markmap'] as const

export function getSystemPluginCount(): number {
  return SYSTEM_PLUGIN_FEATURE_KEYS.length
}

export function getEnabledSystemPluginCount(settings: WorkspaceSettings): number {
  return SYSTEM_PLUGIN_FEATURE_KEYS.filter(key => settings.features[key] !== false).length
}

export function getTotalPluginCount(plugins: PluginManifest[]): number {
  return getSystemPluginCount() + plugins.length
}

export function getEnabledPluginCount(plugins: PluginManifest[], settings: WorkspaceSettings): number {
  return getEnabledSystemPluginCount(settings) + plugins.filter(plugin => plugin.enabled).length
}
