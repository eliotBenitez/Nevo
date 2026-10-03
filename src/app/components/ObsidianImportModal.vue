<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NvModal from '../../ui/primitives/NvModal.vue'
import { useObsidianImport, type ObsidianImportResult } from '../../composables/useObsidianImport'

interface Props {
  open: boolean
  targetFolderId: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { importing, progress, importVault } = useObsidianImport()
const result = ref<ObsidianImportResult | null>(null)
const primaryButtonRef = ref<HTMLButtonElement | null>(null)

type Stage = 'idle' | 'running' | 'done' | 'error'

const stage = computed<Stage>(() => {
  if (progress.value.phase === 'error') return 'error'
  if (result.value !== null) return 'done'
  if (importing.value) return 'running'
  return 'idle'
})

const headingText = computed(() => {
  if (stage.value === 'done') return t('workspace.obsidianImport.doneTitle')
  if (stage.value === 'error') return t('workspace.obsidianImport.errorTitle')
  return t('workspace.obsidianImport.title')
})

const phaseLabel = computed(() => {
  switch (progress.value.phase) {
    case 'reading': return t('workspace.obsidianImport.phase.reading')
    case 'folders': return t('workspace.obsidianImport.phase.folders')
    case 'creating': return t('workspace.obsidianImport.phase.creating')
    case 'writing': return t('workspace.obsidianImport.phase.writing')
    default: return ''
  }
})

const progressPercent = computed(() => {
  const { totalNotes, processedNotes } = progress.value
  return totalNotes > 0 ? Math.round((processedNotes / totalNotes) * 100) : 0
})

// `immediate` matters: the shell mounts this component behind a `v-if`, so it
// arrives already open and a plain watcher would never see the transition.
watch(() => props.open, (open) => {
  if (open) result.value = null
}, { immediate: true })

// Refocus on every stage swap, not just on open: each stage destroys the
// previously focused button, and NvModal's Escape handler only sees the key
// while focus is still inside the dialog.
watch([() => props.open, stage], ([open]) => {
  if (!open) return
  void nextTick(() => primaryButtonRef.value?.focus())
}, { immediate: true })

async function startImport() {
  result.value = await importVault(props.targetFolderId)
}

// NvModal always emits close on Escape/backdrop/X; this is the single gate
// that keeps the dialog open while an import is running, regardless of which
// of those triggered it.
function requestClose() {
  if (stage.value === 'running') return
  emit('close')
}
</script>

<template>
  <NvModal :open="open" size="sm" labelled-by="obsidian-import-heading" @close="requestClose">
    <template #header>
      <h3 id="obsidian-import-heading" class="obsidian-import__title tw:m-0 tw:text-[15px] tw:text-content-primary tw:font-semibold">{{ headingText }}</h3>
    </template>

    <div class="obsidian-import tw:flex tw:flex-col tw:gap-2.5">
      <template v-if="stage === 'idle'">
        <p class="obsidian-import__description tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-[1.45]">{{ t('workspace.obsidianImport.description') }}</p>
        <div class="obsidian-import__actions tw:flex tw:justify-end tw:gap-2 tw:mt-1">
          <button type="button" class="nv-btn" @click="emit('close')">{{ t('workspace.obsidianImport.cancel') }}</button>
          <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="startImport">
            {{ t('workspace.obsidianImport.selectFolder') }}
          </button>
        </div>
      </template>

      <template v-else-if="stage === 'running'">
        <p class="obsidian-import__phase tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-[1.45]">{{ phaseLabel }}</p>
        <div
          class="obsidian-import__progress tw:w-full tw:h-2 tw:rounded-[calc(4px*var(--radius-scale,1))] tw:bg-surface-overlay tw:overflow-hidden"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="progressPercent"
        >
          <div class="obsidian-import__progress-fill tw:h-full tw:bg-accent tw:transition-[width] tw:duration-200 tw:ease-[ease] motion-reduce:tw:transition-none" :style="{ width: `${progressPercent}%` }" />
        </div>
        <p class="obsidian-import__count tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-[1.45]">
          {{ t('workspace.obsidianImport.progressCount', { processed: progress.processedNotes, total: progress.totalNotes }) }}
        </p>
      </template>

