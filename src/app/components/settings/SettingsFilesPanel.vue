<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Archive, Database, FileText, Folder, FolderOpen, HardDrive, Image, Plug, Trash2 } from '@lucide/vue'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { appLogger } from '../../../utils/logger'
import { formatBytes } from '../../../utils/format-bytes'
import { computed } from 'vue'
import { systemCommands, type WorkspaceLocation } from '../../../tauri/commands'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings, diagnostics, activePath } = storeToRefs(workspaceStore)

const trashRetentionOptions = computed(() => [
  { value: 7, label: t('settings.files.trashRetention.7days') },
  { value: 30, label: t('settings.files.trashRetention.30days') },
  { value: 90, label: t('settings.files.trashRetention.90days') },
  { value: 0, label: t('settings.files.trashRetention.never') },
])

function setTrashRetention(days: number) {
  workspaceStore.updateSettings(draft => {
    draft.files.trashRetentionDays = days
  })
}

async function openWorkspaceLocation(location: WorkspaceLocation, reveal = false) {
  if (!activePath.value) return
  try {
    await systemCommands.openWorkspaceLocation(activePath.value, location, { reveal })
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'open_workspace_location', message: 'Failed to open workspace location', workspacePath: activePath.value, error, payload: { location, reveal } })
  }
}

async function runSnapshotCleanup() {
  await workspaceStore.pruneSnapshots(settings.value.files.snapshotRetentionCount)
}

async function runAssetCleanup() {
  await workspaceStore.cleanupOrphanedAssets()
}

function normalizeSnapshotRetentionCount(value: number): number {
  if (!Number.isFinite(value)) return settings.value.files.snapshotRetentionCount
  return Math.max(1, Math.min(200, Math.round(value)))
}

