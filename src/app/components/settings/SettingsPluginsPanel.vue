<script setup lang="ts">
import { computed, markRaw, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { confirm } from '@tauri-apps/plugin-dialog'
import { AlertTriangle, BarChart3, Download, ExternalLink, FolderOpen, Github, Kanban, LayoutTemplate, Network, PackageCheck, RefreshCw, Settings, Trash2 } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../../stores/workspace'
import { systemCommands, workspaceCommands } from '../../../tauri/commands'
import type { MarketplaceCatalogItem, MarketplacePluginStatus, PluginManifest } from '../../../types/workspace'
import { getEnabledPluginCount, getTotalPluginCount } from '../../../utils/plugin-counts'
import { isSystemPluginId, SYSTEM_PLUGIN_SHORT_IDS, sortPluginsByKind } from '../../../utils/system-plugins'
import { appLogger } from '../../../utils/logger'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import PluginSettingsForm from './PluginSettingsForm.vue'
import GithubSyncActions from './GithubSyncActions.vue'

type RowState = 'functional' | 'info' | 'coming'
type PanelTab = 'installed' | 'catalog'
type MarketplaceAction = 'install' | 'update' | 'remove'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { plugins, activePath, marketplaceCatalog } = storeToRefs(workspaceStore)

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

const systemPluginIcons: Record<string, Component> = {
  'nevo.kanban': markRaw(Kanban),
  'nevo.templates': markRaw(LayoutTemplate),
  'nevo.vega': markRaw(BarChart3),
  'nevo.markmap': markRaw(Network),
  'nevo.github-sync': markRaw(Github),
}

function pluginTitle(plugin: PluginManifest): string {
  if (!isSystemPluginId(plugin.id)) return plugin.name
  return t(`settings.plugins.${SYSTEM_PLUGIN_SHORT_IDS[plugin.id]}.title`)
}

function pluginDescription(plugin: PluginManifest): string {
  if (!isSystemPluginId(plugin.id)) return plugin.description || t('settings.plugins.noDescription')
  return t(`settings.plugins.${SYSTEM_PLUGIN_SHORT_IDS[plugin.id]}.description`)
}

function pluginIcon(plugin: PluginManifest): Component | null {
  return systemPluginIcons[plugin.id] ?? null
}

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

function catalogDescription(item: MarketplaceCatalogItem): string {
  return catalogManifest(item)?.description || item.manifestError || t('settings.plugins.noDescription')
}

function statusLabel(status: MarketplacePluginStatus): string {
  return t(`settings.plugins.marketplaceStatus.${status}`)
}

function statusState(status: MarketplacePluginStatus): RowState {
  if (status === 'installed' || status === 'disabled') return 'functional'
  if (status === 'notInstalled') return 'info'
  return 'coming'
}

function stateClass(state: RowState): string {
  if (state === 'functional') return 'status-chip--functional'
  if (state === 'coming') return 'status-chip--coming'
  return 'status-chip--info'
}

function canRunMarketplaceAction(item: MarketplaceCatalogItem, action: MarketplaceAction): boolean {
  if (loadingPluginId.value === item.pluginId || item.status === 'invalid' || item.status === 'conflict') return false
  if (action === 'install') return item.status === 'notInstalled'
  if (action === 'update') return item.status === 'updateAvailable'
  return item.status === 'installed' || item.status === 'disabled' || item.status === 'updateAvailable'
}

async function validatePlugins() {
  if (!activePath.value) return
  const next: Record<string, 'valid' | 'invalid'> = {}
  for (const plugin of plugins.value) {
    try {
      await workspaceCommands.validatePluginManifest(activePath.value, plugin.id)
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
  if (!activePath.value) return
  await systemCommands.openWorkspaceLocation(activePath.value, 'plugins', { pluginId })
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
  <section class="panel settings-plugins-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.plugins') }}</h2>
        <p class="panel-sub">{{ t('settings.plugins.description') }}</p>
      </div>
      <div class="header-actions">
        <NvButton @click="workspaceStore.reloadPlugins()">
          <RefreshCw :size="14" />
          {{ t('settings.plugins.rescan') }}
        </NvButton>
        <NvButton :loading="catalogLoading" :disabled="catalogLoading" @click="refreshCatalog">
          <RefreshCw :size="14" />
          {{ t('settings.plugins.refreshCatalog') }}
        </NvButton>
      </div>
    </header>

    <div class="panel-body">
      <div class="plugin-tabs" role="tablist" :aria-label="t('settings.plugins.tabs.label')">
        <NvButton size="sm" :active="activeTab === 'installed'" role="tab" :aria-selected="activeTab === 'installed'" @click="activeTab = 'installed'">
          {{ t('settings.plugins.tabs.installed', { count: pluginTotalCount }) }}
        </NvButton>
        <NvButton size="sm" :active="activeTab === 'catalog'" role="tab" :aria-selected="activeTab === 'catalog'" @click="activeTab = 'catalog'">
          {{ t('settings.plugins.tabs.catalog', { count: catalogItems.length }) }}
        </NvButton>
      </div>

      <template v-if="activeTab === 'installed'">
        <div class="plugin-metrics" :aria-label="t('settings.plugins.summary.label')">
          <div class="plugin-metric">
            <PackageCheck :size="15" aria-hidden="true" />
            <span>{{ t('settings.plugins.summary.installed') }}</span>
            <strong>{{ pluginTotalCount }}</strong>
          </div>
          <div class="plugin-metric">
            <PackageCheck :size="15" aria-hidden="true" />
            <span>{{ t('settings.plugins.summary.enabled') }}</span>
            <strong>{{ pluginEnabledCount }}</strong>
          </div>
          <div class="plugin-metric" :class="{ 'plugin-metric--warning': pluginIssueCount }">
            <AlertTriangle :size="15" aria-hidden="true" />
            <span>{{ t('settings.plugins.summary.issues') }}</span>
            <strong>{{ pluginIssueCount }}</strong>
          </div>
        </div>

        <div class="filters">
          <span class="nv-chip filter-chip filter-chip--active">{{ t('settings.plugins.filters.all', { count: pluginTotalCount }) }}</span>
          <span class="nv-chip filter-chip">{{ t('settings.plugins.filters.enabled', { count: pluginEnabledCount }) }}</span>
          <span class="nv-chip filter-chip" :class="{ 'filter-chip--warning': pluginIssueCount }">{{ t('settings.plugins.filters.manifestIssues', { count: pluginIssueCount }) }}</span>
        </div>

        <div v-if="orderedPlugins.length" class="plugin-grid">
          <article
            v-for="plugin in orderedPlugins"
            :key="plugin.id"
            class="plugin-card"
            :class="{ 'plugin-card--issue': pluginValidation[plugin.id] === 'invalid' }"
          >
            <div class="plugin-card__icon" :class="{ 'plugin-card__icon--system': plugin.kind === 'system' }">
              <component :is="pluginIcon(plugin)" v-if="pluginIcon(plugin)" :size="16" />
              <span v-else>{{ plugin.name.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="plugin-card__body">
              <div class="plugin-card__head">
                <div>
                  <div class="plugin-card__title">
                    {{ pluginTitle(plugin) }}
                    <span class="plugin-card__version">{{ plugin.kind === 'system' ? t('settings.plugins.builtIn') : `v${plugin.version}` }}</span>
                  </div>
                  <div class="plugin-card__author">
                    {{ plugin.id }} · {{ plugin.source ?? 'folder' }} ·
                    {{ t(`settings.plugins.execution.${plugin.executionMode === 'sandboxed-worker' ? 'sandboxed' : 'trusted'}`) }}
                  </div>
                </div>
                <NvToggle
                  :model-value="plugin.enabled"
                  @update:model-value="v => togglePlugin(plugin, v)"
                />
              </div>

              <p class="plugin-card__desc">{{ pluginDescription(plugin) }}</p>

              <div class="capability-row">
                <span v-if="!capabilityList(plugin).length" class="capability-chip">{{ t('settings.plugins.noPermissions') }}</span>
                <span v-for="capability in capabilityList(plugin)" :key="capability" class="capability-chip">{{ capability }}</span>
              </div>

              <div class="plugin-card__footer">
                <NvButton variant="ghost" size="xs" @click="openPluginFolder(plugin.id)">
                  <FolderOpen :size="13" />
                  {{ t('settings.plugins.source') }}
                </NvButton>
                <NvButton
                  v-if="plugin.settingsSchema?.length"
                  variant="ghost"
                  size="xs"
                  :active="expandedSettings[plugin.id]"
                  @click="toggleSettingsExpanded(plugin.id)"
                >
                  <Settings :size="13" />
                  {{ expandedSettings[plugin.id] ? t('settings.plugins.settings.hide') : t('settings.plugins.settings.configure') }}
                </NvButton>
                <NvButton
                  v-if="plugin.kind === 'marketplace'"
                  variant="ghost"
                  size="xs"
                  :disabled="loadingPluginId === plugin.id"
                  :loading="loadingPluginId === plugin.id"
                  @click="runMarketplaceAction({ pluginId: plugin.id, pluginPath: `plugins/${plugin.id}`, treeSha: '', status: 'installed', manifest: plugin, manifestError: null, installedVersion: plugin.version, sourceUrl: `https://github.com/eliotBenitez/nevo-marketplace/tree/main/plugins/${plugin.id}`, files: [], permissionFingerprint: null }, 'remove')"
                >
                  <Trash2 :size="13" />
                  {{ t('settings.plugins.remove') }}
                </NvButton>
                <div class="spacer" />
                <span class="status-chip" :class="stateClass(pluginValidation[plugin.id] === 'invalid' ? 'coming' : 'functional')">
                  {{ pluginValidation[plugin.id] === 'invalid' ? t('settings.plugins.manifestIssue') : t('settings.plugins.manifestValid') }}
                </span>
              </div>

              <template v-if="plugin.settingsSchema?.length && expandedSettings[plugin.id]">
                <PluginSettingsForm :plugin="plugin" />
                <GithubSyncActions v-if="plugin.id === 'nevo.github-sync'" :plugin="plugin" />
              </template>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <div class="empty-state__title">{{ t('settings.plugins.emptyTitle') }}</div>
          <div class="empty-state__sub">{{ t('settings.plugins.emptyDescription') }}</div>
        </div>
      </template>

      <template v-else>
        <div class="plugin-metrics" :aria-label="t('settings.plugins.summary.label')">
          <div class="plugin-metric">
            <Download :size="15" aria-hidden="true" />
            <span>{{ t('settings.plugins.summary.catalog') }}</span>
            <strong>{{ catalogItems.length }}</strong>
          </div>
          <div class="plugin-metric" :class="{ 'plugin-metric--warning': invalidCatalogCount }">
            <AlertTriangle :size="15" aria-hidden="true" />
            <span>{{ t('settings.plugins.summary.issues') }}</span>
            <strong>{{ invalidCatalogCount }}</strong>
          </div>
          <div class="plugin-metric">
            <RefreshCw :size="15" aria-hidden="true" />
            <span>{{ t('settings.plugins.summary.cache') }}</span>
            <strong>{{ marketplaceCatalog?.fromCache ? t('settings.common.on') : t('settings.common.off') }}</strong>
          </div>
        </div>

        <div class="filters">
          <span class="nv-chip filter-chip filter-chip--active">{{ t('settings.plugins.marketplace') }} · {{ catalogItems.length }}</span>
          <span class="nv-chip filter-chip" :class="{ 'filter-chip--warning': invalidCatalogCount }">{{ t('settings.plugins.filters.manifestIssues', { count: invalidCatalogCount }) }}</span>
          <span v-if="marketplaceCatalog?.fromCache" class="status-chip status-chip--info">{{ t('settings.plugins.cacheNotice') }}</span>
          <span v-if="catalogError || marketplaceCatalog?.error" class="status-chip status-chip--coming">{{ catalogError || marketplaceCatalog?.error }}</span>
        </div>

        <div v-if="catalogLoading && !catalogItems.length" class="empty-state">
          <RefreshCw :size="24" class="empty-state__icon plugin-loading-icon" aria-hidden="true" />
          <div class="empty-state__title">{{ t('settings.plugins.catalogLoading') }}</div>
          <div class="empty-state__sub">{{ t('settings.plugins.catalogLoadingDescription') }}</div>
        </div>

        <div v-else-if="catalogItems.length" class="plugin-grid">
          <article
            v-for="item in catalogItems"
            :key="item.pluginId"
            class="plugin-card"
            :class="{ 'plugin-card--issue': item.status === 'invalid' || item.status === 'conflict' }"
          >
            <div class="plugin-card__icon">
              <Download :size="16" />
            </div>
            <div class="plugin-card__body">
              <div class="plugin-card__head">
                <div>
                  <div class="plugin-card__title">
                    {{ catalogTitle(item) }}
                    <span v-if="item.manifest" class="plugin-card__version">v{{ item.manifest.version }}</span>
                  </div>
                  <div class="plugin-card__author">
                    {{ item.pluginId }}
                    <template v-if="item.installedVersion"> · {{ t('settings.plugins.installedVersion', { version: item.installedVersion }) }}</template>
                  </div>
                </div>
                <span class="status-chip" :class="stateClass(statusState(item.status))">{{ statusLabel(item.status) }}</span>
              </div>

              <p class="plugin-card__desc">{{ catalogDescription(item) }}</p>

              <div class="capability-row">
                <span v-if="!catalogCapabilities(item).length" class="capability-chip">{{ t('settings.plugins.noPermissions') }}</span>
                <span v-for="capability in catalogCapabilities(item)" :key="capability" class="capability-chip">{{ capability }}</span>
                <span v-for="host in catalogDomains(item)" :key="`network:${host}`" class="capability-chip">HTTPS {{ host }}</span>
              </div>

              <div class="plugin-card__footer">
                <NvButton
                  v-if="item.status === 'notInstalled'"
                  variant="primary"
                  size="xs"
                  :disabled="!canRunMarketplaceAction(item, 'install')"
                  :loading="loadingPluginId === item.pluginId"
                  @click="runMarketplaceAction(item, 'install')"
                >
                  <Download :size="13" />
                  {{ t('settings.plugins.install') }}
                </NvButton>
                <NvButton
                  v-if="item.status === 'updateAvailable'"
                  variant="primary"
                  size="xs"
                  :disabled="!canRunMarketplaceAction(item, 'update')"
                  :loading="loadingPluginId === item.pluginId"
                  @click="runMarketplaceAction(item, 'update')"
                >
                  <RefreshCw :size="13" />
                  {{ t('settings.plugins.update') }}
                </NvButton>
                <NvButton
                  v-if="item.status === 'installed' || item.status === 'disabled' || item.status === 'updateAvailable'"
                  variant="ghost"
                  size="xs"
                  :disabled="!canRunMarketplaceAction(item, 'remove')"
                  :loading="loadingPluginId === item.pluginId"
                  @click="runMarketplaceAction(item, 'remove')"
                >
                  <Trash2 :size="13" />
                  {{ t('settings.plugins.remove') }}
                </NvButton>
                <NvButton variant="ghost" size="xs" @click="openExternalSource(item.sourceUrl)">
                  <ExternalLink :size="13" />
                  {{ t('settings.plugins.openSource') }}
                </NvButton>
              </div>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <Download :size="24" class="empty-state__icon" aria-hidden="true" />
          <div class="empty-state__title">{{ t('settings.plugins.catalogEmptyTitle') }}</div>
          <div class="empty-state__sub">{{ t('settings.plugins.catalogEmptyDescription') }}</div>
        </div>
      </template>
    </div>
  </section>
</template>
