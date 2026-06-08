<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { History, Search } from 'lucide-vue-next'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { NoteSnapshotMeta } from '../../../types/note'
import type { HistoryFileListItem } from '../../../utils/noteHistory'

interface Props {
  filteredFiles: HistoryFileListItem[]
  historyFilesCount: number
  filesLoading: boolean
  filesError: string | null
  selectedNoteId: string | null
  selectedSnapshots: NoteSnapshotMeta[]
  selectedSnapshotId: string | null
  searchQuery: string
}

defineProps<Props>()
const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:selectedNoteId': [value: string | null]
  'update:selectedSnapshotId': [value: string | null]
}>()

const { t } = useI18n()

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
</script>

<template>
  <section class="history-column">
    <div class="history-column__header">
      <h3>{{ t('workspace.history.files') }}</h3>
      <span>{{ historyFilesCount }}</span>
    </div>
    <div class="search-field history-search">
      <Search :size="12" class="sidebar-icon--muted" />
      <input
        :value="searchQuery"
        type="search"
        class="search-input"
        :placeholder="t('workspace.history.searchPlaceholder')"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div v-if="filesLoading" class="history-state">{{ t('workspace.history.states.loadingFiles') }}</div>
    <div v-else-if="filesError" class="history-state history-state--error">{{ filesError }}</div>
    <div v-else-if="!historyFilesCount" class="history-state">{{ t('workspace.history.states.noFiles') }}</div>
    <div v-else-if="!filteredFiles.length" class="history-state">{{ t('workspace.history.states.noSearchResults') }}</div>
    <div v-else class="history-list">
      <button
        v-for="file in filteredFiles"
        :key="file.id"
        type="button"
        class="history-list__item"
        :class="{ 'history-list__item--active': file.id === selectedNoteId }"
        @click="emit('update:selectedNoteId', file.id)"
      >
        <div class="history-list__icon">
          <NvNoteIcon :value="file.icon || '📄'" :size="16" />
        </div>
        <div class="history-list__body">
          <strong>{{ file.title }}</strong>
          <span>{{ t('workspace.history.snapshotCount', { count: file.snapshotCount }) }}</span>
        </div>
      </button>
    </div>
  </section>

  <section class="history-column">
    <div class="history-column__header">
      <h3>{{ t('workspace.history.versions') }}</h3>
      <span>{{ selectedSnapshots.length }}</span>
    </div>
    <div v-if="!selectedNoteId" class="history-state">{{ t('workspace.history.states.noFileSelected') }}</div>
    <div v-else-if="!selectedSnapshots.length" class="history-state">{{ t('workspace.history.states.noSnapshots') }}</div>
    <div v-else class="history-list">
      <button
        v-for="snapshot in selectedSnapshots"
        :key="snapshot.id"
        type="button"
        class="history-list__item"
        :class="{ 'history-list__item--active': snapshot.id === selectedSnapshotId }"
        @click="emit('update:selectedSnapshotId', snapshot.id)"
      >
        <div class="history-list__icon">
          <History :size="14" />
        </div>
        <div class="history-list__body">
          <strong>{{ formatTimestamp(snapshot.createdAt) }}</strong>
          <span>{{ t('workspace.history.updatedAt', { value: formatTimestamp(snapshot.updatedAt) }) }}</span>
        </div>
      </button>
    </div>
  </section>
</template>
