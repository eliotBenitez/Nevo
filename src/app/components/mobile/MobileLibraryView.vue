<script setup lang="ts">
import { mobileWorkspaceViewClass, mobileViewHeaderClass, mobileViewEyebrowClass, mobileViewTitleClass, mobileIconButtonClass, mobileIconButtonStrongClass, mobileIconButtonDefaultClass, mobileLibraryTabClass, mobileLibraryTabBadgeClass, mobileEmptyStateClass } from './mobileChromeClasses'
import { ChevronRight, FilePlus2, Filter, Folder, Search, Tag } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { FolderMeta, NoteMeta, SidebarNotePreview } from '../../../types/note'
import { folderNoteCount } from '../../../utils/folder-note-count'
import { pluralChoice } from '../../../utils/plural-index'
import { notebookPreviewSummary } from '../../../utils/sidebar/sidebarNotePreviews'

type LibraryTab = 'all' | 'folders' | 'tags'

const props = defineProps<{
  workspaceName: string
  rootNotes: NoteMeta[]
  folders: FolderMeta[]
  previews: SidebarNotePreview[]
}>()

const emit = defineEmits<{
  'create-note': []
  'open-note': [noteId: string]
  'open-folder': [folderId: string]
  'open-search': []
}>()

const { t, locale } = useI18n()
const query = ref('')
const activeTab = ref<LibraryTab>('all')
const selectedTag = ref<string | null>(null)

function flattenFolders(folders: FolderMeta[]): FolderMeta[] {
  return folders.flatMap(folder => [folder, ...flattenFolders(folder.children)])
}

function notesInFolders(folders: FolderMeta[]): NoteMeta[] {
  return folders.flatMap(folder => [...folder.notes, ...notesInFolders(folder.children)])
}

const allFolders = computed(() => flattenFolders(props.folders))
const allNotes = computed(() => [...props.rootNotes, ...notesInFolders(props.folders)])
const previewByNoteId = computed(() => new Map(props.previews.map(preview => [preview.noteId, preview])))

function previewLine(noteId: string): string {
  const preview = previewByNoteId.value.get(noteId)
  if (preview?.previewText) return preview.previewText
  const notebook = preview && notebookPreviewSummary(preview, t, count => pluralChoice(String(locale.value), count))
  return notebook || t('workspace.mobile.library.noPreview')
}
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase(String(locale.value)))

