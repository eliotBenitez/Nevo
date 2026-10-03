<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ChevronRight, History, RotateCw, Search, X } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'
import NvButton from '../../ui/primitives/NvButton.vue'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'

const emit = defineEmits<{ back: []; select: [noteId: string] }>()
const { t, locale } = useI18n()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()

const loading = ref(true)
const error = ref(false)
const searchQuery = ref('')
const notes = ref<Array<{ id: string; latestAt: string; count: number }>>([])

const filteredNotes = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase(locale.value)
  if (!query) return notes.value
  return notes.value.filter(entry => {
    const title = treeStore.noteById.get(entry.id)?.title || t('workspace.untitledNote')
    return title.toLocaleLowerCase(locale.value).includes(query)
  })
})

async function loadNotes() {
  const backend = workspaceStore.backend
  loading.value = true
  error.value = false
  searchQuery.value = ''
  try {
    if (!backend) throw new Error('No active workspace backend')
    const result = await backend.listAllNoteSnapshots()
    notes.value = result
      .filter(entry => entry.snapshots.length > 0 && treeStore.noteById.has(entry.noteId))
      .map(entry => ({
        id: entry.noteId,
        latestAt: [...entry.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt,
        count: entry.snapshots.length,
      }))
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
  } catch {
    notes.value = []
    error.value = true
  } finally {
    loading.value = false
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
}

onMounted(() => { void loadNotes() })
</script>

<template>
  <main class="history-picker tw:flex tw:h-full tw:min-h-0 tw:w-full tw:flex-col tw:bg-[var(--workspace-editor-surface,var(--surface-canvas))]">
    <header class="tw:mx-auto tw:flex tw:w-full tw:shrink-0 tw:items-center tw:gap-3 tw:max-w-[1120px] tw:border-b-0 tw:px-5 tw:pt-6 tw:pb-2 tw:md:px-8 tw:md:pt-8 tw:md:pb-3">
      <NvButton variant="ghost" :aria-label="t('workspace.back')" @click="emit('back')"><ArrowLeft :size="16" /></NvButton>
      <div>
        <h1 class="tw:m-0 tw:text-lg tw:font-semibold tw:text-content-primary">{{ t('workspace.history.pickerTitle') }}</h1>
        <p class="tw:mt-1 tw:mb-0 tw:text-sm tw:text-content-muted">{{ t('workspace.history.pickerSubtitle') }}</p>
      </div>
    </header>

    <div class="tw:mx-auto tw:flex tw:w-full tw:min-h-0 tw:flex-1 tw:max-w-[1120px] tw:flex-col tw:px-5 tw:pt-2 tw:pb-6 tw:md:px-8 tw:md:pt-3 tw:md:pb-8">
      <div v-if="loading" role="status" :aria-label="t('workspace.history.pickerLoading')" class="tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-1 tw:grid-rows-1 tw:gap-8 tw:md:grid-cols-[230px_minmax(0,1fr)]">
        <div class="tw:hidden tw:md:block">
          <div class="tw:h-4 tw:w-24 tw:animate-pulse tw:rounded tw:bg-(--surface-subtle) tw:motion-reduce:animate-none" />
          <div class="tw:mt-3 tw:h-3 tw:w-full tw:animate-pulse tw:rounded tw:bg-(--surface-subtle) tw:motion-reduce:animate-none" />
          <div class="tw:mt-2 tw:h-3 tw:w-4/5 tw:animate-pulse tw:rounded tw:bg-(--surface-subtle) tw:motion-reduce:animate-none" />
        </div>
        <div class="tw:divide-y tw:divide-(--border-subtle)">
          <div v-for="row in 3" :key="row" data-testid="history-note-skeleton" class="tw:flex tw:min-h-16 tw:items-center tw:gap-4 tw:py-3">
            <div class="tw:size-9 tw:shrink-0 tw:animate-pulse tw:rounded-nv-md tw:bg-(--surface-subtle) tw:motion-reduce:animate-none" />
            <div class="tw:min-w-0 tw:flex-1">
              <div class="tw:h-4 tw:w-2/5 tw:animate-pulse tw:rounded tw:bg-(--surface-subtle) tw:motion-reduce:animate-none" />
              <div class="tw:mt-2 tw:h-3 tw:w-1/3 tw:animate-pulse tw:rounded tw:bg-(--surface-subtle) tw:motion-reduce:animate-none" />
            </div>
            <div class="tw:size-4 tw:animate-pulse tw:rounded tw:bg-(--surface-subtle) tw:motion-reduce:animate-none" />
          </div>
        </div>
      </div>

      <div v-else-if="error" role="alert" class="tw:m-auto tw:max-w-md tw:text-center">
        <div class="tw:mx-auto tw:mb-4 tw:grid tw:size-12 tw:place-items-center tw:rounded-full tw:bg-(--surface-subtle) tw:text-content-muted"><History :size="20" /></div>
        <h2 class="tw:m-0 tw:text-base tw:font-semibold tw:text-content-primary">{{ t('workspace.history.pickerErrorTitle') }}</h2>
        <p class="tw:mt-2 tw:mb-5 tw:text-sm tw:text-content-muted">{{ t('workspace.history.pickerError') }}</p>
        <NvButton @click="loadNotes"><RotateCw :size="14" />{{ t('workspace.history.retry') }}</NvButton>
      </div>

      <div v-else-if="!notes.length" class="tw:m-auto tw:max-w-md tw:text-center">
        <div class="tw:mx-auto tw:mb-4 tw:grid tw:size-12 tw:place-items-center tw:rounded-full tw:bg-(--surface-subtle) tw:text-content-muted"><History :size="20" /></div>
        <h2 class="tw:m-0 tw:text-base tw:font-semibold tw:text-content-primary">{{ t('workspace.history.pickerEmptyTitle') }}</h2>
        <p class="tw:mt-2 tw:mb-0 tw:text-sm tw:leading-relaxed tw:text-content-muted">{{ t('workspace.history.pickerEmpty') }}</p>
      </div>

      <div v-else class="tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-1 tw:grid-rows-1 tw:gap-8 tw:md:grid-cols-[230px_minmax(0,1fr)] tw:md:gap-10">
        <aside class="tw:hidden tw:pb-2 tw:md:block tw:md:pt-1">
          <p class="tw:m-0 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-content-muted">{{ t('workspace.history.pickerRailLabel') }}</p>
          <p class="tw:mt-3 tw:mb-0 tw:text-sm tw:leading-relaxed tw:text-content-secondary">{{ t('workspace.history.pickerRailDescription') }}</p>
        </aside>

        <section class="tw:flex tw:min-h-0 tw:flex-col" :aria-label="t('workspace.history.pickerListLabel')">
          <label for="history-note-search" class="tw:mb-2 tw:text-sm tw:font-medium tw:text-content-primary">{{ t('workspace.history.pickerSearchLabel') }}</label>
          <div class="tw:relative tw:shrink-0">
            <Search :size="16" class="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:-translate-y-1/2 tw:text-content-muted" aria-hidden="true" />
            <input
              id="history-note-search"
              v-model="searchQuery"
              type="search"
              :placeholder="t('workspace.history.pickerSearchPlaceholder')"
              class="tw:h-11 tw:w-full tw:rounded-nv-md tw:border tw:border-solid tw:border-(--border-default) tw:bg-(--surface-panel) tw:pr-11 tw:pl-10 tw:text-sm tw:text-content-primary tw:placeholder:text-content-muted tw:outline-none tw:focus:border-(--accent) tw:focus:ring-2 tw:focus:ring-(--accent-soft)"
            >
            <button v-if="searchQuery" type="button" class="tw:absolute tw:top-1/2 tw:right-1 tw:grid tw:size-9 tw:-translate-y-1/2 tw:place-items-center tw:border-0 tw:bg-transparent tw:rounded-nv-sm tw:text-content-muted tw:transition-colors tw:hover:bg-(--surface-subtle) tw:hover:text-content-primary tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-(--focus-ring)" :aria-label="t('workspace.history.pickerClearSearch')" @click="searchQuery = ''"><X :size="15" /></button>
          </div>

          <div class="tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:py-4">
            <h2 class="tw:m-0 tw:text-sm tw:font-semibold tw:text-content-primary">{{ t('workspace.history.pickerListLabel') }}</h2>
            <span class="tw:text-xs tw:tabular-nums tw:text-content-muted" aria-live="polite">{{ t('workspace.history.pickerResultCount', { count: filteredNotes.length }) }}</span>
          </div>

          <p v-if="!filteredNotes.length" class="tw:m-0 tw:rounded-nv-md tw:bg-(--surface-subtle) tw:px-4 tw:py-5 tw:text-sm tw:text-content-secondary" role="status">{{ t('workspace.history.pickerNoSearchResults') }}</p>
          <ul v-else class="tw:m-0 tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:divide-y tw:divide-(--border-subtle) tw:list-none tw:p-0">
            <li v-for="entry in filteredNotes" :key="entry.id">
              <button type="button" class="history-picker__row tw:flex tw:min-h-16 tw:w-full tw:items-center tw:gap-4 tw:border-0 tw:bg-transparent tw:px-2 tw:py-3 tw:text-left tw:text-content-primary tw:transition-[transform,opacity,background-color] tw:duration-150 tw:hover:bg-(--surface-subtle) tw:active:translate-y-px tw:active:opacity-80 tw:focus:relative tw:focus:z-[1] tw:focus:rounded-nv-sm tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-(--focus-ring)" @click="emit('select', entry.id)">
                <span class="tw:grid tw:size-9 tw:shrink-0 tw:place-items-center tw:rounded-nv-md tw:bg-(--surface-subtle)" aria-hidden="true"><NvNoteIcon :value="treeStore.noteById.get(entry.id)?.icon || '📄'" :size="18" /></span>
                <span class="tw:min-w-0 tw:flex-1">
                  <strong class="tw:block tw:truncate tw:text-sm tw:font-medium">{{ treeStore.noteById.get(entry.id)?.title || t('workspace.untitledNote') }}</strong>
                  <span class="tw:mt-1 tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1 tw:text-xs tw:text-content-muted"><span>{{ formatDate(entry.latestAt) }}</span><span aria-hidden="true">·</span><span>{{ t('workspace.history.pickerVersionCount', { count: entry.count }) }}</span></span>
                </span>
                <ChevronRight :size="16" class="tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.history-picker input[type='search']::-webkit-search-cancel-button {
  display: none;
  -webkit-appearance: none;
  appearance: none;
}
</style>
