<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { appLogger } from '../../../utils/logger'
import { computed } from 'vue'

const { t } = useI18n()
const { runtime } = useDeviceLayout()
const workspaceStore = useWorkspaceStore()
const { settings, diagnostics, activePath } = storeToRefs(workspaceStore)

const trashRetentionOptions = computed(() => [
  { value: '7', label: t('settings.files.trashRetention.7days') },
  { value: '30', label: t('settings.files.trashRetention.30days') },
  { value: '90', label: t('settings.files.trashRetention.90days') },
  { value: '0', label: t('settings.files.trashRetention.never') },
])

function formatBytes(bytes: number | undefined): string {
  const v = bytes ?? 0
  if (v < 1024) return `${v} B`
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`
  return `${(v / 1024 ** 3).toFixed(1)} GB`
}

async function revealPath(path: string | undefined) {
  if (!path) return
  try {
    if (!runtime.value.supportsRevealInFileManager) { await openPath(path); return }
    await revealItemInDir(path)
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'reveal_path', message: 'Failed to reveal path', workspacePath: activePath.value, error, payload: { path } })
  }
}

async function openFolder(path: string | undefined) {
  if (!path) return
  try {
    await openPath(path)
  } catch (error) {
    try { await revealItemInDir(path); return } catch { /* fall through to logging */ }
    await appLogger.warn({ source: 'frontend.settings', event: 'open_folder', message: 'Failed to open folder', workspacePath: activePath.value, error, payload: { path } })
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
  <section class="panel settings-files-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.files') }}</h2>
        <p class="panel-sub">{{ t('settings.files.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="group">
        <div class="group-label">{{ t('settings.files.groups.paths') }}</div>
        <div class="settings-card">
          <div class="settings-row settings-row--stack">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.files.paths.title') }}</div>
              <div class="row-sub">{{ t('settings.files.paths.description') }}</div>
            </div>
            <div class="path-grid">
              <NvButton variant="ghost" class="path-button" @click="revealPath(activePath ?? undefined)">{{ t('settings.files.paths.revealWorkspace') }}</NvButton>
              <NvButton variant="ghost" class="path-button" @click="openFolder(diagnostics?.notesFolderPath)">{{ t('settings.files.paths.openNotes') }}</NvButton>
              <NvButton variant="ghost" class="path-button" @click="openFolder(diagnostics?.assetsFolderPath)">{{ t('settings.files.paths.openAssets') }}</NvButton>
              <NvButton variant="ghost" class="path-button" @click="openFolder(diagnostics?.nevoFolderPath)">{{ t('settings.files.paths.openNevo') }}</NvButton>
            </div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('settings.files.groups.retention') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.files.snapshotRetention.title') }}</div>
              <div class="row-sub">{{ t('settings.files.snapshotRetention.description', { count: settings.files.snapshotRetentionCount }) }}</div>
            </div>
            <div class="inline-actions">
              <NvNumberInput
                :model-value="settings.files.snapshotRetentionCount"
                :min="1"
                :max="200"
                @update:model-value="setSnapshotRetentionCount"
              />
              <NvButton @click="runSnapshotCleanup">{{ t('settings.files.snapshotRetention.pruneNow') }}</NvButton>
            </div>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.files.trashRetention.title') }}</div>
              <div class="row-sub">{{ t('settings.files.trashRetention.description') }}</div>
            </div>
            <NvSelect
              :model-value="String(settings.files.trashRetentionDays)"
              :options="trashRetentionOptions"
              :min-width="150"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.files.trashRetentionDays = parseInt(v) })"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.files.orphanedAssets.title') }}</div>
              <div class="row-sub">{{ t('settings.files.orphanedAssets.description') }}</div>
            </div>
            <NvButton @click="runAssetCleanup">{{ t('settings.files.orphanedAssets.clean') }}</NvButton>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('settings.files.groups.diagnostics') }}</div>
        <div class="stats-grid">
          <div class="stat-card"><span>{{ t('settings.files.diagnostics.notes') }}</span><strong>{{ diagnostics?.noteCount ?? 0 }}</strong></div>
          <div class="stat-card"><span>{{ t('settings.files.diagnostics.folders') }}</span><strong>{{ diagnostics?.folderCount ?? 0 }}</strong></div>
          <div class="stat-card"><span>{{ t('settings.files.diagnostics.plugins') }}</span><strong>{{ diagnostics?.pluginCount ?? 0 }}</strong></div>
          <div class="stat-card"><span>{{ t('settings.files.diagnostics.snapshots') }}</span><strong>{{ diagnostics?.snapshotCount ?? 0 }}</strong></div>
          <div class="stat-card"><span>{{ t('settings.files.diagnostics.assets') }}</span><strong>{{ diagnostics?.assetCount ?? 0 }}</strong></div>
          <div class="stat-card"><span>{{ t('settings.files.diagnostics.workspaceSize') }}</span><strong>{{ formatBytes(diagnostics?.workspaceBytes) }}</strong></div>
        </div>
      </div>
    </div>
  </section>
</template>