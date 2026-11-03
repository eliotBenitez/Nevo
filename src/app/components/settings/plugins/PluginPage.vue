<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Download, ExternalLink, FolderOpen, RefreshCw, Settings, Trash2 } from '../../../../ui/icons'
import type { ChatBlock } from '../../../../core/ai-chat/markdown'
import type { MarketplaceCatalogItem, MarketplacePluginStatus, PluginManifest } from '../../../../types/workspace'
import type { ReadmeStatus } from '../../../composables/settings/usePluginReadme'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import AiChatMarkdown from '../../ai-chat/AiChatMarkdown.vue'
import { pluginCapabilities, pluginDescription, pluginTitle, systemPluginIcons } from './pluginDisplay'

const props = defineProps<{
  /** Manifest to describe: the installed one, else the catalog item's. */
  manifest: PluginManifest | null
  catalogItem: MarketplaceCatalogItem | null
  /** Installed manifest, when the plugin is installed. */
  installed: PluginManifest | null
  isValid: boolean
  isLoading: boolean
  isAvailableOnDevice: boolean
  canInstall: boolean
  canUpdate: boolean
  canRemove: boolean
  readmeStatus: ReadmeStatus
  readmeBlocks: ChatBlock[]
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'toggle', enabled: boolean): void
  (e: 'openSettings'): void
  (e: 'openFolder'): void
  (e: 'openSource'): void
  (e: 'install'): void
  (e: 'update'): void
  (e: 'remove'): void
  (e: 'retryReadme'): void
}>()

const { t } = useI18n()
const titleRef = ref<HTMLElement | null>(null)
onMounted(() => titleRef.value?.focus())

const chip = 'status-chip tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold'
const capChip = 'capability-chip tw:inline-flex tw:min-h-[18px] tw:max-w-full tw:items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:px-1.5 tw:text-content-muted tw:text-[10.5px] tw:font-medium tw:font-nv-mono tw:[overflow-wrap:anywhere]'
const warnChip = `${chip} tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]`
const factHead = 'tw:m-0 tw:mb-2 tw:text-xs tw:font-semibold tw:text-content-secondary'
const factTerm = 'tw:text-[11.5px] tw:text-content-muted'
const factValue = 'tw:m-0 tw:text-[12.5px] tw:text-content-primary'

const pluginId = computed(() => props.manifest?.id ?? props.catalogItem?.pluginId ?? '')
const title = computed(() => (props.manifest ? pluginTitle(props.manifest, t) : pluginId.value))
const description = computed(() => (
  props.manifest ? pluginDescription(props.manifest, t) : props.catalogItem?.manifestError || t('settings.plugins.noDescription')
))
const icon = computed(() => (props.manifest ? systemPluginIcons[props.manifest.id] ?? null : null))
const initial = computed(() => (props.manifest?.name ?? pluginId.value).charAt(0).toUpperCase())
const source = computed(() => props.manifest?.source ?? (props.catalogItem ? 'marketplace' : 'folder'))
const installedVersion = computed(() => {
  const version = props.catalogItem?.installedVersion
  return version && version !== props.manifest?.version ? version : null
})
const capabilities = computed(() => (props.manifest ? pluginCapabilities(props.manifest) : []))
const hosts = computed(() => props.manifest?.network?.hosts ?? [])
const methods = computed(() => props.manifest?.network?.methods ?? [])
const runtimes = computed(() => props.manifest?.runtimes ?? [])
const executionKey = computed(() => (props.manifest?.executionMode === 'sandboxed-worker' ? 'sandboxed' : 'trusted'))
type InlineLike = { kind: string; value?: string; children?: InlineLike[] }
const inlineText = (nodes: InlineLike[]): string => nodes.map(node => node.value ?? inlineText(node.children ?? [])).join('')
// READMEs usually open with the plugin name as a heading; the hero already shows it.
const readmeContent = computed(() => {
  const [first, ...rest] = props.readmeBlocks
  const repeatsTitle = first?.kind === 'heading'
    && inlineText(first.children).trim().toLowerCase() === title.value.trim().toLowerCase()
  return repeatsTitle ? rest : props.readmeBlocks
})
const status = computed<MarketplacePluginStatus | null>(() => props.catalogItem?.status ?? null)
const showUpdate = computed(() => status.value === 'updateAvailable')
const showCatalogRemove = computed(() => status.value === 'installed' || status.value === 'disabled' || status.value === 'updateAvailable')
const statusClass = computed(() => {
  if (status.value === 'installed' || status.value === 'disabled') return 'tw:bg-[var(--accent-soft)] tw:text-accent'
  if (status.value === 'notInstalled') return 'tw:bg-[var(--hover-strong)] tw:text-content-muted'
  return 'tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]'
})
</script>

