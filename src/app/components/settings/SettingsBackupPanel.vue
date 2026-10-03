<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Archive, Download, FolderArchive } from 'lucide-vue-next'
import NvButton from '../../../ui/primitives/NvButton.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'
import SettingsObjectCard from './ui/SettingsObjectCard.vue'
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
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-backup-panel">
    <SettingsSectionHeader
      :title="t('workspaceTransfer.panelTitle')"
      :description="t('workspaceTransfer.panelDescription')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <SettingsObjectCard v-if="!isLocal" class="backup-notice tw:flex tw:items-center tw:gap-2.5 tw:py-3 tw:px-3.5 tw:text-content-secondary tw:text-[12.5px]">
        <template #icon>
          <FolderArchive :size="15" aria-hidden="true" />
        </template>
        <span>{{ t('workspaceTransfer.localOnly') }}</span>
      </SettingsObjectCard>

      <SettingsGroup :title="t('workspaceTransfer.export.title')">
        <SettingsRow
          :title="t('workspaceTransfer.export.title')"
          :description="t('workspaceTransfer.export.description')"
          :disabled="!isLocal"
        >
          <NvButton
            :disabled="!isLocal || isBusy"
            :loading="isBusy && activeAction === 'export'"
            @click="runExport"
          >
            <Archive :size="14" />
            {{ t('workspaceTransfer.export.action') }}
          </NvButton>
        </SettingsRow>

        <div v-if="isBusy && activeAction === 'export'" class="settings-row backup-progress-row tw:block">
          <div class="backup-progress tw:w-full tw:grid tw:gap-1.5">
            <div class="backup-progress__label tw:flex tw:justify-between tw:text-content-secondary tw:text-[11.5px]">
              <span>{{ stageLabel }}</span>
              <span v-if="progress !== null">{{ progress }}%</span>
            </div>
            <div class="backup-progress__track tw:h-1.5 tw:rounded-full tw:bg-surface-subtle tw:overflow-hidden">
              <div
                class="backup-progress__fill tw:h-full tw:rounded-full tw:bg-accent tw:transition-[width] tw:duration-[160ms] tw:ease-[ease] motion-reduce:tw:transition-none"
                :class="{ 'backup-progress__fill--indeterminate': progress === null }"
                :style="progress !== null ? { width: `${progress}%` } : undefined"
              />
            </div>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup :title="t('workspaceTransfer.import.title')">
        <SettingsRow
          :title="t('workspaceTransfer.import.mergeTitle')"
          :description="t('workspaceTransfer.import.mergeDescription')"
          :disabled="!isLocal"
        >
          <NvButton
            :disabled="!isLocal || isBusy"
            :loading="isBusy && activeAction === 'merge'"
            @click="runMerge"
          >
            <Download :size="14" />
            {{ t('workspaceTransfer.import.mergeAction') }}
          </NvButton>
        </SettingsRow>

        <div v-if="isBusy && activeAction === 'merge'" class="settings-row backup-progress-row tw:block">
          <div class="backup-progress tw:w-full tw:grid tw:gap-1.5">
            <div class="backup-progress__label tw:flex tw:justify-between tw:text-content-secondary tw:text-[11.5px]">
              <span>{{ stageLabel }}</span>
              <span v-if="progress !== null">{{ progress }}%</span>
            </div>
            <div class="backup-progress__track tw:h-1.5 tw:rounded-full tw:bg-surface-subtle tw:overflow-hidden">
              <div
                class="backup-progress__fill tw:h-full tw:rounded-full tw:bg-accent tw:transition-[width] tw:duration-[160ms] tw:ease-[ease] motion-reduce:tw:transition-none"
                :class="{ 'backup-progress__fill--indeterminate': progress === null }"
                :style="progress !== null ? { width: `${progress}%` } : undefined"
              />
            </div>
          </div>
        </div>
      </SettingsGroup>
    </div>
  </section>
</template>

<style scoped>
.backup-progress__fill--indeterminate {
  width: 40%;
  animation: backup-progress-indeterminate 1.1s ease-in-out infinite;
}

@keyframes backup-progress-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}

@media (prefers-reduced-motion: reduce) {
  .backup-progress__fill--indeterminate {
    animation: none;
  }
}
</style>