const tags = computed(() => {
  const counts = new Map<string, number>()
  for (const preview of props.previews) {
    for (const tag of preview.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
})

const visibleFolders = computed(() => {
  const needle = normalizedQuery.value
  return allFolders.value.filter(folder => !needle || folder.title.toLocaleLowerCase(String(locale.value)).includes(needle))
})

const visibleNotes = computed(() => {
  const needle = normalizedQuery.value
  return allNotes.value
    .filter(note => {
      const preview = previewByNoteId.value.get(note.id)
      const matchesQuery = !needle || [
        note.title,
        preview?.previewText ?? '',
        ...(preview?.tags ?? []),
      ].some(value => value.toLocaleLowerCase(String(locale.value)).includes(needle))
      const matchesTag = !selectedTag.value || preview?.tags.includes(selectedTag.value)
      return matchesQuery && matchesTag
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
})

function selectTab(tab: LibraryTab) {
  activeTab.value = tab
  if (tab !== 'all') selectedTag.value = null
}

function selectTag(tag: string) {
  selectedTag.value = selectedTag.value === tag ? null : tag
  activeTab.value = 'all'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(String(locale.value), { day: 'numeric', month: 'short' }).format(date)
}

function createNote() {
  emit('create-note')
}

function openNote(noteId: string) {
  emit('open-note', noteId)
}

function openFolder(folderId: string) {
  emit('open-folder', folderId)
}

function openSearch() {
  emit('open-search')
}
</script>

<template>
  <main class="mobile-workspace-view mobile-library" :class="mobileWorkspaceViewClass">
    <header class="mobile-view-header" :class="mobileViewHeaderClass">
      <div>
        <p class="mobile-view-header__eyebrow" :class="mobileViewEyebrowClass">{{ workspaceName }}</p>
        <h1 :class="mobileViewTitleClass">{{ t('workspace.mobile.library.title') }}</h1>
      </div>
      <button
        type="button"
        class="mobile-icon-button mobile-icon-button--strong" :class="[mobileIconButtonClass, mobileIconButtonStrongClass]"
        :aria-label="t('workspace.actions.newNote')"
        @click="createNote"
      >
        <FilePlus2 :size="21" />
      </button>
    </header>

    <div class="mobile-library__tools tw:flex tw:items-center tw:gap-2.5">
      <label class="mobile-search-field tw:flex tw:min-w-0 tw:min-h-12 tw:flex-1 tw:items-center tw:gap-2.5 tw:rounded-[calc(15px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--input-bg) tw:px-3.5 tw:text-content-muted tw:transition-[border-color,box-shadow,background] tw:duration-[160ms] tw:focus-within:bg-(--surface-raised) tw:focus-within:text-accent tw:focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
        <Search :size="18" aria-hidden="true" />
        <input
          v-model="query"
          class="tw:h-[46px] tw:w-full tw:min-w-0 tw:border-0 tw:bg-transparent tw:p-0 tw:[font-family:inherit] tw:text-sm tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted tw:placeholder:opacity-100"
          type="search"
          :placeholder="t('workspace.mobile.library.search')"
        />
      </label>
      <button
        type="button"
        class="mobile-icon-button" :class="[mobileIconButtonClass, mobileIconButtonDefaultClass]"
        :aria-label="t('workspace.mobile.library.filters')"
        @click="openSearch"
      >
        <Filter :size="18" />
      </button>
    </div>

    <div class="mobile-library__tabs tw:mt-[5px] tw:flex tw:min-h-[54px] tw:items-end tw:gap-[22px] tw:border-b-0" role="tablist" :aria-label="t('workspace.mobile.library.contentType')">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'all'"
        :class="[mobileLibraryTabClass, { active: activeTab === 'all' }]"
        @click="selectTab('all')"
      >
        {{ t('workspace.mobile.library.all') }} <span :class="[mobileLibraryTabBadgeClass, activeTab === 'all' ? 'tw:bg-(--accent-soft) tw:text-[color-mix(in_oklab,var(--accent)_72%,var(--text-primary))]' : 'tw:bg-(--surface-raised) tw:text-content-muted']">{{ allNotes.length }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'folders'"
        :class="[mobileLibraryTabClass, { active: activeTab === 'folders' }]"
        @click="selectTab('folders')"
      >
        {{ t('workspace.mobile.library.folders') }} <span :class="[mobileLibraryTabBadgeClass, activeTab === 'folders' ? 'tw:bg-(--accent-soft) tw:text-[color-mix(in_oklab,var(--accent)_72%,var(--text-primary))]' : 'tw:bg-(--surface-raised) tw:text-content-muted']">{{ allFolders.length }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'tags'"
        :class="[mobileLibraryTabClass, { active: activeTab === 'tags' }]"
        @click="selectTab('tags')"
      >
        {{ t('workspace.mobile.library.tags') }} <span :class="[mobileLibraryTabBadgeClass, activeTab === 'tags' ? 'tw:bg-(--accent-soft) tw:text-[color-mix(in_oklab,var(--accent)_72%,var(--text-primary))]' : 'tw:bg-(--surface-raised) tw:text-content-muted']">{{ tags.length }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'tags'" class="mobile-tag-cloud tw:flex tw:flex-wrap tw:gap-2.5 tw:pt-[22px]">
      <button
        v-for="tag in tags"
        :key="tag.name"
        type="button"
        class="tw:inline-flex tw:min-h-11 tw:items-center tw:gap-[7px] tw:rounded-full tw:border tw:border-transparent tw:bg-surface-subtle tw:px-[13px] tw:[font-family:inherit] tw:text-[13px] tw:text-content-secondary tw:aria-pressed:bg-(--accent-soft) tw:aria-pressed:text-content-primary tw:aria-pressed:shadow-[0_0_0_2px_var(--accent)]"
        :aria-pressed="selectedTag === tag.name"
        @click="selectTag(tag.name)"
      >
        <Tag :size="14" />
        <span>{{ tag.name }}</span>
        <small class="tw:text-content-muted">{{ tag.count }}</small>
      </button>
      <div v-if="tags.length === 0" class="mobile-empty-state" :class="mobileEmptyStateClass">
        <Tag :size="22" />
        <strong class="tw:text-sm tw:text-content-secondary">{{ t('workspace.mobile.library.noTags') }}</strong>
      </div>
    </section>

    <template v-else>
      <section v-if="activeTab !== 'all' || !selectedTag" class="mobile-library__section tw:mt-[9px]">
        <div
          v-for="folder in visibleFolders"
          :key="folder.id"
          class="mobile-library-row tw:flex tw:min-h-[68px] tw:cursor-pointer tw:items-center tw:gap-3 tw:border-b-0 tw:px-0.5 tw:py-2 tw:text-content-primary"
          role="button"
          tabindex="0"
          @click="openFolder(folder.id)"
          @keydown.enter="openFolder(folder.id)"
          @keydown.space.prevent="openFolder(folder.id)"
        >
          <span class="mobile-library-row__icon mobile-library-row__icon--folder tw:grid tw:size-[42px] tw:flex-[0_0_42px] tw:place-items-center tw:rounded-[calc(13px*var(--radius-scale,1))] tw:bg-(--accent-soft) tw:text-[color-mix(in_oklab,var(--accent)_80%,var(--text-primary))]">
            <Folder :size="19" />
          </span>
          <span class="mobile-library-row__copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
            <strong class="tw:truncate tw:text-[15px] tw:font-[630] tw:tracking-[-0.01em]">{{ folder.title }}</strong>
            <small class="tw:flex tw:min-h-[18px] tw:items-center tw:gap-[5px] tw:truncate tw:text-[10px] tw:text-content-muted">{{ t('workspace.mobile.library.noteCount', { count: folderNoteCount(folder) }) }}</small>
          </span>
          <ChevronRight :size="18" aria-hidden="true" />
        </div>
      </section>

      <section v-if="activeTab === 'all'" class="mobile-library__section tw:mt-[9px]">
        <div class="mobile-section-heading tw:mt-2.5 tw:flex tw:min-h-[54px] tw:items-center tw:justify-between tw:gap-3">
          <h2 class="tw:m-0 tw:text-base tw:font-[650] tw:tracking-[-0.015em]">{{ selectedTag ? `#${selectedTag}` : t('workspace.mobile.library.allNotes') }}</h2>
          <span class="tw:text-[11px] tw:text-[color-mix(in_oklab,var(--accent)_80%,var(--text-secondary))]">{{ t('workspace.mobile.library.byDate') }}</span>
        </div>
        <button
          v-for="note in visibleNotes"
          :key="note.id"
          type="button"
          class="mobile-note-row tw:flex tw:min-h-[94px] tw:w-full tw:items-start tw:gap-3 tw:border-0 tw:bg-transparent tw:px-0.5 tw:py-[13px] tw:text-left tw:text-content-primary"
          @click="openNote(note.id)"
        >
          <span class="mobile-library-row__icon tw:grid tw:size-[42px] tw:flex-[0_0_42px] tw:place-items-center tw:rounded-[calc(13px*var(--radius-scale,1))] tw:bg-(--accent-soft) tw:text-[color-mix(in_oklab,var(--accent)_80%,var(--text-primary))]">
            <NvNoteIcon :value="note.icon" :size="18" />
          </span>
          <span class="mobile-library-row__copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
            <strong class="tw:truncate tw:text-[15px] tw:font-[630] tw:tracking-[-0.01em]">{{ note.title }}</strong>
            <span class="tw:line-clamp-2 tw:text-xs tw:leading-[1.4] tw:text-content-muted">{{ previewLine(note.id) }}</span>
            <small class="tw:flex tw:min-h-[18px] tw:items-center tw:gap-[5px] tw:truncate tw:text-[10px] tw:text-content-muted">
              <template v-for="tag in previewByNoteId.get(note.id)?.tags.slice(0, 2)" :key="tag">
                <em class="tw:rounded-full tw:border tw:border-transparent tw:bg-surface-subtle tw:px-1.5 tw:py-0.5 tw:not-italic tw:text-content-muted">#{{ tag }}</em>
              </template>
              {{ formatDate(note.updatedAt) }}
            </small>
          </span>
          <ChevronRight :size="17" aria-hidden="true" />
        </button>
        <div v-if="visibleNotes.length === 0" class="mobile-empty-state" :class="mobileEmptyStateClass">
          <Search :size="22" />
          <strong class="tw:text-sm tw:text-content-secondary">{{ t('workspace.mobile.library.noResults') }}</strong>
        </div>
      </section>
    </template>
  </main>
</template>
