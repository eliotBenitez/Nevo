import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MarketplaceCatalogItem, PluginManifest } from '../../../types/workspace'
import { pluginReadmeCommands } from '../../../tauri/pluginReadme'
import { readmeFileForLocale, type PluginCatalogMessages } from '../../../core/plugins/pluginMessages'
import { installedRemovalItem } from '../../../core/plugins/installedCatalogItem'
import { usePluginReadme } from './usePluginReadme'
import type { ReadmeTarget } from './usePluginReadme'

export type PluginPageSource = 'installed' | 'catalog'

const DEFAULT_LOCALE = 'en'

interface PluginPageStateOptions {
  plugins: Ref<PluginManifest[]>
  catalogItems: Ref<MarketplaceCatalogItem[]>
  workspacePath: Ref<string | null>
  /** Catalog messages of installed plugins, keyed by plugin id. */
  installedMessages: Ref<Record<string, PluginCatalogMessages>>
  remoteMessages: (item: MarketplaceCatalogItem) => Promise<PluginCatalogMessages>
  panelBody: Ref<HTMLElement | null>
}

/** Detail-page state of the plugins panel: which plugin is open, its README and its catalog messages. */
export function usePluginPageState(options: PluginPageStateOptions) {
  const { locale } = useI18n()
  const page = ref<{ source: PluginPageSource; id: string } | null>(null)

  const pageInstalled = computed(() =>
    page.value ? options.plugins.value.find(p => p.id === page.value?.id) ?? null : null)
  const pageCatalog = computed(() =>
    page.value ? options.catalogItems.value.find(i => i.pluginId === page.value?.id) ?? null : null)
  const pageManifest = computed(() => pageInstalled.value ?? pageCatalog.value?.manifest ?? null)
  const pageActionItem = computed(() =>
    pageCatalog.value ?? (pageInstalled.value ? installedRemovalItem(pageInstalled.value) : null))

  const remote = ref<PluginCatalogMessages>({})
  let remoteSequence = 0
  watch(
    () => {
      const item = pageInstalled.value ? null : pageCatalog.value
      return item ? `${item.pluginId}@${item.treeSha}:${locale.value}` : null
    },
    async (key) => {
      const token = ++remoteSequence
      remote.value = {}
      const item = key ? pageCatalog.value : null
      if (!item) return
      try {
        const messages = await options.remoteMessages(item)
        if (token === remoteSequence) remote.value = messages
      } catch {
        // Name and description fall back to the manifest text.
      }
    },
    { immediate: true },
  )
  const pageMessages = computed<PluginCatalogMessages | undefined>(() => {
    if (!page.value) return undefined
    return pageInstalled.value
      ? options.installedMessages.value[page.value.id]
      : remote.value
  })

  const readmeTarget = computed<ReadmeTarget | null>(() => {
    if (!page.value) return null
    const id = page.value.id
    const installed = pageInstalled.value
    if (installed) {
      const key = `local:${id}@${installed.version}:${locale.value}`
      const path = options.workspacePath.value
      if (installed.kind === 'system' || !path) return { key, load: async () => null }
      const current = locale.value
      return {
        key,
        load: () => pluginReadmeCommands.readLocal(path, id, current, installed.defaultLocale ?? DEFAULT_LOCALE),
      }
    }
    const item = pageCatalog.value
    const fileName = item
      ? readmeFileForLocale(item.files, locale.value, item.manifest?.defaultLocale ?? DEFAULT_LOCALE)
      : null
    if (!item || !fileName) return { key: `none:${id}`, load: async () => null }
    return {
      key: `remote:${id}@${item.treeSha}:${fileName}`,
      load: () => pluginReadmeCommands.fetchMarketplace(id, fileName),
    }
  })
  const { status: readmeStatus, blocks: readmeBlocks, retry: retryReadme } = usePluginReadme(() => readmeTarget.value)

  // Where focus returns on back.
  let openerId: string | null = null
  async function openPage(source: PluginPageSource, id: string) {
    openerId = id
    page.value = { source, id }
    await nextTick()
    options.panelBody.value?.scrollTo?.({ top: 0 })
  }
  async function closePage() {
    page.value = null
    const id = openerId
    openerId = null
    await nextTick()
    if (id) document.querySelector<HTMLElement>(`[data-plugin-open="${CSS.escape(id)}"]`)?.focus()
  }

  // Leave the page when its plugin disappears (rescan, removal).
  watch([page, pageInstalled, pageCatalog], () => {
    if (page.value && !pageInstalled.value && (page.value.source === 'installed' || !pageCatalog.value)) void closePage()
  })

  return {
    page,
    pageInstalled,
    pageCatalog,
    pageManifest,
    pageActionItem,
    pageMessages,
    readmeTarget,
    readmeStatus,
    readmeBlocks,
    retryReadme,
    openPage,
    closePage,
  }
}