async function setSnapshotRetentionCount(value: number) {
  const next = normalizeSnapshotRetentionCount(value)
  await workspaceStore.updateSettings((draft) => {
    draft.files.snapshotRetentionCount = next
  })
}
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-files-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.files')"
      :description="t('settings.files.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <SettingsGroup :title="t('settings.files.groups.paths')">
        <SettingsRow
          :title="t('settings.files.paths.title')"
          :description="t('settings.files.paths.description')"
          layout="stacked"
        >
          <div class="path-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1">
            <NvButton
              variant="ghost"
              class="path-button tw:h-auto tw:min-h-10 tw:cursor-pointer tw:justify-start tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:text-content-primary tw:text-xs tw:font-medium tw:transition-[background-color,transform,box-shadow] tw:duration-150 tw:hover:border-accent tw:hover:bg-[var(--hover-strong)] tw:hover:-translate-y-px tw:hover:shadow-[var(--shadow-raised)] tw:active:translate-y-0 tw:active:shadow-none"
              @click="openWorkspaceLocation('root', true)"
            >
              <FolderOpen :size="14" />
              {{ t('settings.files.paths.revealWorkspace') }}
            </NvButton>
            <NvButton
              variant="ghost"
              class="path-button tw:h-auto tw:min-h-10 tw:cursor-pointer tw:justify-start tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:text-content-primary tw:text-xs tw:font-medium tw:transition-[background-color,transform,box-shadow] tw:duration-150 tw:hover:border-accent tw:hover:bg-[var(--hover-strong)] tw:hover:-translate-y-px tw:hover:shadow-[var(--shadow-raised)] tw:active:translate-y-0 tw:active:shadow-none"
              @click="openWorkspaceLocation('notes')"
            >
              <FileText :size="14" />
              {{ t('settings.files.paths.openNotes') }}
            </NvButton>
            <NvButton
              variant="ghost"
              class="path-button tw:h-auto tw:min-h-10 tw:cursor-pointer tw:justify-start tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:text-content-primary tw:text-xs tw:font-medium tw:transition-[background-color,transform,box-shadow] tw:duration-150 tw:hover:border-accent tw:hover:bg-[var(--hover-strong)] tw:hover:-translate-y-px tw:hover:shadow-[var(--shadow-raised)] tw:active:translate-y-0 tw:active:shadow-none"
              @click="openWorkspaceLocation('assets')"
            >
              <Image :size="14" />
              {{ t('settings.files.paths.openAssets') }}
            </NvButton>
            <NvButton
              variant="ghost"
              class="path-button tw:h-auto tw:min-h-10 tw:cursor-pointer tw:justify-start tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--hover)] tw:text-content-primary tw:text-xs tw:font-medium tw:transition-[background-color,transform,box-shadow] tw:duration-150 tw:hover:border-accent tw:hover:bg-[var(--hover-strong)] tw:hover:-translate-y-px tw:hover:shadow-[var(--shadow-raised)] tw:active:translate-y-0 tw:active:shadow-none"
              @click="openWorkspaceLocation('metadata')"
            >
              <Database :size="14" />
              {{ t('settings.files.paths.openNevo') }}
            </NvButton>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="t('settings.files.groups.retention')">
        <SettingsRow
          :title="t('settings.files.snapshotRetention.title')"
          :description="t('settings.files.snapshotRetention.description', { count: settings.files.snapshotRetentionCount })"
        >
          <div class="inline-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <NvNumberInput
              :model-value="settings.files.snapshotRetentionCount"
              :min="1"
              :max="200"
              @update:model-value="setSnapshotRetentionCount"
            />
            <NvButton @click="runSnapshotCleanup">
              <Archive :size="14" />
              {{ t('settings.files.snapshotRetention.pruneNow') }}
            </NvButton>
          </div>
        </SettingsRow>

        <SettingsRow
          :title="t('settings.files.trashRetention.title')"
          :description="t('settings.files.trashRetention.description')"
          layout="stacked"
        >
          <div class="segmented" role="group" :aria-label="t('settings.files.trashRetention.title')">
            <button
              v-for="opt in trashRetentionOptions"
              :key="opt.value"
              type="button"
              class="segmented__item"
              :class="{ 'is-active': settings.files.trashRetentionDays === opt.value }"
              :aria-pressed="settings.files.trashRetentionDays === opt.value"
              @click="setTrashRetention(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          :title="t('settings.files.orphanedAssets.title')"
          :description="t('settings.files.orphanedAssets.description')"
        >
          <NvButton @click="runAssetCleanup">
            <Trash2 :size="14" />
            {{ t('settings.files.orphanedAssets.clean') }}
          </NvButton>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="t('settings.files.groups.diagnostics')">
        <div class="stats-grid tw:grid tw:grid-cols-3 tw:gap-2.5 tw:max-[980px]:grid-cols-1">
          <div class="stat-card tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]"><FileText :size="15" class="tw:text-accent" /><span class="tw:block tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.files.diagnostics.notes') }}</span><strong class="tw:col-span-full tw:block tw:text-content-primary tw:text-lg tw:font-semibold tw:tabular-nums tw:[overflow-wrap:anywhere]">{{ diagnostics?.noteCount ?? 0 }}</strong></div>
          <div class="stat-card tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]"><Folder :size="15" class="tw:text-accent" /><span class="tw:block tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.files.diagnostics.folders') }}</span><strong class="tw:col-span-full tw:block tw:text-content-primary tw:text-lg tw:font-semibold tw:tabular-nums tw:[overflow-wrap:anywhere]">{{ diagnostics?.folderCount ?? 0 }}</strong></div>
          <div class="stat-card tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]"><Plug :size="15" class="tw:text-accent" /><span class="tw:block tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.files.diagnostics.plugins') }}</span><strong class="tw:col-span-full tw:block tw:text-content-primary tw:text-lg tw:font-semibold tw:tabular-nums tw:[overflow-wrap:anywhere]">{{ diagnostics?.pluginCount ?? 0 }}</strong></div>
          <div class="stat-card tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]"><Archive :size="15" class="tw:text-accent" /><span class="tw:block tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.files.diagnostics.snapshots') }}</span><strong class="tw:col-span-full tw:block tw:text-content-primary tw:text-lg tw:font-semibold tw:tabular-nums tw:[overflow-wrap:anywhere]">{{ diagnostics?.snapshotCount ?? 0 }}</strong></div>
          <div class="stat-card tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]"><Image :size="15" class="tw:text-accent" /><span class="tw:block tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.files.diagnostics.assets') }}</span><strong class="tw:col-span-full tw:block tw:text-content-primary tw:text-lg tw:font-semibold tw:tabular-nums tw:[overflow-wrap:anywhere]">{{ diagnostics?.assetCount ?? 0 }}</strong></div>
          <div class="stat-card tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]"><HardDrive :size="15" class="tw:text-accent" /><span class="tw:block tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-semibold tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.files.diagnostics.workspaceSize') }}</span><strong class="tw:col-span-full tw:block tw:text-content-primary tw:text-lg tw:font-semibold tw:tabular-nums tw:[overflow-wrap:anywhere]">{{ formatBytes(diagnostics?.workspaceBytes) }}</strong></div>
        </div>
      </SettingsGroup>
    </div>
  </section>
</template>
