<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTreeStore } from '../../stores/tree'
import { useNoteStore } from '../../stores/note'
import HistoryTopBar from './HistoryTopBar.vue'
import HistoryTimeline from './HistoryTimeline.vue'
import HistoryDiffPane from './HistoryDiffPane.vue'
import { useNoteHistory } from './useNoteHistory'
import { useFirstUseHint } from '../onboarding/hints/useFirstUseHint'
import { formatHistoryTimestamp } from './formatHistoryTimestamp'

interface Props {
  noteId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  back: []
  'open-note': [noteId: string]
}>()

const treeStore = useTreeStore()
const noteStore = useNoteStore()
const { t, locale } = useI18n()

useFirstUseHint('historyRestore')

const noteIdRef = computed(() => props.noteId)
const {
  snapshots,
  snapshotsLoading,
  snapshotsError,
  selectedSnapshotId,
  selectedSnapshotLoaded,
  selectSnapshot,
  snapshotLoading,
  snapshotError,
  currentNoteLoading,
  currentNoteError,
  diff,
  previewBlocks,
  notebookPreviewPages,
  restoring,
  restoreError,
  confirmation,
  requestRestore,
  cancelRestore,
  confirmRestore,
  recoverySnapshotId,
  restoreWarning,
  restoreSucceeded,
  retrySnapshots,
  retrySnapshot,
  retryCurrentNote,
  copying,
  copyError,
  copySelectedSnapshot,
} = useNoteHistory(noteIdRef)

async function copyVersion() {
  const copiedNoteId = await copySelectedSnapshot()
  if (copiedNoteId) emit('open-note', copiedNoteId)
}

// Falls back to the live store when the note isn't in the tree (e.g. it was
// just restored and the tree hasn't re-synced its meta yet).
const noteMeta = computed(() => treeStore.noteById.get(props.noteId))
const noteTitle = computed(() => noteMeta.value?.title ?? noteStore.activeNote?.title ?? '')
const noteIcon = computed(() => noteMeta.value?.icon ?? noteStore.activeNote?.icon ?? '📄')
</script>

<template>
  <div class="history-view tw:flex tw:h-full tw:min-h-0 tw:w-full tw:flex-col tw:bg-[var(--workspace-editor-surface,var(--surface-canvas))]">
    <HistoryTopBar
      :note-title="noteTitle"
      :note-icon="noteIcon"
      :confirmation="confirmation"
      :confirm-label="confirmation ? formatHistoryTimestamp(confirmation.createdAt, locale, t) : ''"
      :can-restore="selectedSnapshotLoaded"
      :can-copy="selectedSnapshotLoaded"
      :restoring="restoring"
      :restore-error="restoreError"
      :restore-warning="restoreWarning"
      :restore-succeeded="restoreSucceeded"
      :copying="copying"
      :copy-error="copyError"
      @back="emit('back')"
      @copy="copyVersion"
      @request-restore="requestRestore"
      @cancel-restore="cancelRestore"
      @confirm-restore="confirmRestore"
    />
    <div class="history-view__body tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[clamp(420px,26vw,520px)_minmax(0,1fr)] tw:max-[900px]:flex tw:max-[900px]:flex-col tw:max-[900px]:overflow-y-auto">
      <HistoryTimeline
        :snapshots="snapshots"
        :selected-id="selectedSnapshotId"
        :loading="snapshotsLoading"
        :error="snapshotsError"
        :recovery-id="recoverySnapshotId"
        @select="selectSnapshot"
        @retry="retrySnapshots"
      />
      <HistoryDiffPane
        :has-selection="!!selectedSnapshotId"
        :loading="snapshotLoading || currentNoteLoading"
        :error="snapshotError"
        :current-note-error="currentNoteError"
        :diff="diff"
        :preview-blocks="previewBlocks"
        :notebook-preview-pages="notebookPreviewPages"
        @retry="retrySnapshot"
        @retry-current-note="retryCurrentNote"
      />
    </div>
  </div>
</template>
