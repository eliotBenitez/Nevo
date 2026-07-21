<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
// previously focused button, and the backdrop's Escape handler only sees the
// key while focus is still inside the dialog.
watch([() => props.open, stage], ([open]) => {
  if (!open) return
  void nextTick(() => primaryButtonRef.value?.focus())
}, { immediate: true })

async function startImport() {
  result.value = await importVault(props.targetFolderId)
}

function requestClose() {
  if (stage.value === 'running') return
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="obsidian-import-backdrop"
      @click.self="requestClose"
      @keydown.escape.prevent="requestClose"
    >
      <section
        class="obsidian-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="obsidian-import-heading"
      >
        <template v-if="stage === 'idle'">
          <h3 id="obsidian-import-heading" class="obsidian-import__title">{{ t('workspace.obsidianImport.title') }}</h3>
          <p class="obsidian-import__description">{{ t('workspace.obsidianImport.description') }}</p>
          <div class="obsidian-import__actions">
            <button type="button" class="nv-btn" @click="emit('close')">{{ t('workspace.obsidianImport.cancel') }}</button>
            <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="startImport">
              {{ t('workspace.obsidianImport.selectFolder') }}
            </button>
          </div>
        </template>

        <template v-else-if="stage === 'running'">
          <h3 id="obsidian-import-heading" class="obsidian-import__title">{{ t('workspace.obsidianImport.title') }}</h3>
          <p class="obsidian-import__phase">{{ phaseLabel }}</p>
          <div
            class="obsidian-import__progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="progressPercent"
          >
            <div class="obsidian-import__progress-fill" :style="{ width: `${progressPercent}%` }" />
          </div>
          <p class="obsidian-import__count">
            {{ t('workspace.obsidianImport.progressCount', { processed: progress.processedNotes, total: progress.totalNotes }) }}
          </p>
        </template>

        <template v-else-if="stage === 'done'">
          <h3 id="obsidian-import-heading" class="obsidian-import__title">{{ t('workspace.obsidianImport.doneTitle') }}</h3>
          <p class="obsidian-import__vault">{{ t('workspace.obsidianImport.vaultName') }}: {{ result?.rootName }}</p>
          <dl class="obsidian-import__stats">
            <div class="obsidian-import__stat">
              <dt>{{ t('workspace.obsidianImport.notesCreated') }}</dt>
              <dd>{{ result?.notesCreated }}</dd>
            </div>
            <div class="obsidian-import__stat">
              <dt>{{ t('workspace.obsidianImport.foldersCreated') }}</dt>
              <dd>{{ result?.foldersCreated }}</dd>
            </div>
            <div class="obsidian-import__stat">
              <dt>{{ t('workspace.obsidianImport.attachmentsImported') }}</dt>
              <dd>{{ result?.attachmentsImported }}</dd>
            </div>
            <div class="obsidian-import__stat">
              <dt>{{ t('workspace.obsidianImport.tagsCollected') }}</dt>
              <dd>{{ result?.tagsCollected }}</dd>
            </div>
            <div class="obsidian-import__stat">
              <dt>{{ t('workspace.obsidianImport.notesWithFrontmatter') }}</dt>
              <dd>{{ result?.notesWithFrontmatter }}</dd>
            </div>
            <div v-if="(result?.unresolvedLinks ?? 0) > 0" class="obsidian-import__stat obsidian-import__stat--warning">
              <dt>{{ t('workspace.obsidianImport.unresolvedLinks') }}</dt>
              <dd>{{ result?.unresolvedLinks }}</dd>
            </div>
            <div v-if="(result?.unresolvedEmbeds ?? 0) > 0" class="obsidian-import__stat obsidian-import__stat--warning">
              <dt>{{ t('workspace.obsidianImport.unresolvedEmbeds') }}</dt>
              <dd>{{ result?.unresolvedEmbeds }}</dd>
            </div>
            <div v-if="(result?.skippedFiles ?? 0) > 0" class="obsidian-import__stat obsidian-import__stat--warning">
              <dt>{{ t('workspace.obsidianImport.skippedFiles') }}</dt>
              <dd>{{ result?.skippedFiles }}</dd>
            </div>
          </dl>
          <div class="obsidian-import__actions">
            <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="emit('close')">{{ t('workspace.obsidianImport.close') }}</button>
          </div>
        </template>

        <template v-else>
          <h3 id="obsidian-import-heading" class="obsidian-import__title">{{ t('workspace.obsidianImport.errorTitle') }}</h3>
          <p class="obsidian-import__error">{{ progress.error }}</p>
          <div class="obsidian-import__actions">
            <button ref="primaryButtonRef" type="button" class="nv-btn nv-btn--primary" @click="emit('close')">{{ t('workspace.obsidianImport.close') }}</button>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.obsidian-import-backdrop {
  position: fixed;
  inset: 0;
  background: oklch(0 0 0 / 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 50;
}

.obsidian-import {
  width: min(440px, calc(100vw - 24px));
  border-radius: calc(14px * var(--radius-scale, 1));
  border: 1px solid var(--line-2);
  background: var(--glass-3);
  box-shadow: var(--shadow-pop);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.obsidian-import__title {
  margin: 0;
  font-size: 15px;
  color: var(--text-1);
  font-weight: 560;
}

.obsidian-import__description,
.obsidian-import__phase,
.obsidian-import__count,
.obsidian-import__vault {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.45;
}

.obsidian-import__progress {
  width: 100%;
  height: 8px;
  border-radius: calc(4px * var(--radius-scale, 1));
  background: var(--surface-2);
  overflow: hidden;
}

.obsidian-import__progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.obsidian-import__stats {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.obsidian-import__stat {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-2);
}

.obsidian-import__stat dt {
  color: var(--text-muted);
}

.obsidian-import__stat dd {
  margin: 0;
  color: var(--text-1);
  font-weight: 560;
}

.obsidian-import__stat--warning dt,
.obsidian-import__stat--warning dd {
  color: var(--danger);
}

.obsidian-import__error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
  line-height: 1.45;
}

.obsidian-import__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .obsidian-import__progress-fill {
    transition: none;
  }
}
</style>
