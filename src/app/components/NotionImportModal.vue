<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NvModal from '../../ui/primitives/NvModal.vue'
import { useNotionImport } from '../../composables/useNotionImport'
import type { NotionImportResult } from '../../types/notion-import'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { importing, progress, importExport } = useNotionImport()
const result = ref<NotionImportResult | null>(null)
const primaryButtonRef = ref<HTMLButtonElement | null>(null)

type Stage = 'idle' | 'running' | 'done' | 'error'
const stage = computed<Stage>(() => {
  if (progress.value.phase === 'error') return 'error'
  if (result.value) return 'done'
  if (importing.value) return 'running'
  return 'idle'
})
const headingText = computed(() => {
  if (stage.value === 'done') return t('workspace.notionImport.doneTitle')
  if (stage.value === 'error') return t('workspace.notionImport.errorTitle')
  return t('workspace.notionImport.title')
})
const phaseLabel = computed(() => {
  const phase = progress.value.phase
  return ['scanning', 'folders', 'creating', 'assets', 'writing'].includes(phase)
    ? t(`workspace.notionImport.phase.${phase}`)
    : ''
})
const progressPercent = computed(() => progress.value.totalItems > 0
  ? Math.round((progress.value.processedItems / progress.value.totalItems) * 100)
  : 0)

watch(() => props.open, open => {
  if (open) result.value = null
}, { immediate: true })

watch([() => props.open, stage], ([open]) => {
  if (open) void nextTick(() => primaryButtonRef.value?.focus())
}, { immediate: true })

async function startImport() {
  result.value = await importExport()
}

// NvModal always emits close on Escape/backdrop/X; this is the single gate
// that keeps the dialog open while an import is running, regardless of which
// of those triggered it.
function requestClose() {
  if (stage.value !== 'running') emit('close')
}
</script>

<template>
  <NvModal :open="open" size="md" labelled-by="notion-import-heading" @close="requestClose">
    <template #header>
      <h3 id="notion-import-heading" class="notion-import__title tw:m-0 tw:text-base tw:text-content-primary tw:font-semibold">{{ headingText }}</h3>
    </template>

    <div class="notion-import tw:flex tw:flex-col tw:gap-3">
      <template v-if="stage === 'idle'">
        <p class="notion-import__description tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-normal">{{ t('workspace.notionImport.description') }}</p>
        <p class="notion-import__hint tw:m-0 tw:text-[13px] tw:text-content-muted tw:leading-normal">{{ t('workspace.notionImport.localOnly') }}</p>
        <div class="notion-import__actions tw:flex tw:justify-end tw:gap-2">
          <button type="button" class="nv-btn" @click="requestClose">{{ t('workspace.notionImport.cancel') }}</button>
          <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="startImport">
            {{ t('workspace.notionImport.selectZip') }}
          </button>
        </div>
      </template>

      <template v-else-if="stage === 'running'">
        <p class="notion-import__phase tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-normal" role="status">{{ phaseLabel }}</p>
        <div class="notion-import__progress tw:h-2 tw:overflow-hidden tw:rounded-full tw:bg-surface-overlay" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressPercent">
          <div class="notion-import__progress-fill tw:h-full tw:bg-accent tw:transition-[width] tw:duration-[160ms] tw:ease-[ease] motion-reduce:tw:transition-none" :style="{ width: `${progressPercent}%` }" />
        </div>
        <p class="notion-import__count tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-normal">
          {{ t('workspace.notionImport.progressCount', { processed: progress.processedItems, total: progress.totalItems }) }}
        </p>
      </template>

      <template v-else-if="stage === 'done'">
        <p class="notion-import__description tw:m-0 tw:text-[13px] tw:text-content-secondary tw:leading-normal">{{ result?.rootName }}</p>
        <dl class="notion-import__stats tw:grid tw:gap-1.5 tw:m-0 [&>div]:tw:flex [&>div]:tw:justify-between [&>div]:tw:gap-4 [&>div]:tw:text-[13px] [&>div]:tw:text-content-secondary [&_dd]:tw:m-0 [&_dd]:tw:text-content-primary [&_dd]:tw:[font-variant-numeric:tabular-nums]">
          <div><dt>{{ t('workspace.notionImport.notesCreated') }}</dt><dd>{{ result?.notesCreated }}</dd></div>
          <div><dt>{{ t('workspace.notionImport.foldersCreated') }}</dt><dd>{{ result?.foldersCreated }}</dd></div>
          <div><dt>{{ t('workspace.notionImport.databasesCreated') }}</dt><dd>{{ result?.databasesCreated }}</dd></div>
          <div><dt>{{ t('workspace.notionImport.assetsImported') }}</dt><dd>{{ result?.assetsImported }}</dd></div>
          <div v-if="result?.warnings" class="is-warning [&>dt]:tw:text-danger [&>dd]:tw:text-danger"><dt>{{ t('workspace.notionImport.warnings') }}</dt><dd>{{ result.warnings }}</dd></div>
          <div v-if="result?.errors" class="is-warning [&>dt]:tw:text-danger [&>dd]:tw:text-danger"><dt>{{ t('workspace.notionImport.errors') }}</dt><dd>{{ result.errors }}</dd></div>
        </dl>
        <details v-if="result?.issues.length" class="notion-import__issues tw:text-xs tw:text-content-secondary">
          <summary>{{ t('workspace.notionImport.issueDetails') }}</summary>
          <ul class="tw:max-h-40 tw:overflow-auto tw:pl-5"><li v-for="(item, index) in result.issues" :key="`${item.path}-${index}`"><strong>{{ item.path }}</strong>: {{ item.reason }}</li></ul>
        </details>
        <div class="notion-import__actions tw:flex tw:justify-end tw:gap-2">
          <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="requestClose">{{ t('workspace.notionImport.close') }}</button>
        </div>
      </template>

      <template v-else>
        <p class="notion-import__error tw:m-0 tw:text-[13px] tw:text-danger tw:leading-normal" role="alert">{{ progress.error }}</p>
        <div class="notion-import__actions tw:flex tw:justify-end tw:gap-2">
          <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="requestClose">{{ t('workspace.notionImport.close') }}</button>
        </div>
      </template>
    </div>
  </NvModal>
</template>
