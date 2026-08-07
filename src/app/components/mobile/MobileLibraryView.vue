<script setup lang="ts">
import { ChevronRight, FilePlus2, Filter, Folder, Search, Tag } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { FolderMeta, NoteMeta, SidebarNotePreview } from '../../../types/note'

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

function folderNoteCount(folder: FolderMeta): number {
  return folder.notes.length + folder.children.reduce((total, child) => total + folderNoteCount(child), 0)
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
  <main class="mobile-workspace-view mobile-library">
    <header class="mobile-view-header">
      <div>
        <p class="mobile-view-header__eyebrow">{{ workspaceName }}</p>
        <h1>{{ t('workspace.mobile.library.title') }}</h1>
      </div>
      <button
        type="button"
        class="mobile-icon-button mobile-icon-button--strong"
        :aria-label="t('workspace.actions.newNote')"
        @click="createNote"
      >
        <FilePlus2 :size="21" />
      </button>
    </header>

    <div class="mobile-library__tools">
      <label class="mobile-search-field">
        <Search :size="18" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          :placeholder="t('workspace.mobile.library.search')"
        />
      </label>
      <button
        type="button"
        class="mobile-icon-button"
        :aria-label="t('workspace.mobile.library.filters')"
        @click="openSearch"
      >
        <Filter :size="18" />
      </button>
    </div>

    <div class="mobile-library__tabs" role="tablist" :aria-label="t('workspace.mobile.library.contentType')">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'all'"
        :class="{ active: activeTab === 'all' }"
        @click="selectTab('all')"
      >
        {{ t('workspace.mobile.library.all') }} <span>{{ allNotes.length }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'folders'"
        :class="{ active: activeTab === 'folders' }"
        @click="selectTab('folders')"
      >
        {{ t('workspace.mobile.library.folders') }} <span>{{ allFolders.length }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'tags'"
        :class="{ active: activeTab === 'tags' }"
        @click="selectTab('tags')"
      >
        {{ t('workspace.mobile.library.tags') }} <span>{{ tags.length }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'tags'" class="mobile-tag-cloud">
      <button
        v-for="tag in tags"
        :key="tag.name"
        type="button"
        :aria-pressed="selectedTag === tag.name"
        @click="selectTag(tag.name)"
      >
        <Tag :size="14" />
        <span>{{ tag.name }}</span>
        <small>{{ tag.count }}</small>
      </button>
      <div v-if="tags.length === 0" class="mobile-empty-state">
        <Tag :size="22" />
        <strong>{{ t('workspace.mobile.library.noTags') }}</strong>
      </div>
    </section>

    <template v-else>
      <section v-if="activeTab !== 'all' || !selectedTag" class="mobile-library__section">
        <div
          v-for="folder in visibleFolders"
          :key="folder.id"
          class="mobile-library-row"
          role="button"
          tabindex="0"
          @click="openFolder(folder.id)"
          @keydown.enter="openFolder(folder.id)"
          @keydown.space.prevent="openFolder(folder.id)"
        >
          <span class="mobile-library-row__icon mobile-library-row__icon--folder">
            <Folder :size="19" />
          </span>
          <span class="mobile-library-row__copy">
            <strong>{{ folder.title }}</strong>
            <small>{{ t('workspace.mobile.library.noteCount', { count: folderNoteCount(folder) }) }}</small>
          </span>
          <ChevronRight :size="18" aria-hidden="true" />
        </div>
      </section>

      <section v-if="activeTab === 'all'" class="mobile-library__section">
        <div class="mobile-section-heading">
          <h2>{{ selectedTag ? `#${selectedTag}` : t('workspace.mobile.library.allNotes') }}</h2>
          <span>{{ t('workspace.mobile.library.byDate') }}</span>
        </div>
        <button
          v-for="note in visibleNotes"
          :key="note.id"
          type="button"
          class="mobile-note-row"
          @click="openNote(note.id)"
        >
          <span class="mobile-library-row__icon">
            <NvNoteIcon :value="note.icon" :size="18" />
          </span>
          <span class="mobile-library-row__copy">
            <strong>{{ note.title }}</strong>
            <span>{{ previewByNoteId.get(note.id)?.previewText || t('workspace.mobile.library.noPreview') }}</span>
            <small>
              <template v-for="tag in previewByNoteId.get(note.id)?.tags.slice(0, 2)" :key="tag">
                <em>#{{ tag }}</em>
              </template>
              {{ formatDate(note.updatedAt) }}
            </small>
          </span>
          <ChevronRight :size="17" aria-hidden="true" />
        </button>
        <div v-if="visibleNotes.length === 0" class="mobile-empty-state">
          <Search :size="22" />
          <strong>{{ t('workspace.mobile.library.noResults') }}</strong>
        </div>
      </section>
    </template>
  </main>
</template>
