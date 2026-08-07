<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  FileDown,
  FileText,
  GitFork,
  ListTree,
  Tags,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import { useGraphStore } from '../../../stores/graph'
import { useNoteStore } from '../../../stores/note'
import type { NoteDocument, NoteStatus, NoteType } from '../../../types/note'
import { countWords, extractOutline } from '../../composables/useNoteOutline'

const props = defineProps<{
  note: NoteDocument
  folderPath: string
}>()

const emit = defineEmits<{
  close: []
  export: []
  'open-graph': []
  'open-outline': []
}>()

const { t, locale } = useI18n()
const noteStore = useNoteStore()
const { backlinks } = storeToRefs(useGraphStore())
const tagInput = ref('')

const properties = computed(() => props.note.properties ?? {
  type: null,
  status: null,
  date: null,
  tags: [],
})
const outlineCount = computed(() => extractOutline(props.note.content).length)
const wordCount = computed(() => countWords(props.note.content))
const readMinutes = computed(() => Math.max(1, Math.round(wordCount.value / 200)))
const dateFormatter = computed(() => new Intl.DateTimeFormat(String(locale.value), {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}))
const createdLabel = computed(() => dateFormatter.value.format(new Date(props.note.createdAt)))
const updatedLabel = computed(() => dateFormatter.value.format(new Date(props.note.updatedAt)))

const typeOptions: NoteType[] = ['note', 'task', 'idea', 'meeting', 'project', 'research']
const statusOptions: NoteStatus[] = ['none', 'draft', 'active', 'waiting', 'done']

function updateType(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  noteStore.setPropertiesPatch({ type: value ? value as NoteType : null })
}

function updateStatus(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  noteStore.setPropertiesPatch({ status: value ? value as NoteStatus : null })
}

function updateDate(event: Event) {
  noteStore.setPropertiesPatch({ date: (event.target as HTMLInputElement).value || null })
}

function addTags() {
  const nextTags = tagInput.value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
  if (!nextTags.length) return
  noteStore.setPropertiesPatch({ tags: [...properties.value.tags, ...nextTags] })
  tagInput.value = ''
}

function removeTag(index: number) {
  noteStore.setPropertiesPatch({
    tags: properties.value.tags.filter((_, tagIndex) => tagIndex !== index),
  })
}

function onTagKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ',') return
  event.preventDefault()
  addTags()
}

function closeDetails() {
  emit('close')
}

function exportNote() {
  emit('export')
}

function openGraph() {
  emit('open-graph')
}

function openOutline() {
  emit('open-outline')
}
</script>

<template>
  <section class="mobile-note-details" :aria-label="t('workspace.mobile.noteDetails.title')">
    <header class="mobile-note-details__topbar">
      <button
        type="button"
        class="mobile-note-details__icon-button"
        :aria-label="t('common.back')"
        @click="closeDetails"
      >
        <ArrowLeft :size="20" aria-hidden="true" />
      </button>
      <h1>{{ t('workspace.mobile.noteDetails.title') }}</h1>
      <button type="button" class="mobile-note-details__done" @click="closeDetails">
        {{ t('workspace.mobile.noteDetails.done') }}
      </button>
    </header>

    <div class="mobile-note-details__scroll">
      <div class="mobile-note-details__identity">
        <span class="mobile-note-details__identity-icon" aria-hidden="true">
          <NvNoteIcon :value="note.icon || '📄'" :size="28" />
        </span>
        <span class="mobile-note-details__identity-copy">
          <strong>{{ note.title || t('workspace.untitledNote') }}</strong>
          <small>{{ folderPath }}</small>
        </span>
      </div>

      <h2>{{ t('workspace.rightPanel.properties.title') }}</h2>
      <div class="mobile-note-details__group">
        <label class="mobile-note-details__row">
          <span>{{ t('workspace.rightPanel.properties.type') }}</span>
          <select :value="properties.type ?? ''" @change="updateType">
            <option value="">{{ t('workspace.rightPanel.properties.typeNone') }}</option>
            <option v-for="type in typeOptions" :key="type" :value="type">
              {{ t(`workspace.rightPanel.properties.types.${type}`) }}
            </option>
          </select>
          <ChevronRight :size="16" aria-hidden="true" />
        </label>
        <label class="mobile-note-details__row">
          <span>{{ t('workspace.rightPanel.properties.status') }}</span>
          <select :value="properties.status ?? 'none'" @change="updateStatus">
            <option v-for="status in statusOptions" :key="status" :value="status">
              {{ t(`workspace.rightPanel.properties.statuses.${status}`) }}
            </option>
          </select>
          <ChevronRight :size="16" aria-hidden="true" />
        </label>
        <label class="mobile-note-details__row">
          <span>{{ t('workspace.rightPanel.properties.date') }}</span>
          <input
            type="date"
            :value="properties.date ?? ''"
            :aria-label="t('workspace.rightPanel.properties.date')"
            @change="updateDate"
          >
          <ChevronRight :size="16" aria-hidden="true" />
        </label>
        <div class="mobile-note-details__row mobile-note-details__row--tags">
          <span>{{ t('workspace.rightPanel.properties.tags') }}</span>
          <div class="mobile-note-details__tags">
            <button
              v-for="(tag, index) in properties.tags"
              :key="`${tag}-${index}`"
              type="button"
              :aria-label="t('workspace.rightPanel.properties.removeTag', { tag })"
              @click="removeTag(index)"
            >
              {{ tag }}
            </button>
            <input
              v-model="tagInput"
              type="text"
              :placeholder="t('workspace.rightPanel.properties.addTag')"
              @keydown="onTagKeydown"
              @blur="addTags"
            >
          </div>
          <Tags :size="16" aria-hidden="true" />
        </div>
      </div>

      <h2>{{ t('workspace.mobile.noteDetails.navigation') }}</h2>
      <div class="mobile-note-details__group">
        <button type="button" class="mobile-note-details__row" @click="openOutline">
          <ListTree :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.outline') }}</span>
          <strong>{{ t('workspace.mobile.noteDetails.sections', { count: outlineCount }) }}</strong>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="mobile-note-details__row" @click="openGraph">
          <GitFork :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.backlinks') }}</span>
          <strong>{{ backlinks.length }}</strong>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="mobile-note-details__row" @click="openGraph">
          <GitFork :size="17" aria-hidden="true" />
          <span>{{ t('workspace.mobile.noteDetails.localGraph') }}</span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>

      <h2>{{ t('workspace.mobile.noteDetails.document') }}</h2>
      <div class="mobile-note-details__group">
        <div class="mobile-note-details__row">
          <FileText :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.created') }}</span>
          <strong>{{ createdLabel }}</strong>
        </div>
        <div class="mobile-note-details__row">
          <Clock3 :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.updated') }}</span>
          <strong>{{ updatedLabel }}</strong>
        </div>
        <div class="mobile-note-details__row">
          <Clock3 :size="17" aria-hidden="true" />
          <span>{{ t('workspace.mobile.noteDetails.readingTime') }}</span>
          <strong>{{ t('workspace.rightPanel.readTime', { n: readMinutes }) }}</strong>
        </div>
      </div>

      <button type="button" class="mobile-note-details__export" @click="exportNote">
        <FileDown :size="18" aria-hidden="true" />
        {{ t('workspace.mobile.noteDetails.export') }}
      </button>
    </div>
  </section>
</template>
