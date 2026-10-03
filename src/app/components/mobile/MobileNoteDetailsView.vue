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

const detailGroupClass = 'tw:overflow-hidden tw:rounded-[calc(17px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--island-bg) tw:shadow-[0_18px_40px_-34px_var(--shadow)]'
const detailRowClass = 'tw:flex tw:min-h-[54px] tw:w-full tw:gap-2.5 tw:border-0 tw:bg-transparent tw:px-[13px] tw:py-2 tw:[font-family:inherit] tw:text-left tw:text-[13px] tw:text-content-secondary tw:[&>svg]:shrink-0 tw:[&>svg]:text-content-muted tw:[&>span]:min-w-0 tw:[&>span]:flex-1 tw:[&>strong]:max-w-[48%] tw:[&>strong]:truncate tw:[&>strong]:text-xs tw:[&>strong]:font-[520] tw:[&>strong]:text-content-muted'
const detailSectionTitleClass = 'tw:mx-1 tw:mt-6 tw:mb-2 tw:text-[10px] tw:font-[720] tw:tracking-[0.12em] tw:uppercase tw:text-content-muted'
const detailFieldClass = 'tw:h-[38px] tw:min-w-0 tw:max-w-[52%] tw:border-0 tw:bg-transparent tw:p-0 tw:[font-family:inherit] tw:text-right tw:text-xs tw:text-content-muted tw:outline-none'

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
  <section class="mobile-note-details tw:relative tw:z-3 tw:flex tw:min-h-0 tw:min-w-0 tw:w-full tw:flex-1 tw:flex-col tw:bg-(--frame-bg) tw:text-content-primary" :aria-label="t('workspace.mobile.noteDetails.title')">
    <header class="mobile-note-details__topbar tw:grid tw:min-h-[calc(58px+max(var(--safe-area-top),0px))] tw:flex-[0_0_auto] tw:grid-cols-[72px_minmax(0,1fr)_72px] tw:items-end tw:border-b-0 tw:bg-(--frame-bg) tw:pt-[max(var(--safe-area-top),0px)] tw:pr-[calc(12px+max(var(--safe-area-right),0px))] tw:pb-[7px] tw:pl-[calc(12px+max(var(--safe-area-left),0px))]">
      <button
        type="button"
        class="mobile-note-details__icon-button tw:grid tw:min-h-11 tw:w-11 tw:place-items-center tw:rounded-[calc(13px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-0 tw:[font-family:inherit] tw:text-content-secondary"
        :aria-label="t('common.back')"
        @click="closeDetails"
      >
        <ArrowLeft :size="20" aria-hidden="true" />
      </button>
      <h1 class="tw:m-0 tw:self-center tw:truncate tw:text-center tw:text-sm tw:font-[650]">{{ t('workspace.mobile.noteDetails.title') }}</h1>
      <button type="button" class="mobile-note-details__done tw:min-h-11 tw:justify-self-end tw:border-0 tw:bg-transparent tw:px-1 tw:py-0 tw:[font-family:inherit] tw:text-[13px] tw:font-[650] tw:text-accent" @click="closeDetails">
        {{ t('workspace.mobile.noteDetails.done') }}
      </button>
    </header>

    <div class="mobile-note-details__scroll tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:overscroll-contain tw:pt-[18px] tw:pr-[calc(18px+max(var(--safe-area-right),0px))] tw:pb-[calc(34px+max(var(--safe-area-bottom),0px))] tw:pl-[calc(18px+max(var(--safe-area-left),0px))]">
      <div class="mobile-note-details__identity tw:mb-[26px] tw:flex tw:items-center tw:gap-3">
        <span class="mobile-note-details__identity-icon tw:grid tw:size-[52px] tw:flex-[0_0_52px] tw:place-items-center tw:rounded-[calc(16px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:shadow-(--shadow-raised)" aria-hidden="true">
          <NvNoteIcon :value="note.icon || '📄'" :size="28" />
        </span>
        <span class="mobile-note-details__identity-copy tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
          <strong class="tw:truncate tw:text-base">{{ note.title || t('workspace.untitledNote') }}</strong>
          <small class="tw:truncate tw:text-[11px] tw:text-content-muted">{{ folderPath }}</small>
        </span>
      </div>

      <h2 :class="detailSectionTitleClass">{{ t('workspace.rightPanel.properties.title') }}</h2>
      <div class="mobile-note-details__group" :class="detailGroupClass">
        <label class="mobile-note-details__row tw:items-center" :class="detailRowClass">
          <span>{{ t('workspace.rightPanel.properties.type') }}</span>
          <select :class="[detailFieldClass, 'tw:flex-[0_1_auto] tw:appearance-none tw:[text-align-last:right]']" :value="properties.type ?? ''" @change="updateType">
            <option value="">{{ t('workspace.rightPanel.properties.typeNone') }}</option>
            <option v-for="type in typeOptions" :key="type" :value="type">
              {{ t(`workspace.rightPanel.properties.types.${type}`) }}
            </option>
          </select>
          <ChevronRight :size="16" aria-hidden="true" />
        </label>
        <label class="mobile-note-details__row tw:items-center" :class="detailRowClass">
          <span>{{ t('workspace.rightPanel.properties.status') }}</span>
          <select :class="[detailFieldClass, 'tw:flex-[0_1_auto] tw:appearance-none tw:[text-align-last:right]']" :value="properties.status ?? 'none'" @change="updateStatus">
            <option v-for="status in statusOptions" :key="status" :value="status">
              {{ t(`workspace.rightPanel.properties.statuses.${status}`) }}
            </option>
          </select>
          <ChevronRight :size="16" aria-hidden="true" />
        </label>
        <label class="mobile-note-details__row tw:items-center" :class="detailRowClass">
          <span>{{ t('workspace.rightPanel.properties.date') }}</span>
          <input
            type="date"
            :class="detailFieldClass"
            :value="properties.date ?? ''"
            :aria-label="t('workspace.rightPanel.properties.date')"
            @change="updateDate"
          >
          <ChevronRight :size="16" aria-hidden="true" />
        </label>
        <div class="mobile-note-details__row mobile-note-details__row--tags tw:items-start tw:py-3" :class="detailRowClass">
          <span>{{ t('workspace.rightPanel.properties.tags') }}</span>
          <div class="mobile-note-details__tags tw:flex tw:min-w-0 tw:flex-[1.5] tw:flex-wrap tw:justify-end tw:gap-[5px]">
            <button
              v-for="(tag, index) in properties.tags"
              :key="`${tag}-${index}`"
              type="button"
              class="tw:min-h-7 tw:rounded-full tw:border tw:border-transparent tw:bg-(--accent-soft) tw:px-[9px] tw:[font-family:inherit] tw:text-[10px] tw:text-[color-mix(in_oklab,var(--accent)_72%,var(--text-primary))]"
              :aria-label="t('workspace.rightPanel.properties.removeTag', { tag })"
              @click="removeTag(index)"
            >
              {{ tag }}
            </button>
            <input
              v-model="tagInput"
              class="tw:h-7 tw:w-[84px] tw:min-w-[72px] tw:border-0 tw:bg-transparent tw:px-1 tw:py-0 tw:[font-family:inherit] tw:text-[11px] tw:text-content-secondary tw:outline-none"
              type="text"
              :placeholder="t('workspace.rightPanel.properties.addTag')"
              @keydown="onTagKeydown"
              @blur="addTags"
            >
          </div>
          <Tags :size="16" aria-hidden="true" />
        </div>
      </div>

      <h2 :class="detailSectionTitleClass">{{ t('workspace.mobile.noteDetails.navigation') }}</h2>
      <div class="mobile-note-details__group" :class="detailGroupClass">
        <button type="button" class="mobile-note-details__row tw:items-center tw:active:bg-(--press)" :class="detailRowClass" @click="openOutline">
          <ListTree :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.outline') }}</span>
          <strong>{{ t('workspace.mobile.noteDetails.sections', { count: outlineCount }) }}</strong>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="mobile-note-details__row tw:items-center tw:active:bg-(--press)" :class="detailRowClass" @click="openGraph">
          <GitFork :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.backlinks') }}</span>
          <strong>{{ backlinks.length }}</strong>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="mobile-note-details__row tw:items-center tw:active:bg-(--press)" :class="detailRowClass" @click="openGraph">
          <GitFork :size="17" aria-hidden="true" />
          <span>{{ t('workspace.mobile.noteDetails.localGraph') }}</span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>

      <h2 :class="detailSectionTitleClass">{{ t('workspace.mobile.noteDetails.document') }}</h2>
      <div class="mobile-note-details__group" :class="detailGroupClass">
        <div class="mobile-note-details__row tw:items-center" :class="detailRowClass">
          <FileText :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.created') }}</span>
          <strong>{{ createdLabel }}</strong>
        </div>
        <div class="mobile-note-details__row tw:items-center" :class="detailRowClass">
          <Clock3 :size="17" aria-hidden="true" />
          <span>{{ t('workspace.rightPanel.updated') }}</span>
          <strong>{{ updatedLabel }}</strong>
        </div>
        <div class="mobile-note-details__row tw:items-center" :class="detailRowClass">
          <Clock3 :size="17" aria-hidden="true" />
          <span>{{ t('workspace.mobile.noteDetails.readingTime') }}</span>
          <strong>{{ t('workspace.rightPanel.readTime', { n: readMinutes }) }}</strong>
        </div>
      </div>

      <button type="button" class="mobile-note-details__export tw:mt-[22px] tw:flex tw:min-h-[50px] tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-[calc(15px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:shadow-(--shadow-raised) tw:[font-family:inherit] tw:text-[13px] tw:font-[620] tw:text-content-secondary" @click="exportNote">
        <FileDown :size="18" aria-hidden="true" />
        {{ t('workspace.mobile.noteDetails.export') }}
      </button>
    </div>
  </section>
</template>
