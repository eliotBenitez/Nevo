<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, History, RotateCcw, X } from 'lucide-vue-next'
import type { NoteDocument } from '../../types/note'
import type { WorkspaceManifest } from '../../types/workspace'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import { useHistoryData } from '../composables/useHistoryData'
import HistoryFileList from './WorkspaceHistoryModal/HistoryFileList.vue'
import HistoryPreviewPane from './WorkspaceHistoryModal/HistoryPreviewPane.vue'

interface Props {
  open: boolean
  workspacePath: string | null
  manifest: WorkspaceManifest | null
  activeNoteId: string | null
  activeNote: NoteDocument | null
  preselectedNoteId: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  restored: [note: NoteDocument]
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef, computed(() => props.open))

function onWindowKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

function toggleEscapeListener(enabled: boolean) {
  window.removeEventListener('keydown', onWindowKeydown, true)
  if (enabled) window.addEventListener('keydown', onWindowKeydown, true)
}

watch(() => props.open, (open) => {
  toggleEscapeListener(open)
  if (open) nextTick(activate)
  else deactivate()
}, { immediate: true })

onBeforeUnmount(() => { toggleEscapeListener(false) })

const {
  searchQuery, selectedNoteId, selectedSnapshotId, paneMode,
  filesLoading, filesError, paneLoading, previewError, compareError,
  restoreError, restoring, confirmRestoreOpen,
  historyFiles, filteredFiles, selectedSnapshots, previewBlocks, compareDiff,
  selectedSnapshot, confirmRestore,
} = useHistoryData(
  () => props,
  (note) => emit('restored', note),
  (key, params) => t(key, params ?? {}),
)

const selectedHistoryFile = computed(() => historyFiles.value.find(file => file.id === selectedNoteId.value) ?? null)
const selectedSnapshotMeta = computed(() => selectedSnapshots.value.find(snapshot => snapshot.id === selectedSnapshotId.value) ?? null)

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="history-modal-backdrop" @click.self="emit('close')">
      <section
        ref="dialogRef"
        class="history-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('workspace.system.history')"
      >
        <div class="history-modal__titlebar">
          <span class="history-modal__chrome-title">
            <History :size="13" aria-hidden="true" />
            {{ t('workspace.system.history') }}
          </span>
          <button type="button" class="history-modal__close" :aria-label="t('workspace.context.cancel')" @click="emit('close')">
            <X :size="15" />
          </button>
        </div>

        <header class="history-modal__hero">
          <div class="history-modal__identity">
            <span class="history-modal__hero-icon" aria-hidden="true">
              <History :size="19" />
            </span>
            <div>
              <h2>{{ t('workspace.history.title') }}</h2>
              <p>{{ t('workspace.history.description') }}</p>
            </div>
          </div>
          <div class="history-modal__summary" aria-live="polite">
            <div class="history-modal__summary-item">
              <span>{{ t('workspace.history.files') }}</span>
              <strong>{{ historyFiles.length }}</strong>
            </div>
            <div class="history-modal__summary-item">
              <span>{{ t('workspace.history.versions') }}</span>
              <strong>{{ selectedSnapshots.length }}</strong>
            </div>
            <div v-if="selectedHistoryFile" class="history-modal__selection">
              <span class="history-modal__selection-icon" aria-hidden="true">
                <Clock :size="14" />
              </span>
              <div>
                <strong>{{ selectedHistoryFile.title }}</strong>
                <span v-if="selectedSnapshotMeta">
                  {{ t('workspace.history.snapshotCreatedAt', { value: formatTimestamp(selectedSnapshotMeta.createdAt) }) }}
                </span>
                <span v-else>
                  {{ t('workspace.history.noSnapshotSelection') }}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div class="history-modal__shell">
          <HistoryFileList
            :filtered-files="filteredFiles"
            :history-files-count="historyFiles.length"
            :files-loading="filesLoading"
            :files-error="filesError"
            :selected-note-id="selectedNoteId"
            :selected-snapshots="selectedSnapshots"
            :selected-snapshot-id="selectedSnapshotId"
            :search-query="searchQuery"
            @update:search-query="searchQuery = $event"
            @update:selected-note-id="selectedNoteId = $event"
            @update:selected-snapshot-id="selectedSnapshotId = $event"
          />
          <HistoryPreviewPane
            :pane-mode="paneMode"
            :pane-loading="paneLoading"
            :selected-snapshot-id="selectedSnapshotId"
            :preview-error="previewError"
            :compare-error="compareError"
            :preview-blocks="previewBlocks"
            :selected-snapshot="selectedSnapshot"
            :compare-diff="compareDiff"
            @update:pane-mode="paneMode = $event"
          />
        </div>

        <footer class="history-modal__footer">
          <div v-if="restoreError" class="history-state history-state--error history-state--footer">{{ restoreError }}</div>
          <div v-else class="history-modal__footer-hint">
            {{ selectedSnapshotId ? t('workspace.history.restoreSelectionHint') : t('workspace.history.states.noSnapshotSelected') }}
          </div>
          <div class="history-modal__footer-actions">
            <button type="button" class="nv-btn" @click="emit('close')">{{ t('workspace.context.cancel') }}</button>
            <button
              v-if="!confirmRestoreOpen"
              type="button"
              class="nv-btn nv-btn--primary"
              :disabled="!selectedSnapshotId || restoring"
              @click="confirmRestoreOpen = true"
            >
              {{ t('workspace.history.restore') }}
            </button>
            <div v-else class="history-confirm">
              <span class="history-confirm__icon" aria-hidden="true">
                <RotateCcw :size="13" />
              </span>
              <span class="history-confirm__text">{{ t('workspace.history.restoreConfirm') }}</span>
              <button type="button" class="nv-btn" :disabled="restoring" @click="confirmRestoreOpen = false">
                {{ t('workspace.context.cancel') }}
              </button>
              <button type="button" class="nv-btn nv-btn--primary" :class="{ 'nv-btn--loading': restoring }" :disabled="restoring" @click="confirmRestore">
                <span v-if="restoring" class="nv-btn__spinner" aria-hidden="true" />
                {{ t('workspace.context.confirm') }}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
