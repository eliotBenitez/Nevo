<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { confirm } from '@tauri-apps/plugin-dialog'
import { AlertTriangle, Download, PackageCheck, RefreshCw } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useNoteStore } from '../../../stores/note'
import { systemCommands, workspaceCommands } from '../../../tauri/commands'
import type { MarketplaceCatalogItem, PluginManifest } from '../../../types/workspace'
import { getEnabledPluginCount, getTotalPluginCount } from '../../../utils/plugin-counts'
import { sortPluginsByKind } from '../../../utils/system-plugins'
import { appLogger } from '../../../utils/logger'
import NvButton from '../../../ui/primitives/NvButton.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import PluginCard from './plugins/PluginCard.vue'
import PluginCatalogCard from './plugins/PluginCatalogCard.vue'

type PanelTab = 'installed' | 'catalog'
type MarketplaceAction = 'install' | 'update' | 'remove'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const noteStore = useNoteStore()
const { plugins, activePath, marketplaceCatalog } = storeToRefs(workspaceStore)
const pluginPath = computed(() => activePath.value)

const activeTab = ref<PanelTab>('installed')
const pluginValidation = ref<Record<string, 'valid' | 'invalid'>>({})
const expandedSettings = ref<Record<string, boolean>>({})
const loadingPluginId = ref<string | null>(null)
const catalogLoading = ref(false)
const catalogError = ref<string | null>(null)

const pluginTotalCount = computed(() => getTotalPluginCount(plugins.value))
const pluginEnabledCount = computed(() => getEnabledPluginCount(plugins.value))
const pluginIssueCount = computed(() => Object.values(pluginValidation.value).filter(s => s === 'invalid').length)
const orderedPlugins = computed(() => sortPluginsByKind(plugins.value))
const catalogItems = computed(() => marketplaceCatalog.value?.plugins ?? [])
const invalidCatalogCount = computed(() => catalogItems.value.filter(item => item.status === 'invalid' || item.status === 'conflict').length)

function capabilityList(plugin: PluginManifest): string[] {
  if (plugin.executionMode === 'sandboxed-worker') {
    return (plugin.capabilities ?? []).slice(0, 6)
  }
  return [
    ...plugin.editorCapabilities,
    ...(plugin.uiCapabilities ?? []),
    ...(plugin.workspaceCapabilities ?? []),
  ].slice(0, 6)
}

function catalogManifest(item: MarketplaceCatalogItem): PluginManifest | null {
  return item.manifest
}

function catalogCapabilities(item: MarketplaceCatalogItem): string[] {
  const manifest = catalogManifest(item)
  if (!manifest) return []
  return capabilityList(manifest)
}

function catalogDomains(item: MarketplaceCatalogItem): string[] {
  return item.manifest?.network?.hosts ?? []
}

function permissionSet(plugin: PluginManifest): Set<string> {
  const capabilities = plugin.executionMode === 'sandboxed-worker'
    ? plugin.capabilities ?? []
    : [
        ...plugin.editorCapabilities,
        ...(plugin.uiCapabilities ?? []),
        ...(plugin.workspaceCapabilities ?? []),
      ]
  return new Set([
    ...capabilities.map(value => `capability:${value}`),
    ...(plugin.network?.hosts ?? []).map(value => `host:${value}`),
    ...(plugin.network?.methods ?? []).map(value => `method:${value}`),
  ])
}

function expandsPermissions(next: PluginManifest): boolean {
  const installed = plugins.value.find(plugin => plugin.id === next.id)
  if (!installed) return true
  const current = permissionSet(installed)
  return [...permissionSet(next)].some(permission => !current.has(permission))
}

function permissionReviewText(item: MarketplaceCatalogItem): string {
  const capabilities = catalogCapabilities(item)
  const domains = catalogDomains(item)
  return t('settings.plugins.permissionReview', {
    plugin: catalogTitle(item),
    capabilities: capabilities.length ? capabilities.join(', ') : t('settings.plugins.noPermissions'),
    domains: domains.length ? domains.join(', ') : t('settings.plugins.noDomains'),
  })
}

