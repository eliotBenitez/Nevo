import type { PluginManifest } from '../types/workspace'

export const SYSTEM_PLUGIN_IDS = ['nevo.kanban', 'nevo.templates', 'nevo.vega', 'nevo.markmap', 'nevo.github-sync'] as const
export type SystemPluginId = typeof SYSTEM_PLUGIN_IDS[number]

export const SYSTEM_PLUGIN_SHORT_IDS: Record<SystemPluginId, string> = {
  'nevo.kanban': 'kanban',
  'nevo.templates': 'templates',
  'nevo.vega': 'vega',
  'nevo.markmap': 'markmap',
  'nevo.github-sync': 'githubSync',
}

export function isSystemPluginId(pluginId: string): pluginId is SystemPluginId {
  return (SYSTEM_PLUGIN_IDS as readonly string[]).includes(pluginId)
}

export function isPluginEnabled(plugins: PluginManifest[], pluginId: SystemPluginId): boolean {
  return plugins.find(plugin => plugin.id === pluginId)?.enabled === true
}

export function sortPluginsByKind(plugins: PluginManifest[]): PluginManifest[] {
  return plugins.slice().sort((a, b) => {
    const kindRank = (plugin: PluginManifest) => plugin.kind === 'system' ? 0 : plugin.kind === 'marketplace' ? 1 : 2
    const byKind = kindRank(a) - kindRank(b)
    if (byKind !== 0) return byKind
    return a.name.localeCompare(b.name)
  })
}
