<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, FolderOpen, Settings, Trash2 } from '../../../../ui/icons'
import type { PluginManifest } from '../../../../types/workspace'
import { useWorkspaceStore } from '../../../../stores/workspace'
import { isPluginAvailableForApp } from '../../../../core/plugins/runtimeAvailability'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import SettingsObjectCard from '../ui/SettingsObjectCard.vue'
import { pluginCapabilities, pluginDescription, pluginTitle, systemPluginIcons } from './pluginDisplay'

const props = defineProps<{
  plugin: PluginManifest
  isValid: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', enabled: boolean): void
  (e: 'open'): void
  (e: 'openSettings'): void
  (e: 'openFolder'): void
  (e: 'remove'): void
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const isAvailableOnDevice = computed(() => isPluginAvailableForApp(props.plugin, workspaceStore.appMetadata))

const title = computed(() => pluginTitle(props.plugin, t))
const description = computed(() => pluginDescription(props.plugin, t))
const capabilities = computed(() => pluginCapabilities(props.plugin).slice(0, 6))
const icon = computed(() => systemPluginIcons[props.plugin.id] ?? null)

</script>

<template>
  <SettingsObjectCard
    class="plugin-card"
    :tone="isValid && isAvailableOnDevice ? 'default' : 'warning'"
  >
    <template #icon>
      <div class="plugin-card__icon tw:grid tw:size-9 tw:place-items-center tw:rounded-[calc(10px*var(--radius-scale,1))] tw:bg-accent tw:text-content-on-accent tw:[font-family:var(--font-serif)] tw:italic" :class="{ 'plugin-card__icon--system': plugin.kind === 'system' }">
        <component :is="icon" v-if="icon" :size="16" />
        <span v-else>{{ plugin.name.charAt(0).toUpperCase() }}</span>
      </div>
    </template>

    <div class="plugin-card__head tw:flex tw:items-start tw:justify-between tw:gap-3">
      <div>
        <div class="plugin-card__title tw:text-content-primary tw:text-[13.5px] tw:font-[560] tw:[overflow-wrap:anywhere]">
          <button
            type="button"
            class="plugin-title-button tw:inline-flex tw:max-w-full tw:flex-wrap tw:items-baseline tw:gap-x-1.5 tw:border-0 tw:bg-transparent tw:p-0 tw:text-start tw:text-inherit tw:font-[inherit] tw:cursor-pointer tw:hover:text-accent"
            :aria-label="t('settings.plugins.page.open', { plugin: title })"
            :data-plugin-open="plugin.id"
            @click="emit('open')"
          >
            <span>{{ title }}</span>
            <span class="plugin-card__version tw:text-content-muted tw:text-[11px] tw:font-nv-mono">{{ plugin.kind === 'system' ? t('settings.plugins.builtIn') : `v${plugin.version}` }}</span>
            <ChevronRight :size="14" class="tw:shrink-0 tw:self-center tw:text-content-muted" aria-hidden="true" />
          </button>
        </div>
        <div class="plugin-card__author tw:mt-0.5 tw:text-content-muted tw:text-[11px] tw:font-nv-mono">
          {{ plugin.id }} · {{ plugin.source ?? 'folder' }} ·
          {{ t(`settings.plugins.execution.${plugin.executionMode === 'sandboxed-worker' ? 'sandboxed' : 'trusted'}`) }}
        </div>
      </div>
    </div>

    <p class="plugin-card__desc tw:mt-2 tw:mb-0 tw:text-content-muted tw:text-xs tw:leading-[1.5] tw:[overflow-wrap:anywhere]">{{ description }}</p>

    <div class="capability-row tw:mt-2.5 tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span v-if="!capabilities.length" class="capability-chip tw:inline-flex tw:min-h-[18px] tw:max-w-full tw:items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:px-1.5 tw:text-content-muted tw:text-[10.5px] tw:font-medium tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ t('settings.plugins.noPermissions') }}</span>
      <span v-for="cap in capabilities" :key="cap" class="capability-chip tw:inline-flex tw:min-h-[18px] tw:max-w-full tw:items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:px-1.5 tw:text-content-muted tw:text-[10.5px] tw:font-medium tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ cap }}</span>
    </div>

    <div class="plugin-card__footer tw:mt-2.5 tw:flex tw:flex-wrap tw:items-center tw:gap-2.5">
      <NvButton variant="ghost" size="xs" @click="emit('openFolder')">
        <FolderOpen :size="13" />
        {{ t('settings.plugins.source') }}
      </NvButton>
      <NvButton
        v-if="plugin.settingsSchema?.length"
        variant="ghost"
        size="xs"
        @click="emit('openSettings')"
      >
        <Settings :size="13" />
        {{ t('settings.plugins.settings.configure') }}
      </NvButton>
      <NvButton
        v-if="plugin.kind === 'marketplace'"
        variant="ghost"
        size="xs"
        :disabled="isLoading"
        :loading="isLoading"
        @click="emit('remove')"
      >
        <Trash2 :size="13" />
        {{ t('settings.plugins.remove') }}
      </NvButton>
      <div class="spacer" />
      <span
        v-if="!isAvailableOnDevice"
        class="status-chip tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]"
      >
        {{ t('settings.plugins.unavailableOnDevice') }}
      </span>
      <span
        class="status-chip tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold"
        :class="isValid ? 'status-chip--functional tw:bg-[var(--accent-soft)] tw:text-accent' : 'status-chip--coming tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]'"
      >
        {{ isValid ? t('settings.plugins.manifestValid') : t('settings.plugins.manifestIssue') }}
      </span>
    </div>

    <template #actions>
      <NvToggle
        :aria-label="title"
        :model-value="plugin.enabled"
        @update:model-value="emit('toggle', $event)"
      />
    </template>
  </SettingsObjectCard>
</template>