      <template v-else-if="stage === 'done'">
        <p class="obsidian-import__vault tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-[1.45]">{{ t('workspace.obsidianImport.vaultName') }}: {{ result?.rootName }}</p>
        <dl class="obsidian-import__stats tw:m-0 tw:flex tw:flex-col tw:gap-1">
          <div class="obsidian-import__stat tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-content-secondary [&>dt]:tw:text-content-muted [&>dd]:tw:m-0 [&>dd]:tw:text-content-primary [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.notesCreated') }}</dt>
            <dd>{{ result?.notesCreated }}</dd>
          </div>
          <div class="obsidian-import__stat tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-content-secondary [&>dt]:tw:text-content-muted [&>dd]:tw:m-0 [&>dd]:tw:text-content-primary [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.foldersCreated') }}</dt>
            <dd>{{ result?.foldersCreated }}</dd>
          </div>
          <div class="obsidian-import__stat tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-content-secondary [&>dt]:tw:text-content-muted [&>dd]:tw:m-0 [&>dd]:tw:text-content-primary [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.attachmentsImported') }}</dt>
            <dd>{{ result?.attachmentsImported }}</dd>
          </div>
          <div class="obsidian-import__stat tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-content-secondary [&>dt]:tw:text-content-muted [&>dd]:tw:m-0 [&>dd]:tw:text-content-primary [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.tagsCollected') }}</dt>
            <dd>{{ result?.tagsCollected }}</dd>
          </div>
          <div class="obsidian-import__stat tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-content-secondary [&>dt]:tw:text-content-muted [&>dd]:tw:m-0 [&>dd]:tw:text-content-primary [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.notesWithFrontmatter') }}</dt>
            <dd>{{ result?.notesWithFrontmatter }}</dd>
          </div>
          <div v-if="(result?.unresolvedLinks ?? 0) > 0" class="obsidian-import__stat obsidian-import__stat--warning tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-danger [&>dt]:tw:text-danger [&>dd]:tw:m-0 [&>dd]:tw:text-danger [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.unresolvedLinks') }}</dt>
            <dd>{{ result?.unresolvedLinks }}</dd>
          </div>
          <div v-if="(result?.unresolvedEmbeds ?? 0) > 0" class="obsidian-import__stat obsidian-import__stat--warning tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-danger [&>dt]:tw:text-danger [&>dd]:tw:m-0 [&>dd]:tw:text-danger [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.unresolvedEmbeds') }}</dt>
            <dd>{{ result?.unresolvedEmbeds }}</dd>
          </div>
          <div v-if="(result?.skippedFiles ?? 0) > 0" class="obsidian-import__stat obsidian-import__stat--warning tw:flex tw:justify-between tw:gap-3 tw:text-[13px] tw:text-danger [&>dt]:tw:text-danger [&>dd]:tw:m-0 [&>dd]:tw:text-danger [&>dd]:tw:font-semibold">
            <dt>{{ t('workspace.obsidianImport.skippedFiles') }}</dt>
            <dd>{{ result?.skippedFiles }}</dd>
          </div>
        </dl>
        <div class="obsidian-import__actions tw:flex tw:justify-end tw:gap-2 tw:mt-1">
          <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="emit('close')">{{ t('workspace.obsidianImport.close') }}</button>
        </div>
      </template>

      <template v-else>
        <p class="obsidian-import__error tw:m-0 tw:text-[13px] tw:text-danger tw:leading-[1.45]">{{ progress.error }}</p>
        <div class="obsidian-import__actions tw:flex tw:justify-end tw:gap-2 tw:mt-1">
          <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="emit('close')">{{ t('workspace.obsidianImport.close') }}</button>
        </div>
      </template>
    </div>
  </NvModal>
</template>