function catalogTitle(item: MarketplaceCatalogItem): string {
  return catalogManifest(item)?.name ?? item.pluginId
}

function canRunMarketplaceAction(item: MarketplaceCatalogItem, action: MarketplaceAction): boolean {
  if (loadingPluginId.value === item.pluginId || item.status === 'invalid' || item.status === 'conflict') return false
  if (action === 'install') return item.status === 'notInstalled'
  if (action === 'update') return item.status === 'updateAvailable'
  return item.status === 'installed' || item.status === 'disabled' || item.status === 'updateAvailable'
}

async function validatePlugins() {
  const path = pluginPath.value
  if (!path) return
  const next: Record<string, 'valid' | 'invalid'> = {}
  for (const plugin of plugins.value) {
    try {
      await workspaceCommands.validatePluginManifest(path, plugin.id)
      next[plugin.id] = 'valid'
    } catch {
      next[plugin.id] = 'invalid'
    }
  }
  pluginValidation.value = next
}

async function loadCatalog(forceRefresh = false) {
  catalogLoading.value = true
  catalogError.value = null
  try {
    await workspaceStore.loadMarketplacePlugins(forceRefresh)
  } catch (error) {
    catalogError.value = String(error)
  } finally {
    catalogLoading.value = false
  }
}

async function refreshCatalog() {
  catalogLoading.value = true
  catalogError.value = null
  try {
    await workspaceStore.refreshMarketplaceCache()
  } catch (error) {
    catalogError.value = String(error)
  } finally {
    catalogLoading.value = false
  }
}

async function togglePlugin(plugin: PluginManifest, enabled: boolean) {
  await workspaceStore.setPluginEnabled(plugin.id, enabled)
  await validatePlugins()
  if (plugin.kind === 'marketplace') await loadCatalog(false)
}

async function runMarketplaceAction(item: MarketplaceCatalogItem, action: MarketplaceAction) {
  if (!canRunMarketplaceAction(item, action)) return
  const manifest = item.manifest
  if (action === 'install' && manifest?.executionMode !== 'sandboxed-worker') {
    const accepted = await confirm(t('settings.plugins.trustWarning', { plugin: catalogTitle(item) }), {
      title: t('settings.plugins.trustWarningTitle'),
      kind: 'warning',
      okLabel: t('settings.plugins.install'),
      cancelLabel: t('common.cancel'),
    })
    if (!accepted) return
  }
  if (
    (action === 'install' || action === 'update')
    && manifest?.executionMode === 'sandboxed-worker'
    && (action === 'install' || expandsPermissions(manifest))
  ) {
    const accepted = await confirm(permissionReviewText(item), {
      title: t('settings.plugins.permissionReviewTitle'),
      kind: 'warning',
      okLabel: t(`settings.plugins.${action}`),
      cancelLabel: t('common.cancel'),
    })
    if (!accepted) return
  }
  loadingPluginId.value = item.pluginId
  try {
    if ((action === 'install' || action === 'update') && !item.permissionFingerprint) {
      throw new Error('Marketplace permission fingerprint is missing')
    }
    if (action === 'install' || action === 'update') {
      await noteStore.saveNote()
    }
    if (action === 'install') {
      await workspaceStore.installMarketplacePlugin(
        item.pluginId,
        item.permissionFingerprint ?? '',
        item.manifest?.version,
      )
    }
    if (action === 'update') {
      await workspaceStore.updateMarketplacePlugin(item.pluginId, item.permissionFingerprint ?? '')
    }
    if (action === 'remove') await workspaceStore.removeMarketplacePlugin(item.pluginId)
    await validatePlugins()
  } catch (error) {
    await appLogger.error({
      source: 'frontend.settings',
      event: `marketplace_${action}_plugin`,
      message: 'Marketplace plugin action failed',
      workspacePath: activePath.value,
      error,
      payload: { pluginId: item.pluginId },
    })
    catalogError.value = String(error)
  } finally {
    loadingPluginId.value = null
  }
}