<template>
  <div class="plugin-page tw:flex tw:flex-col tw:gap-7">
    <div>
      <NvButton variant="ghost" size="sm" @click="emit('back')">
        <ArrowLeft :size="14" aria-hidden="true" />
        {{ t('settings.plugins.page.back') }}
      </NvButton>
    </div>

    <header class="plugin-page__hero tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-x-6 tw:gap-y-4">
      <div class="tw:flex tw:min-w-0 tw:flex-1 tw:basis-[320px] tw:items-start tw:gap-3.5">
        <div class="plugin-card__icon tw:grid tw:size-12 tw:shrink-0 tw:place-items-center tw:rounded-[calc(10px*var(--radius-scale,1))] tw:bg-accent tw:text-content-on-accent tw:[font-family:var(--font-serif)] tw:italic" :class="{ 'plugin-card__icon--system': manifest?.kind === 'system' }">
          <component :is="icon" v-if="icon" :size="20" />
          <Download v-else-if="!installed" :size="20" />
          <span v-else class="tw:text-lg">{{ initial }}</span>
        </div>
        <div class="tw:min-w-0">
          <h3 ref="titleRef" tabindex="-1" class="plugin-page__title tw:m-0 tw:text-lg tw:font-[650] tw:tracking-[-0.015em] tw:text-content-primary tw:outline-none tw:[overflow-wrap:anywhere]">{{ title }}</h3>
          <div class="plugin-page__meta tw:mt-1 tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono tw:[overflow-wrap:anywhere]">
            {{ pluginId }}<template v-if="manifest"> · v{{ manifest.version }}</template> · {{ source }}<template v-if="installedVersion"> · {{ t('settings.plugins.installedVersion', { version: installedVersion }) }}</template>
          </div>
          <p class="plugin-page__desc tw:mt-2 tw:mb-0 tw:max-w-[62ch] tw:text-[13.5px] tw:text-content-secondary tw:[overflow-wrap:anywhere]">{{ description }}</p>
          <div v-if="!isAvailableOnDevice || !isValid || status" class="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
            <span v-if="!isAvailableOnDevice" :class="warnChip">{{ t('settings.plugins.unavailableOnDevice') }}</span>
            <span v-if="!isValid" :class="warnChip">{{ t('settings.plugins.manifestIssue') }}</span>
            <span v-if="status" :class="[chip, statusClass]">{{ t(`settings.plugins.marketplaceStatus.${status}`) }}</span>
          </div>
        </div>
      </div>

      <div class="plugin-page__actions tw:flex tw:flex-wrap tw:items-center tw:gap-2.5">
        <template v-if="installed">
          <NvToggle
            :label="t('settings.plugins.page.enabled')"
            :model-value="installed.enabled"
            @update:model-value="emit('toggle', $event)"
          />
          <NvButton v-if="showUpdate" variant="primary" :disabled="!canUpdate" :loading="isLoading" @click="emit('update')">
            <RefreshCw :size="14" />
            {{ t('settings.plugins.update') }}
          </NvButton>
          <NvButton v-if="installed.settingsSchema?.length" @click="emit('openSettings')">
            <Settings :size="14" />
            {{ t('settings.plugins.settings.configure') }}
          </NvButton>
          <NvButton variant="ghost" @click="emit('openFolder')">
            <FolderOpen :size="14" />
            {{ t('settings.plugins.source') }}
          </NvButton>
          <NvButton v-if="installed.kind === 'marketplace'" variant="ghost" :disabled="!canRemove" :loading="isLoading" @click="emit('remove')">
            <Trash2 :size="14" />
            {{ t('settings.plugins.remove') }}
          </NvButton>
        </template>
        <template v-else>
          <NvButton v-if="status === 'notInstalled'" variant="primary" :disabled="!canInstall" :loading="isLoading" @click="emit('install')">
            <Download :size="14" />
            {{ t('settings.plugins.install') }}
          </NvButton>
          <NvButton v-if="showUpdate" variant="primary" :disabled="!canUpdate" :loading="isLoading" @click="emit('update')">
            <RefreshCw :size="14" />
            {{ t('settings.plugins.update') }}
          </NvButton>
          <NvButton v-if="showCatalogRemove" variant="ghost" :disabled="!canRemove" :loading="isLoading" @click="emit('remove')">
            <Trash2 :size="14" />
            {{ t('settings.plugins.remove') }}
          </NvButton>
          <NvButton variant="ghost" @click="emit('openSource')">
            <ExternalLink :size="14" />
            {{ t('settings.plugins.openSource') }}
          </NvButton>
        </template>
      </div>
    </header>

    <div class="plugin-page__body tw:grid tw:grid-cols-1 tw:items-start tw:gap-8 tw:min-[980px]:grid-cols-[minmax(0,1fr)_248px]">
      <section class="plugin-page__readme tw:order-2 tw:min-w-0 tw:min-[980px]:order-1">
        <div v-if="readmeStatus === 'loading' || readmeStatus === 'idle'" class="tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-content-muted" role="status">
          <RefreshCw :size="14" class="plugin-loading-icon" aria-hidden="true" />
          {{ t('settings.plugins.page.readmeLoading') }}
        </div>
        <p v-else-if="readmeStatus === 'empty'" class="tw:m-0 tw:text-[13px] tw:text-content-muted">{{ t('settings.plugins.page.readmeEmpty') }}</p>
        <div v-else-if="readmeStatus === 'error'" class="tw:flex tw:flex-wrap tw:items-center tw:gap-2.5 tw:text-[13px] tw:text-content-muted">
          <span>{{ t('settings.plugins.page.readmeError') }}</span>
          <NvButton variant="ghost" size="xs" @click="emit('retryReadme')">{{ t('settings.plugins.page.retry') }}</NvButton>
        </div>
        <div v-else class="plugin-readme">
          <AiChatMarkdown :blocks="readmeContent" :sources="[]" />
        </div>
      </section>

      <aside class="plugin-page__facts tw:order-1 tw:flex tw:min-w-0 tw:flex-col tw:gap-5 tw:min-[980px]:sticky tw:min-[980px]:top-0 tw:min-[980px]:order-2">
        <section>
          <h4 :class="factHead">{{ t('settings.plugins.page.facts.details') }}</h4>
          <dl class="tw:m-0 tw:flex tw:flex-col tw:gap-2">
            <div v-if="manifest">
              <dt :class="factTerm">{{ t('settings.plugins.page.facts.version') }}</dt>
              <dd :class="[factValue, 'tw:font-nv-mono']">{{ manifest.version }}</dd>
            </div>
            <div v-if="installedVersion">
              <dt :class="factTerm">{{ t('settings.plugins.page.facts.installedVersion') }}</dt>
              <dd :class="[factValue, 'tw:font-nv-mono']">{{ installedVersion }}</dd>
            </div>
            <div>
              <dt :class="factTerm">{{ t('settings.plugins.page.facts.source') }}</dt>
              <dd :class="[factValue, 'tw:font-nv-mono']">{{ source }}</dd>
            </div>
            <div v-if="manifest">
              <dt :class="factTerm">{{ t('settings.plugins.page.facts.execution') }}</dt>
              <dd :class="factValue">{{ t(`settings.plugins.execution.${executionKey}`) }}</dd>
            </div>
            <div v-if="manifest?.dataVersion != null">
              <dt :class="factTerm">{{ t('settings.plugins.page.facts.dataVersion') }}</dt>
              <dd :class="[factValue, 'tw:font-nv-mono']">{{ manifest.dataVersion }}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h4 :class="factHead">{{ t('settings.plugins.page.facts.devices') }}</h4>
          <div v-if="runtimes.length" class="tw:flex tw:flex-wrap tw:gap-1.5">
            <span v-for="runtime in runtimes" :key="runtime" :class="capChip">{{ t(`settings.plugins.page.runtimes.${runtime}`) }}</span>
          </div>
          <p v-else :class="factValue">{{ t('settings.plugins.page.runtimes.all') }}</p>
        </section>

        <section>
          <h4 :class="factHead">{{ t('settings.plugins.page.facts.permissions') }}</h4>
          <div class="tw:flex tw:flex-wrap tw:gap-1.5">
            <span v-if="!capabilities.length" :class="capChip">{{ t('settings.plugins.noPermissions') }}</span>
            <span v-for="cap in capabilities" :key="cap" :class="capChip">{{ cap }}</span>
          </div>
        </section>

        <section v-if="hosts.length">
          <h4 :class="factHead">{{ t('settings.plugins.page.facts.network') }}</h4>
          <ul class="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-0.5 tw:p-0 tw:text-[12.5px] tw:text-content-primary tw:font-nv-mono tw:[overflow-wrap:anywhere]">
            <li v-for="host in hosts" :key="host">{{ host }}</li>
          </ul>
          <dl v-if="methods.length" class="tw:m-0 tw:mt-2">
            <dt :class="factTerm">{{ t('settings.plugins.page.facts.methods') }}</dt>
            <dd :class="[factValue, 'tw:font-nv-mono']">{{ methods.join(' · ') }}</dd>
          </dl>
        </section>
      </aside>
    </div>
  </div>
</template>
