<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
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
          <span>{{ t('workspace.system.history') }}</span>
          <button type="button" class="history-modal__close" :aria-label="t('workspace.context.cancel')" @click="emit('close')">
            <X :size="15" />
          </button>
        </div>

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
          <div v-else />
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
              <span>{{ t('workspace.history.restoreConfirm') }}</span>
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
