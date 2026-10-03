<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, ExternalLink, RefreshCw, Trash2 } from 'lucide-vue-next'
import type { MarketplaceCatalogItem, MarketplacePluginStatus, PluginManifest } from '../../../../types/workspace'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import SettingsObjectCard from '../ui/SettingsObjectCard.vue'

type RowState = 'functional' | 'info' | 'coming'

const props = defineProps<{
  item: MarketplaceCatalogItem
  isLoading: boolean
  canInstall: boolean
  canUpdate: boolean
  canRemove: boolean
}>()

const emit = defineEmits<{
  (e: 'install'): void
  (e: 'update'): void
  (e: 'remove'): void
  (e: 'openSource'): void
}>()

const { t } = useI18n()

function catalogManifest(item: MarketplaceCatalogItem): PluginManifest | null {
  return item.manifest
}

const title = computed(() => catalogManifest(props.item)?.name ?? props.item.pluginId)

const description = computed(() => (
  catalogManifest(props.item)?.description || props.item.manifestError || t('settings.plugins.noDescription')
))

const capabilities = computed(() => {
  const manifest = catalogManifest(props.item)
  if (!manifest) return []
  if (manifest.executionMode === 'sandboxed-worker') {
    return (manifest.capabilities ?? []).slice(0, 6)
  }
  return [
    ...manifest.editorCapabilities,
    ...(manifest.uiCapabilities ?? []),
    ...(manifest.workspaceCapabilities ?? []),
  ].slice(0, 6)
})

const domains = computed(() => props.item.manifest?.network?.hosts ?? [])

function statusLabel(status: MarketplacePluginStatus): string {
  return t(`settings.plugins.marketplaceStatus.${status}`)
}

function statusState(status: MarketplacePluginStatus): RowState {
  if (status === 'installed' || status === 'disabled') return 'functional'
  if (status === 'notInstalled') return 'info'
  return 'coming'
}

function stateClass(state: RowState): string {
  if (state === 'functional') return 'status-chip--functional tw:bg-[var(--accent-soft)] tw:text-accent'
  if (state === 'coming') return 'status-chip--coming tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]'
  return 'status-chip--info tw:bg-[var(--hover-strong)] tw:text-content-muted'
}

const isIssue = computed(() => props.item.status === 'invalid' || props.item.status === 'conflict')
</script>

<template>
  <SettingsObjectCard
    class="plugin-card"
    :tone="isIssue ? 'warning' : 'default'"
  >
    <template #icon>
      <div class="plugin-card__icon tw:grid tw:size-9 tw:place-items-center tw:rounded-[calc(10px*var(--radius-scale,1))] tw:bg-accent tw:text-content-on-accent tw:[font-family:var(--font-serif)] tw:italic">
        <Download :size="16" />
      </div>
    </template>

    <div class="plugin-card__head tw:flex tw:items-start tw:justify-between tw:gap-3">
      <div>
        <div class="plugin-card__title tw:text-content-primary tw:text-[13.5px] tw:font-[560] tw:[overflow-wrap:anywhere]">
          {{ title }}
          <span v-if="item.manifest" class="plugin-card__version tw:text-content-muted tw:text-[11px] tw:font-nv-mono">v{{ item.manifest.version }}</span>
        </div>
        <div class="plugin-card__author tw:mt-0.5 tw:text-content-muted tw:text-[11px] tw:font-nv-mono">
          {{ item.pluginId }}
          <template v-if="item.installedVersion"> · {{ t('settings.plugins.installedVersion', { version: item.installedVersion }) }}</template>
        </div>
      </div>
    </div>

    <p class="plugin-card__desc tw:mt-2 tw:mb-0 tw:text-content-muted tw:text-xs tw:leading-[1.5] tw:[overflow-wrap:anywhere]">{{ description }}</p>

    <div class="capability-row tw:mt-2.5 tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span v-if="!capabilities.length" class="capability-chip tw:inline-flex tw:min-h-[18px] tw:max-w-full tw:items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:px-1.5 tw:text-content-muted tw:text-[10.5px] tw:font-medium tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ t('settings.plugins.noPermissions') }}</span>
      <span v-for="cap in capabilities" :key="cap" class="capability-chip tw:inline-flex tw:min-h-[18px] tw:max-w-full tw:items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:px-1.5 tw:text-content-muted tw:text-[10.5px] tw:font-medium tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ cap }}</span>
      <span v-for="host in domains" :key="`network:${host}`" class="capability-chip tw:inline-flex tw:min-h-[18px] tw:max-w-full tw:items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:px-1.5 tw:text-content-muted tw:text-[10.5px] tw:font-medium tw:font-nv-mono tw:[overflow-wrap:anywhere]">HTTPS {{ host }}</span>
    </div>

    <div class="plugin-card__footer tw:mt-2.5 tw:flex tw:flex-wrap tw:items-center tw:gap-2.5">
      <NvButton
        v-if="item.status === 'notInstalled'"
        variant="primary"
        size="xs"
        :disabled="!canInstall"
        :loading="isLoading"
        @click="emit('install')"
      >
        <Download :size="13" />
        {{ t('settings.plugins.install') }}
      </NvButton>
      <NvButton
        v-if="item.status === 'updateAvailable'"
        variant="primary"
        size="xs"
        :disabled="!canUpdate"
        :loading="isLoading"
        @click="emit('update')"
      >
        <RefreshCw :size="13" />
        {{ t('settings.plugins.update') }}
      </NvButton>
      <NvButton
        v-if="item.status === 'installed' || item.status === 'disabled' || item.status === 'updateAvailable'"
        variant="ghost"
        size="xs"
        :disabled="!canRemove"
        :loading="isLoading"
        @click="emit('remove')"
      >
        <Trash2 :size="13" />
        {{ t('settings.plugins.remove') }}
      </NvButton>
      <NvButton variant="ghost" size="xs" @click="emit('openSource')">
        <ExternalLink :size="13" />
        {{ t('settings.plugins.openSource') }}
      </NvButton>
    </div>

    <template #actions>
      <span class="status-chip tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold" :class="stateClass(statusState(item.status))">{{ statusLabel(item.status) }}</span>
    </template>
  </SettingsObjectCard>
</template>
