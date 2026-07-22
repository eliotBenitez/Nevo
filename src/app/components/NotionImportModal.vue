<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotionImport } from '../../composables/useNotionImport'
import type { NotionImportResult } from '../../types/notion-import'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { importing, progress, importExport } = useNotionImport()
const result = ref<NotionImportResult | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const primaryButtonRef = ref<HTMLButtonElement | null>(null)

type Stage = 'idle' | 'running' | 'done' | 'error'
const stage = computed<Stage>(() => {
  if (progress.value.phase === 'error') return 'error'
  if (result.value) return 'done'
  if (importing.value) return 'running'
  return 'idle'
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

function requestClose() {
  if (stage.value !== 'running') emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = [...(dialogRef.value?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
  if (!focusable.length) return
  const current = focusable.indexOf(document.activeElement as HTMLElement)
  const next = event.shiftKey
    ? (current <= 0 ? focusable.length - 1 : current - 1)
    : (current >= focusable.length - 1 ? 0 : current + 1)
  event.preventDefault()
  focusable[next]?.focus()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="notion-import-backdrop" @click.self="requestClose" @keydown="onKeydown">
      <section
        ref="dialogRef"
        class="notion-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notion-import-heading"
      >
        <template v-if="stage === 'idle'">
          <h3 id="notion-import-heading" class="notion-import__title">{{ t('workspace.notionImport.title') }}</h3>
          <p class="notion-import__description">{{ t('workspace.notionImport.description') }}</p>
          <p class="notion-import__hint">{{ t('workspace.notionImport.localOnly') }}</p>
          <div class="notion-import__actions">
            <button type="button" class="nv-btn" @click="requestClose">{{ t('workspace.notionImport.cancel') }}</button>
            <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="startImport">
              {{ t('workspace.notionImport.selectZip') }}
            </button>
          </div>
        </template>

        <template v-else-if="stage === 'running'">
          <h3 id="notion-import-heading" class="notion-import__title">{{ t('workspace.notionImport.title') }}</h3>
          <p class="notion-import__phase" role="status">{{ phaseLabel }}</p>
          <div class="notion-import__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressPercent">
            <div class="notion-import__progress-fill" :style="{ width: `${progressPercent}%` }" />
          </div>
          <p class="notion-import__count">
            {{ t('workspace.notionImport.progressCount', { processed: progress.processedItems, total: progress.totalItems }) }}
          </p>
        </template>

        <template v-else-if="stage === 'done'">
          <h3 id="notion-import-heading" class="notion-import__title">{{ t('workspace.notionImport.doneTitle') }}</h3>
          <p class="notion-import__description">{{ result?.rootName }}</p>
          <dl class="notion-import__stats">
            <div><dt>{{ t('workspace.notionImport.notesCreated') }}</dt><dd>{{ result?.notesCreated }}</dd></div>
            <div><dt>{{ t('workspace.notionImport.foldersCreated') }}</dt><dd>{{ result?.foldersCreated }}</dd></div>
            <div><dt>{{ t('workspace.notionImport.databasesCreated') }}</dt><dd>{{ result?.databasesCreated }}</dd></div>
            <div><dt>{{ t('workspace.notionImport.assetsImported') }}</dt><dd>{{ result?.assetsImported }}</dd></div>
            <div v-if="result?.warnings" class="is-warning"><dt>{{ t('workspace.notionImport.warnings') }}</dt><dd>{{ result.warnings }}</dd></div>
            <div v-if="result?.errors" class="is-warning"><dt>{{ t('workspace.notionImport.errors') }}</dt><dd>{{ result.errors }}</dd></div>
          </dl>
          <details v-if="result?.issues.length" class="notion-import__issues">
            <summary>{{ t('workspace.notionImport.issueDetails') }}</summary>
            <ul><li v-for="(item, index) in result.issues" :key="`${item.path}-${index}`"><strong>{{ item.path }}</strong>: {{ item.reason }}</li></ul>
          </details>
          <div class="notion-import__actions">
            <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="requestClose">{{ t('workspace.notionImport.close') }}</button>
          </div>
        </template>

        <template v-else>
          <h3 id="notion-import-heading" class="notion-import__title">{{ t('workspace.notionImport.errorTitle') }}</h3>
          <p class="notion-import__error" role="alert">{{ progress.error }}</p>
          <div class="notion-import__actions">
            <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="requestClose">{{ t('workspace.notionImport.close') }}</button>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.notion-import-backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 12px; background: oklch(0 0 0 / 0.35); backdrop-filter: blur(4px); z-index: 50; }
.notion-import { width: min(480px, 100%); max-height: min(680px, calc(100vh - 24px)); overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 18px; border: 1px solid var(--line-2); border-radius: calc(14px * var(--radius-scale, 1)); background: var(--glass-3); box-shadow: var(--shadow-pop); }
.notion-import__title { margin: 0; color: var(--text-1); font-size: 16px; }
.notion-import__description, .notion-import__hint, .notion-import__phase, .notion-import__count, .notion-import__error { margin: 0; color: var(--text-2); font-size: 13px; line-height: 1.5; }
.notion-import__hint { color: var(--text-3); }
.notion-import__progress { height: 8px; overflow: hidden; border-radius: 999px; background: var(--surface-2); }
.notion-import__progress-fill { height: 100%; background: var(--accent); transition: width 160ms ease; }
.notion-import__stats { display: grid; gap: 6px; margin: 0; }
.notion-import__stats > div { display: flex; justify-content: space-between; gap: 16px; color: var(--text-2); font-size: 13px; }
.notion-import__stats dd { margin: 0; color: var(--text-1); font-variant-numeric: tabular-nums; }
.notion-import__stats .is-warning dt, .notion-import__stats .is-warning dd, .notion-import__error { color: var(--danger); }
.notion-import__issues { color: var(--text-2); font-size: 12px; }
.notion-import__issues ul { max-height: 160px; overflow: auto; padding-left: 20px; }
.notion-import__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
@media (prefers-reduced-motion: reduce) { .notion-import__progress-fill { transition: none; } }
</style>
