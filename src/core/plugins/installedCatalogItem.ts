import type { MarketplaceCatalogItem, PluginManifest } from '../../types/workspace'

/** Catalog-shaped stand-in so installed plugins can reuse the marketplace remove flow and page actions. */
export function installedRemovalItem(plugin: PluginManifest): MarketplaceCatalogItem {
  return {
    pluginId: plugin.id,
    pluginPath: `plugins/${plugin.id}`,
    treeSha: '',
    status: 'installed',
    manifest: plugin,
    manifestError: null,
    installedVersion: plugin.version,
    sourceUrl: `https://github.com/eliotBenitez/nevo-marketplace/tree/main/plugins/${plugin.id}`,
    files: [],
    permissionFingerprint: null,
  }
}
