<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Clock, FileText, History, Inbox, Search, SearchX } from 'lucide-vue-next'
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
      <div>
        <h3>{{ t('workspace.history.files') }}</h3>
        <p>{{ t('workspace.history.filesHint') }}</p>
      </div>
      <span class="history-count">{{ historyFilesCount }}</span>
    </div>
    <div class="search-field history-search">
      <label class="history-search__label" for="history-search-input">
        {{ t('workspace.history.searchLabel') }}
      </label>
      <Search :size="13" class="sidebar-icon--muted" aria-hidden="true" />
      <input
        id="history-search-input"
        :value="searchQuery"
        type="search"
        class="search-input"
        :placeholder="t('workspace.history.searchPlaceholder')"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div v-if="filesLoading" class="history-state">
      <span class="history-state__spinner" aria-hidden="true" />
      <strong>{{ t('workspace.history.states.loadingFilesTitle') }}</strong>
      <p>{{ t('workspace.history.states.loadingFiles') }}</p>
    </div>
    <div v-else-if="filesError" class="history-state history-state--error">{{ filesError }}</div>
    <div v-else-if="!historyFilesCount" class="history-state">
      <Inbox :size="32" aria-hidden="true" />
      <strong>{{ t('workspace.history.states.noFilesTitle') }}</strong>
      <p>{{ t('workspace.history.states.noFiles') }}</p>
    </div>
    <div v-else-if="!filteredFiles.length" class="history-state">
      <SearchX :size="32" aria-hidden="true" />
      <strong>{{ t('workspace.history.states.noSearchResultsTitle') }}</strong>
      <p>{{ t('workspace.history.states.noSearchResults') }}</p>
    </div>
    <div v-else class="history-list">
      <button
        v-for="file in filteredFiles"
        :key="file.id"
        type="button"
        class="history-list__item"
        :class="{ 'history-list__item--active': file.id === selectedNoteId }"
        :aria-pressed="file.id === selectedNoteId"
        @click="emit('update:selectedNoteId', file.id)"
      >
        <div class="history-list__icon">
          <NvNoteIcon :value="file.icon || '📄'" :size="16" />
        </div>
        <div class="history-list__body">
          <strong :title="file.title">{{ file.title }}</strong>
          <div class="history-list__meta">
            <span>{{ t('workspace.history.snapshotCount', { count: file.snapshotCount }) }}</span>
            <time :datetime="file.latestSnapshotAt">
              {{ t('workspace.history.latestSnapshotAt', { value: formatTimestamp(file.latestSnapshotAt) }) }}
            </time>
          </div>
          <span class="history-list__submeta">
            {{ t('workspace.history.noteUpdatedAt', { value: formatTimestamp(file.updatedAt) }) }}
          </span>
        </div>
      </button>
    </div>
  </section>

  <section class="history-column">
    <div class="history-column__header">
      <div>
        <h3>{{ t('workspace.history.versions') }}</h3>
        <p>{{ t('workspace.history.versionsHint') }}</p>
      </div>
      <span class="history-count">{{ selectedSnapshots.length }}</span>
    </div>
    <div v-if="!selectedNoteId" class="history-state">
      <FileText :size="32" aria-hidden="true" />
      <strong>{{ t('workspace.history.states.noFileSelectedTitle') }}</strong>
      <p>{{ t('workspace.history.states.noFileSelected') }}</p>
    </div>
    <div v-else-if="!selectedSnapshots.length" class="history-state">
      <Inbox :size="32" aria-hidden="true" />
      <strong>{{ t('workspace.history.states.noSnapshotsTitle') }}</strong>
      <p>{{ t('workspace.history.states.noSnapshots') }}</p>
    </div>
    <div v-else class="history-list">
      <button
        v-for="snapshot in selectedSnapshots"
        :key="snapshot.id"
        type="button"
        class="history-list__item"
        :class="{ 'history-list__item--active': snapshot.id === selectedSnapshotId }"
        :aria-pressed="snapshot.id === selectedSnapshotId"
        @click="emit('update:selectedSnapshotId', snapshot.id)"
      >
        <div class="history-list__icon">
          <History :size="14" />
        </div>
        <div class="history-list__body">
          <strong>
            <time :datetime="snapshot.createdAt">{{ formatTimestamp(snapshot.createdAt) }}</time>
          </strong>
          <div class="history-list__meta">
            <span>{{ t('workspace.history.snapshotVersion') }}</span>
            <span class="history-list__inline-icon">
              <Clock :size="11" aria-hidden="true" />
              {{ t('workspace.history.updatedAt', { value: formatTimestamp(snapshot.updatedAt) }) }}
            </span>
          </div>
        </div>
      </button>
    </div>
  </section>
</template>
