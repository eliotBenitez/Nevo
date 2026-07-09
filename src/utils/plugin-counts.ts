import type { PluginManifest } from '../types/workspace'

export function getTotalPluginCount(plugins: PluginManifest[]): number {
  return plugins.length
}

export function getEnabledPluginCount(plugins: PluginManifest[]): number {
  return plugins.filter(plugin => plugin.enabled).length
}