function toggleSettingsExpanded(pluginId: string) {
  expandedSettings.value[pluginId] = !expandedSettings.value[pluginId]
}

async function openPluginFolder(pluginId: string) {
  const path = pluginPath.value
  if (!path) return
  await systemCommands.openWorkspaceLocation(path, 'plugins', { pluginId })
}

async function openExternalSource(url: string) {
  await systemCommands.openExternalUrl(url)
}

onMounted(async () => {
  await validatePlugins()
  await loadCatalog(false)
})
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-plugins-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.plugins')"
      :description="t('settings.plugins.description')"
    >
      <template #actions>
        <div class="header-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <NvButton variant="ghost" @click="workspaceStore.reloadPlugins()">
            <RefreshCw :size="14" />
            {{ t('settings.plugins.rescan') }}
          </NvButton>
          <NvButton :loading="catalogLoading" :disabled="catalogLoading" @click="refreshCatalog">
            <RefreshCw :size="14" />
            {{ t('settings.plugins.refreshCatalog') }}
          </NvButton>
        </div>
      </template>
    </SettingsSectionHeader>

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <div class="plugin-tabs tw:flex tw:flex-wrap tw:items-center tw:gap-2" role="tablist" :aria-label="t('settings.plugins.tabs.label')">
        <NvButton size="sm" :active="activeTab === 'installed'" role="tab" :aria-selected="activeTab === 'installed'" @click="activeTab = 'installed'">
          {{ t('settings.plugins.tabs.installed', { count: pluginTotalCount }) }}
        </NvButton>
        <NvButton size="sm" :active="activeTab === 'catalog'" role="tab" :aria-selected="activeTab === 'catalog'" @click="activeTab = 'catalog'">
          {{ t('settings.plugins.tabs.catalog', { count: catalogItems.length }) }}
        </NvButton>
      </div>

      <template v-if="activeTab === 'installed'">
        <div class="plugin-metrics tw:grid tw:grid-cols-3 tw:gap-2.5 tw:max-[980px]:grid-cols-1" :aria-label="t('settings.plugins.summary.label')">
          <div class="plugin-metric tw:grid tw:min-w-0 tw:min-h-[58px] tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-3 tw:text-content-muted">
            <PackageCheck :size="15" class="tw:text-accent" aria-hidden="true" />
            <span class="tw:min-w-0 tw:overflow-hidden tw:text-[11.5px] tw:text-ellipsis tw:whitespace-nowrap">{{ t('settings.plugins.summary.installed') }}</span>
            <strong class="tw:text-content-primary tw:text-base tw:font-[650] tw:[overflow-wrap:anywhere]">{{ pluginTotalCount }}</strong>
          </div>
          <div class="plugin-metric tw:grid tw:min-w-0 tw:min-h-[58px] tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-3 tw:text-content-muted">
            <PackageCheck :size="15" class="tw:text-accent" aria-hidden="true" />
            <span class="tw:min-w-0 tw:overflow-hidden tw:text-[11.5px] tw:text-ellipsis tw:whitespace-nowrap">{{ t('settings.plugins.summary.enabled') }}</span>
            <strong class="tw:text-content-primary tw:text-base tw:font-[650] tw:[overflow-wrap:anywhere]">{{ pluginEnabledCount }}</strong>
          </div>
          <div
            class="plugin-metric tw:grid tw:min-w-0 tw:min-h-[58px] tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:p-3 tw:text-content-muted"
            :class="pluginIssueCount ? 'plugin-metric--warning tw:bg-[var(--surface-warning)]' : 'tw:bg-surface-subtle'"
          >
            <AlertTriangle :size="15" :class="pluginIssueCount ? 'tw:text-[var(--warning)]' : 'tw:text-accent'" aria-hidden="true" />
            <span class="tw:min-w-0 tw:overflow-hidden tw:text-[11.5px] tw:text-ellipsis tw:whitespace-nowrap">{{ t('settings.plugins.summary.issues') }}</span>
            <strong class="tw:text-content-primary tw:text-base tw:font-[650] tw:[overflow-wrap:anywhere]">{{ pluginIssueCount }}</strong>
          </div>
        </div>

        <div class="filters tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <span class="nv-chip filter-chip filter-chip--active tw:bg-[var(--accent-soft)] tw:text-accent">{{ t('settings.plugins.filters.all', { count: pluginTotalCount }) }}</span>
          <span class="nv-chip filter-chip">{{ t('settings.plugins.filters.enabled', { count: pluginEnabledCount }) }}</span>
          <span
            class="nv-chip filter-chip"
            :class="pluginIssueCount ? 'filter-chip--warning tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]' : ''"
          >{{ t('settings.plugins.filters.manifestIssues', { count: pluginIssueCount }) }}</span>
        </div>

        <div v-if="orderedPlugins.length" class="plugin-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1">
          <PluginCard
            v-for="plugin in orderedPlugins"
            :key="plugin.id"
            :plugin="plugin"
            :is-valid="pluginValidation[plugin.id] !== 'invalid'"
            :is-expanded="Boolean(expandedSettings[plugin.id])"
            :is-loading="loadingPluginId === plugin.id"
            @toggle="togglePlugin(plugin, $event)"
            @toggle-settings="toggleSettingsExpanded(plugin.id)"
            @open-folder="openPluginFolder(plugin.id)"
            @remove="runMarketplaceAction({ pluginId: plugin.id, pluginPath: `plugins/${plugin.id}`, treeSha: '', status: 'installed', manifest: plugin, manifestError: null, installedVersion: plugin.version, sourceUrl: `https://github.com/eliotBenitez/nevo-marketplace/tree/main/plugins/${plugin.id}`, files: [], permissionFingerprint: null }, 'remove')"
          />
        </div>

        <div v-else class="empty-state tw:grid tw:justify-items-center tw:gap-1.5 tw:px-[18px] tw:py-7 tw:text-center tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-dashed tw:border-[var(--border-default)] tw:bg-transparent">
          <div class="empty-state__title tw:text-content-primary tw:text-sm tw:font-[560]">{{ t('settings.plugins.emptyTitle') }}</div>
          <div class="empty-state__sub tw:mt-1 tw:text-content-muted tw:text-xs">{{ t('settings.plugins.emptyDescription') }}</div>
        </div>
      </template>

      <template v-else>
        <div class="plugin-metrics tw:grid tw:grid-cols-3 tw:gap-2.5 tw:max-[980px]:grid-cols-1" :aria-label="t('settings.plugins.summary.label')">
          <div class="plugin-metric tw:grid tw:min-w-0 tw:min-h-[58px] tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-3 tw:text-content-muted">
            <Download :size="15" class="tw:text-accent" aria-hidden="true" />
            <span class="tw:min-w-0 tw:overflow-hidden tw:text-[11.5px] tw:text-ellipsis tw:whitespace-nowrap">{{ t('settings.plugins.summary.catalog') }}</span>
            <strong class="tw:text-content-primary tw:text-base tw:font-[650] tw:[overflow-wrap:anywhere]">{{ catalogItems.length }}</strong>
          </div>
          <div
            class="plugin-metric tw:grid tw:min-w-0 tw:min-h-[58px] tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:p-3 tw:text-content-muted"
            :class="invalidCatalogCount ? 'plugin-metric--warning tw:bg-[var(--surface-warning)]' : 'tw:bg-surface-subtle'"
          >
            <AlertTriangle :size="15" :class="invalidCatalogCount ? 'tw:text-[var(--warning)]' : 'tw:text-accent'" aria-hidden="true" />
            <span class="tw:min-w-0 tw:overflow-hidden tw:text-[11.5px] tw:text-ellipsis tw:whitespace-nowrap">{{ t('settings.plugins.summary.issues') }}</span>
            <strong class="tw:text-content-primary tw:text-base tw:font-[650] tw:[overflow-wrap:anywhere]">{{ invalidCatalogCount }}</strong>
          </div>
          <div class="plugin-metric tw:grid tw:min-w-0 tw:min-h-[58px] tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-3 tw:text-content-muted">
            <RefreshCw :size="15" class="tw:text-accent" aria-hidden="true" />
            <span class="tw:min-w-0 tw:overflow-hidden tw:text-[11.5px] tw:text-ellipsis tw:whitespace-nowrap">{{ t('settings.plugins.summary.cache') }}</span>
            <strong class="tw:text-content-primary tw:text-base tw:font-[650] tw:[overflow-wrap:anywhere]">{{ marketplaceCatalog?.fromCache ? t('settings.common.on') : t('settings.common.off') }}</strong>
          </div>
        </div>

        <div class="filters tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <span class="nv-chip filter-chip filter-chip--active tw:bg-[var(--accent-soft)] tw:text-accent">{{ t('settings.plugins.marketplace') }} · {{ catalogItems.length }}</span>
          <span
            class="nv-chip filter-chip"
            :class="invalidCatalogCount ? 'filter-chip--warning tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]' : ''"
          >{{ t('settings.plugins.filters.manifestIssues', { count: invalidCatalogCount }) }}</span>
          <span v-if="marketplaceCatalog?.fromCache" class="status-chip status-chip--info tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold tw:bg-[var(--hover-strong)] tw:text-content-muted">{{ t('settings.plugins.cacheNotice') }}</span>
          <span v-if="catalogError || marketplaceCatalog?.error" class="status-chip status-chip--coming tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]">{{ catalogError || marketplaceCatalog?.error }}</span>
        </div>

        <div v-if="catalogLoading && !catalogItems.length" class="empty-state tw:grid tw:justify-items-center tw:gap-1.5 tw:px-[18px] tw:py-7 tw:text-center tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-dashed tw:border-[var(--border-default)] tw:bg-transparent">
          <RefreshCw :size="24" class="empty-state__icon plugin-loading-icon tw:text-content-muted" aria-hidden="true" />
          <div class="empty-state__title tw:text-content-primary tw:text-sm tw:font-[560]">{{ t('settings.plugins.catalogLoading') }}</div>
          <div class="empty-state__sub tw:mt-1 tw:text-content-muted tw:text-xs">{{ t('settings.plugins.catalogLoadingDescription') }}</div>
        </div>

        <div v-else-if="catalogItems.length" class="plugin-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1">
          <PluginCatalogCard
            v-for="item in catalogItems"
            :key="item.pluginId"
            :item="item"
            :is-loading="loadingPluginId === item.pluginId"
            :can-install="canRunMarketplaceAction(item, 'install')"
            :can-update="canRunMarketplaceAction(item, 'update')"
            :can-remove="canRunMarketplaceAction(item, 'remove')"
            @install="runMarketplaceAction(item, 'install')"
            @update="runMarketplaceAction(item, 'update')"
            @remove="runMarketplaceAction(item, 'remove')"
            @open-source="openExternalSource(item.sourceUrl)"
          />
        </div>

        <div v-else class="empty-state tw:grid tw:justify-items-center tw:gap-1.5 tw:px-[18px] tw:py-7 tw:text-center tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-dashed tw:border-[var(--border-default)] tw:bg-transparent">
          <Download :size="24" class="empty-state__icon tw:text-content-muted" aria-hidden="true" />
          <div class="empty-state__title tw:text-content-primary tw:text-sm tw:font-[560]">{{ t('settings.plugins.catalogEmptyTitle') }}</div>
          <div class="empty-state__sub tw:mt-1 tw:text-content-muted tw:text-xs">{{ t('settings.plugins.catalogEmptyDescription') }}</div>
        </div>
      </template>
    </div>
  </section>
</template>
