<script setup lang="ts">
import { computed, markRaw } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderOpen, GitBranch, Kanban, LayoutTemplate, Network, BarChart3, Settings, Trash2 } from '@lucide/vue'
import type { PluginManifest } from '../../../../types/workspace'
import { isSystemPluginId, SYSTEM_PLUGIN_SHORT_IDS } from '../../../../utils/system-plugins'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import SettingsObjectCard from '../ui/SettingsObjectCard.vue'
import PluginSettingsForm from '../PluginSettingsForm.vue'
import GithubSyncActions from '../GithubSyncActions.vue'

const props = defineProps<{
  plugin: PluginManifest
  isValid: boolean
  isExpanded: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', enabled: boolean): void
  (e: 'toggleSettings'): void
  (e: 'openFolder'): void
  (e: 'remove'): void
}>()

const { t } = useI18n()

const systemPluginIcons: Record<string, Component> = {
  'nevo.kanban': markRaw(Kanban),
  'nevo.templates': markRaw(LayoutTemplate),
  'nevo.vega': markRaw(BarChart3),
  'nevo.markmap': markRaw(Network),
  'nevo.github-sync': markRaw(GitBranch),
}

const title = computed(() => {
  if (!isSystemPluginId(props.plugin.id)) return props.plugin.name
  return t(`settings.plugins.${SYSTEM_PLUGIN_SHORT_IDS[props.plugin.id]}.title`)
})

const description = computed(() => {
  if (!isSystemPluginId(props.plugin.id)) return props.plugin.description || t('settings.plugins.noDescription')
  return t(`settings.plugins.${SYSTEM_PLUGIN_SHORT_IDS[props.plugin.id]}.description`)
})

const icon = computed(() => systemPluginIcons[props.plugin.id] ?? null)

const capabilities = computed(() => {
  if (props.plugin.executionMode === 'sandboxed-worker') {
    return (props.plugin.capabilities ?? []).slice(0, 6)
  }
  return [
    ...props.plugin.editorCapabilities,
    ...(props.plugin.uiCapabilities ?? []),
    ...(props.plugin.workspaceCapabilities ?? []),
  ].slice(0, 6)
})
</script>

<template>
  <SettingsObjectCard
    class="plugin-card"
    :tone="isValid ? 'default' : 'warning'"
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
          {{ title }}
          <span class="plugin-card__version tw:text-content-muted tw:text-[11px] tw:font-nv-mono">{{ plugin.kind === 'system' ? t('settings.plugins.builtIn') : `v${plugin.version}` }}</span>
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
        :active="isExpanded"
        @click="emit('toggleSettings')"
      >
        <Settings :size="13" />
        {{ isExpanded ? t('settings.plugins.settings.hide') : t('settings.plugins.settings.configure') }}
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
        class="status-chip tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold"
        :class="isValid ? 'status-chip--functional tw:bg-[var(--accent-soft)] tw:text-accent' : 'status-chip--coming tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]'"
      >
        {{ isValid ? t('settings.plugins.manifestValid') : t('settings.plugins.manifestIssue') }}
      </span>
    </div>

    <template v-if="plugin.settingsSchema?.length && isExpanded">
      <PluginSettingsForm :plugin="plugin" />
      <GithubSyncActions v-if="plugin.id === 'nevo.github-sync'" :plugin="plugin" />
    </template>

    <template #actions>
      <NvToggle
        :aria-label="title"
        :model-value="plugin.enabled"
        @update:model-value="emit('toggle', $event)"
      />
    </template>
  </SettingsObjectCard>
</template>
