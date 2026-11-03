import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MarketplaceCatalogItem, PluginManifest } from '../../../types/workspace'
import {
  loadLocalPluginMessages,
  loadRemotePluginMessages,
  type PluginCatalogMessages,
} from '../../../core/plugins/pluginMessages'

/** Catalog messages of installed user/marketplace plugins for the app locale, keyed by plugin id. */
export function usePluginMessages(
  plugins: () => PluginManifest[],
  workspacePath: () => string | null,
) {
  const { locale } = useI18n()
  const messages = ref<Record<string, PluginCatalogMessages>>({})
  let sequence = 0

  async function reload() {
    const token = ++sequence
    const path = workspacePath()
    const current = locale.value
    const targets = plugins().filter(plugin => plugin.kind !== 'system')
    if (!path || !targets.length) {
      messages.value = {}
      return
    }
    const entries = await Promise.all(targets.map(async plugin => {
      try {
        return [plugin.id, await loadLocalPluginMessages(path, plugin, current)] as const
      } catch {
        return [plugin.id, {}] as const
      }
    }))
    if (token === sequence) messages.value = Object.fromEntries(entries)
  }

  watch(
    () => [
      locale.value,
      workspacePath(),
      plugins().map(plugin => `${plugin.id}@${plugin.version}:${plugin.kind ?? ''}:${plugin.defaultLocale ?? ''}`).join('|'),
    ],
    () => { void reload() },
    { immediate: true },
  )

  function remoteMessages(item: MarketplaceCatalogItem): Promise<PluginCatalogMessages> {
    return loadRemotePluginMessages(item, locale.value)
  }

  return { messages, remoteMessages, reload }
}
