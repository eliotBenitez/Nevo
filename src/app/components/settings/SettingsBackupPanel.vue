<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Archive, Download, FolderArchive } from 'lucide-vue-next'
import NvButton from '../../../ui/primitives/NvButton.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useWorkspaceTransfer, type TransferStage } from '../../../composables/useWorkspaceTransfer'
import { useConfirmDialog } from '../../../ui/composables/useConfirmDialog'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { backendKind } = storeToRefs(workspaceStore)
const { isBusy, stage, progress, activeAction, exportWorkspace, importMergeIntoCurrent } = useWorkspaceTransfer()
const { confirm } = useConfirmDialog()

const isLocal = computed(() => backendKind.value === 'local')

const stageLabel = computed(() => {
  const key: Record<Exclude<TransferStage, 'idle'>, string> = {
    starting: 'workspaceTransfer.progress.starting',
    packing: 'workspaceTransfer.progress.packing',
    encrypting: 'workspaceTransfer.progress.encrypting',
    extracting: 'workspaceTransfer.progress.extracting',
    finishing: 'workspaceTransfer.progress.finishing',
  }
  return stage.value === 'idle' ? '' : t(key[stage.value])
})

function runExport() {
  void exportWorkspace()
}

async function runMerge() {
  const confirmed = await confirm({
    title: t('workspaceTransfer.import.mergeConfirmTitle'),
    message: t('workspaceTransfer.import.mergeConfirmMessage'),
    confirmLabel: t('workspaceTransfer.import.mergeConfirmAction'),
  })
  if (!confirmed) return
  await importMergeIntoCurrent()
}
</script>

<template>
  <section class="panel settings-backup-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('workspaceTransfer.panelTitle') }}</h2>
        <p class="panel-sub">{{ t('workspaceTransfer.panelDescription') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div v-if="!isLocal" class="settings-card backup-notice">
        <FolderArchive :size="15" aria-hidden="true" />
        <span>{{ t('workspaceTransfer.localOnly') }}</span>
      </div>

      <div class="group">
        <div class="group-label">{{ t('workspaceTransfer.export.title') }}</div>
        <div class="settings-card" :class="{ 'settings-row--muted': !isLocal }">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('workspaceTransfer.export.title') }}</div>
              <div class="row-sub">{{ t('workspaceTransfer.export.description') }}</div>
            </div>
            <NvButton
              :disabled="!isLocal || isBusy"
              :loading="isBusy && activeAction === 'export'"
              @click="runExport"
            >
              <Archive :size="14" />
              {{ t('workspaceTransfer.export.action') }}
            </NvButton>
          </div>

          <div v-if="isBusy && activeAction === 'export'" class="settings-row settings-row--border backup-progress-row">
            <div class="backup-progress">
              <div class="backup-progress__label">
                <span>{{ stageLabel }}</span>
                <span v-if="progress !== null">{{ progress }}%</span>
              </div>
              <div class="backup-progress__track">
                <div
                  class="backup-progress__fill"
                  :class="{ 'backup-progress__fill--indeterminate': progress === null }"
                  :style="progress !== null ? { width: `${progress}%` } : undefined"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('workspaceTransfer.import.title') }}</div>
        <div class="settings-card" :class="{ 'settings-row--muted': !isLocal }">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('workspaceTransfer.import.mergeTitle') }}</div>
              <div class="row-sub">{{ t('workspaceTransfer.import.mergeDescription') }}</div>
            </div>
            <NvButton
              :disabled="!isLocal || isBusy"
              :loading="isBusy && activeAction === 'merge'"
              @click="runMerge"
            >
              <Download :size="14" />
              {{ t('workspaceTransfer.import.mergeAction') }}
            </NvButton>
          </div>

          <div v-if="isBusy && activeAction === 'merge'" class="settings-row settings-row--border backup-progress-row">
            <div class="backup-progress">
              <div class="backup-progress__label">
                <span>{{ stageLabel }}</span>
                <span v-if="progress !== null">{{ progress }}%</span>
              </div>
              <div class="backup-progress__track">
                <div
                  class="backup-progress__fill"
                  :class="{ 'backup-progress__fill--indeterminate': progress === null }"
                  :style="progress !== null ? { width: `${progress}%` } : undefined"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.backup-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  color: var(--text-2, var(--text-secondary));
  font-size: 12.5px;
}

.backup-progress-row {
  display: block;
}

.backup-progress {
  width: 100%;
  display: grid;
  gap: 6px;
}

.backup-progress__label {
  display: flex;
  justify-content: space-between;
  color: var(--text-2, var(--text-secondary));
  font-size: 11.5px;
}

.backup-progress__track {
  height: 6px;
  border-radius: 999px;
  background: var(--line-2, color-mix(in oklab, var(--text-1) 12%, transparent));
  overflow: hidden;
}

.backup-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 160ms ease;
}

.backup-progress__fill--indeterminate {
  width: 40%;
  animation: backup-progress-indeterminate 1.1s ease-in-out infinite;
}

@keyframes backup-progress-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}

@media (prefers-reduced-motion: reduce) {
  .backup-progress__fill {
    transition: none;
  }

  .backup-progress__fill--indeterminate {
    animation: none;
  }
}
</style>
