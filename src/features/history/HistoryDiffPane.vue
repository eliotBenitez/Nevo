<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Inbox } from '@lucide/vue'
import NvButton from '../../ui/primitives/NvButton.vue'
import HistoryBlockContent from './HistoryBlockContent.vue'
import HistoryDiffRow from './HistoryDiffRow.vue'
import HistoryDiffRowChanged from './HistoryDiffRowChanged.vue'
import HistoryMetadataStrip from './HistoryMetadataStrip.vue'
import HistoryNotebookPageDiff from './HistoryNotebookPageDiff.vue'
import HistoryPreviewBlock from './HistoryPreviewBlock.vue'
import type { NoteHistoryDiff } from '../../utils/noteHistory'
import type { HistoryPreviewBlock as HistoryPreviewBlockModel } from '../../utils/noteHistoryPreview'

type ViewMode = 'inline' | 'side-by-side' | 'as-note'

interface Props {
  hasSelection: boolean
  loading: boolean
  error: string | null
  currentNoteError: string | null
  diff: NoteHistoryDiff | null
  previewBlocks: HistoryPreviewBlockModel[]
  notebookPreviewPages: Array<{ id: string; source: string; alt: string; marks: number }>
}

const props = defineProps<Props>()
const { t } = useI18n()

const viewMode = ref<ViewMode>('inline')
const tabs = ['inline', 'side-by-side', 'as-note'] as const
const emit = defineEmits<{ retry: []; 'retry-current-note': [] }>()

async function onTablistKeydown(event: KeyboardEvent) {
  const activeIndex = tabs.indexOf(viewMode.value)
  let nextIndex: number
  if (event.key === 'ArrowRight') nextIndex = (activeIndex + 1) % tabs.length
  else if (event.key === 'ArrowLeft') nextIndex = (activeIndex + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = tabs.length - 1
  else return
  event.preventDefault()
  viewMode.value = tabs[nextIndex]!
  await nextTick()
  document.getElementById(`history-tab-${viewMode.value}`)?.focus()
}

const diffStats = computed(() => {
  const rows = props.diff?.rows ?? []
  const pages = props.diff?.notebookPages ?? []
  return {
    added: rows.filter(row => row.kind === 'added').length + pages.filter(page => page.kind === 'added').length,
    removed: rows.filter(row => row.kind === 'removed').length + pages.filter(page => page.kind === 'removed').length,
    changed: rows.filter(row => row.kind === 'changed').length + pages.filter(page => page.kind === 'changed' || page.kind === 'moved').length,
  }
})

const changedRowCount = computed(() => {
  const stats = diffStats.value
  return stats.added + stats.removed + stats.changed
})

const hasAnyStat = computed(() => diffStats.value.added || diffStats.value.removed || diffStats.value.changed)

// A single non-zero kind (e.g. every row is "changed") reads as a lonely
// number with no sense of scale — restate the total block count next to it.
const showTotalBlocksContext = computed(() => {
  const stats = diffStats.value
  const nonZeroKinds = [stats.added, stats.removed, stats.changed].filter(count => count > 0).length
  return nonZeroKinds === 1 && changedRowCount.value > 0
})

const hasDiffContent = computed(() => {
  const diff = props.diff
  return !!diff && (diff.rows.length > 0 || diff.metadata.length > 0 || !!diff.notebookPages?.length)
})

// Mutually exclusive per mode: bg/text-color utilities must never coexist
// with the idle state's utilities on the same button (both would target the
// same properties at equal specificity in `@layer utilities`).
function tabStateClass(mode: ViewMode) {
  return viewMode.value === mode
    ? 'history-diff-pane__tab--active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)'
    : 'tw:bg-transparent tw:text-content-muted'
}
</script>

<template>
  <section class="history-diff-pane tw:flex tw:h-full tw:min-h-0 tw:flex-col">
    <div class="history-diff-pane__toolbar tw:flex tw:min-h-[68px] tw:shrink-0 tw:items-center tw:justify-between tw:gap-3 tw:px-7 tw:py-3 tw:max-[900px]:flex-wrap tw:max-[900px]:gap-2.5 tw:max-[719px]:px-3.5">
      <div class="history-diff-pane__tabs tw:inline-flex tw:shrink-0 tw:gap-1 tw:max-[719px]:w-full" role="tablist" @keydown="onTablistKeydown">
        <button
          id="history-tab-inline"
          type="button"
          role="tab"
          class="history-diff-pane__tab tw:h-10 tw:cursor-pointer tw:whitespace-nowrap tw:rounded-nv-md tw:border tw:border-solid tw:border-transparent tw:px-4 tw:font-nv-ui tw:text-[13px] tw:font-medium tw:focus-visible:border-accent tw:focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] tw:focus-visible:outline-none tw:max-[719px]:min-w-0 tw:max-[719px]:flex-1 tw:max-[719px]:px-2"
          :class="tabStateClass('inline')"
          :aria-selected="viewMode === 'inline'"
          aria-controls="history-panel"
          :tabindex="viewMode === 'inline' ? 0 : -1"
          @click="viewMode = 'inline'"
        >
          {{ t('workspace.history.tabs.inline') }}
        </button>
        <button
          id="history-tab-side-by-side"
          type="button"
          role="tab"
          class="history-diff-pane__tab tw:h-10 tw:cursor-pointer tw:whitespace-nowrap tw:rounded-nv-md tw:border tw:border-solid tw:border-transparent tw:px-4 tw:font-nv-ui tw:text-[13px] tw:font-medium tw:focus-visible:border-accent tw:focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] tw:focus-visible:outline-none tw:max-[719px]:min-w-0 tw:max-[719px]:flex-1 tw:max-[719px]:px-2"
          :class="tabStateClass('side-by-side')"
          :aria-selected="viewMode === 'side-by-side'"
          aria-controls="history-panel"
          :tabindex="viewMode === 'side-by-side' ? 0 : -1"
          @click="viewMode = 'side-by-side'"
        >
          {{ t('workspace.history.tabs.sideBySide') }}
        </button>
        <button
          id="history-tab-as-note"
          type="button"
          role="tab"
          class="history-diff-pane__tab tw:h-10 tw:cursor-pointer tw:whitespace-nowrap tw:rounded-nv-md tw:border tw:border-solid tw:border-transparent tw:px-4 tw:font-nv-ui tw:text-[13px] tw:font-medium tw:focus-visible:border-accent tw:focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] tw:focus-visible:outline-none tw:max-[719px]:min-w-0 tw:max-[719px]:flex-1 tw:max-[719px]:px-2"
          :class="tabStateClass('as-note')"
          :aria-selected="viewMode === 'as-note'"
          aria-controls="history-panel"
          :tabindex="viewMode === 'as-note' ? 0 : -1"
          @click="viewMode = 'as-note'"
        >
          {{ t('workspace.history.tabs.asNote') }}
        </button>
      </div>
      <div v-if="viewMode !== 'as-note' && diff && hasAnyStat" class="history-diff-pane__summary tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-3.5 tw:max-[900px]:w-full tw:max-[900px]:justify-start" aria-live="polite">
        <span v-if="diffStats.added" class="history-diff-pane__stat history-diff-pane__stat--added tw:font-nv-mono tw:text-[11.5px] tw:font-semibold tw:text-(--success)">
          {{ t('workspace.history.diffStat.added', { count: diffStats.added }) }}
        </span>
        <span v-if="diffStats.removed" class="history-diff-pane__stat history-diff-pane__stat--removed tw:font-nv-mono tw:text-[11.5px] tw:font-semibold tw:text-danger">
          {{ t('workspace.history.diffStat.removed', { count: diffStats.removed }) }}
        </span>
        <span v-if="diffStats.changed" class="history-diff-pane__stat history-diff-pane__stat--changed tw:font-nv-mono tw:text-[11.5px] tw:font-semibold tw:text-accent">
          {{ t('workspace.history.diffStat.changed', { count: diffStats.changed }) }}
        </span>
        <span v-if="showTotalBlocksContext" class="history-diff-pane__stat history-diff-pane__stat--total tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:text-content-muted">
          · {{ t('workspace.history.diffStat.totalBlocks', { count: changedRowCount }) }}
        </span>
      </div>
    </div>

    <div id="history-panel" role="tabpanel" :aria-labelledby="`history-tab-${viewMode}`" class="history-diff-pane__panel tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
      <div v-if="!hasSelection" class="history-diff-pane__state tw:m-auto tw:p-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">
        <Inbox class="tw:mx-auto tw:mb-2.5 tw:block tw:text-accent tw:opacity-85" :size="30" aria-hidden="true" />
        <p>{{ t('workspace.history.noSnapshotSelected') }}</p>
      </div>
      <div v-else-if="loading" role="status" class="history-diff-pane__state tw:m-auto tw:p-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">
        <span class="history-diff-pane__spinner tw:mx-auto tw:mb-2.5 tw:block tw:size-5 tw:rounded-full tw:border-2 tw:border-solid tw:border-(--accent-soft) tw:border-t-accent" aria-hidden="true" />
        <p>{{ t('workspace.history.loadingSnapshot') }}</p>
      </div>
      <div v-else-if="error" class="history-diff-pane__state history-diff-pane__state--error tw:m-auto tw:p-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-danger" role="alert">
        <p>{{ error }}</p>
        <NvButton class="history-diff-pane__retry tw:mt-3" variant="ghost" @click="emit('retry')">{{ t('workspace.history.retry') }}</NvButton>
      </div>
      <div v-else-if="currentNoteError" class="history-diff-pane__state history-diff-pane__state--error tw:m-auto tw:p-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-danger" role="alert">
        <p>{{ currentNoteError }}</p>
        <NvButton class="history-diff-pane__retry tw:mt-3" variant="ghost" @click="emit('retry-current-note')">{{ t('workspace.history.retry') }}</NvButton>
      </div>
      <div v-else-if="viewMode === 'as-note'" class="history-diff-pane__body tw:mx-auto tw:w-[min(1100px,calc(100%_-_48px))] tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:pt-[52px] tw:pb-20 tw:max-[900px]:min-h-[420px] tw:max-[900px]:flex-none tw:max-[900px]:overflow-y-visible tw:max-[719px]:w-[min(calc(100%_-_28px),1100px)] tw:max-[719px]:pt-8">
        <div v-if="notebookPreviewPages.length" class="history-notebook-preview">
          <figure v-for="(page, index) in notebookPreviewPages" :key="page.id" class="history-notebook-preview__page">
            <img :src="page.source" :alt="page.alt" loading="lazy" />
            <figcaption>{{ t('notebook.pages.pageSummary', { page: index + 1, marks: page.marks }) }}</figcaption>
          </figure>
        </div>
        <div v-else-if="previewBlocks.length" class="history-diff-pane__blocks tw:flex tw:flex-col tw:gap-[22px]">
          <HistoryPreviewBlock
            v-for="(block, index) in previewBlocks"
            :key="index"
            :block="block"
          />
        </div>
        <div v-else class="history-diff-pane__state tw:m-auto tw:p-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">
          <Inbox class="tw:mx-auto tw:mb-2.5 tw:block tw:text-accent tw:opacity-85" :size="30" aria-hidden="true" />
          <p>{{ t('workspace.history.emptySnapshot') }}</p>
        </div>
      </div>
      <div v-else-if="!hasDiffContent" class="history-diff-pane__state tw:m-auto tw:p-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">
        <Inbox class="tw:mx-auto tw:mb-2.5 tw:block tw:text-accent tw:opacity-85" :size="30" aria-hidden="true" />
        <p>{{ t('workspace.history.noDiff') }}</p>
      </div>
      <div v-else-if="viewMode === 'inline'" class="history-diff-pane__body history-diff-pane__rows--inline tw:mx-auto tw:flex tw:w-[min(1100px,calc(100%_-_48px))] tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-[18px] tw:overflow-y-auto tw:pt-[52px] tw:pb-20 tw:max-[900px]:min-h-[420px] tw:max-[900px]:flex-none tw:max-[900px]:overflow-y-visible tw:max-[719px]:w-[min(calc(100%_-_28px),1100px)] tw:max-[719px]:pt-8">
        <HistoryMetadataStrip :changes="diff?.metadata ?? []" />
        <HistoryNotebookPageDiff :changes="diff?.notebookPages ?? []" />
        <template v-for="(row, index) in diff?.rows ?? []" :key="index">
          <HistoryBlockContent v-if="row.kind === 'unchanged' && row.current" :block="row.current" />
          <HistoryDiffRow
            v-else-if="row.kind === 'added' && row.current"
            tone="added"
            :block="row.current"
            :caption="t('workspace.history.row.added')"
          />
          <HistoryDiffRow
            v-else-if="row.kind === 'removed' && row.snapshot"
            tone="removed"
            :block="row.snapshot"
            :caption="t('workspace.history.row.removed')"
          />
          <template v-else-if="row.kind === 'changed'">
            <HistoryDiffRowChanged
              v-if="row.snapshot && row.current"
              :before="row.snapshot.label"
              :after="row.current.label"
              :changes="row.changes"
              :changed-attrs="row.changedAttrs"
              :before-type="row.snapshot.type"
              :after-type="row.current.type"
            />
            <template v-else>
              <HistoryDiffRow
                v-if="row.snapshot"
                tone="removed"
                :block="row.snapshot"
                :caption="t('workspace.history.row.removed')"
              />
              <HistoryDiffRow
                v-if="row.current"
                tone="added"
                :block="row.current"
                :caption="t('workspace.history.row.added')"
              />
            </template>
          </template>
        </template>
      </div>
      <div v-else class="history-diff-pane__body history-diff-pane__rows--columns tw:mx-auto tw:flex tw:w-[min(1100px,calc(100%_-_48px))] tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-3.5 tw:overflow-y-auto tw:pt-[52px] tw:pb-20 tw:max-[900px]:min-h-[420px] tw:max-[900px]:flex-none tw:max-[900px]:overflow-y-visible tw:max-[719px]:w-[min(calc(100%_-_28px),1100px)] tw:max-[719px]:pt-8">
        <HistoryMetadataStrip :changes="diff?.metadata ?? []" />
        <HistoryNotebookPageDiff :changes="diff?.notebookPages ?? []" />
        <div class="history-diff-pane__column-labels tw:mb-1 tw:grid tw:grid-cols-2 tw:gap-2.5 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase tw:max-[719px]:grid-cols-1">
          <span>{{ t('workspace.history.snapshotColumn') }}</span>
          <span>{{ t('workspace.history.currentColumn') }}</span>
        </div>
        <div v-for="(row, index) in diff?.rows ?? []" :key="index" class="history-diff-pane__row-grid tw:grid tw:grid-cols-2 tw:items-stretch tw:gap-2.5 tw:max-[719px]:grid-cols-1">
          <HistoryDiffRow
            v-if="row.snapshot"
            :tone="row.kind === 'unchanged' ? 'neutral' : 'removed'"
            :block="row.snapshot"
            :caption="t('workspace.history.row.removed')"
          />
          <div v-else class="history-diff-pane__placeholder tw:min-h-full tw:rounded-nv-sm tw:border tw:border-dashed tw:border-(--border-subtle) tw:max-[719px]:hidden" aria-hidden="true" />
          <HistoryDiffRow
            v-if="row.current"
            :tone="row.kind === 'unchanged' ? 'neutral' : 'added'"
            :block="row.current"
            :caption="row.kind === 'changed' ? t('workspace.history.row.changed') : t('workspace.history.row.added')"
            :badge="row.kind === 'changed'"
          />
          <div v-else class="history-diff-pane__placeholder tw:min-h-full tw:rounded-nv-sm tw:border tw:border-dashed tw:border-(--border-subtle) tw:max-[719px]:hidden" aria-hidden="true" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../../styles/features/history/history-diff-pane.css"></style>
<style scoped>
.history-notebook-preview { display:flex; flex-wrap:wrap; justify-content:center; gap:18px; }
.history-notebook-preview__page { width:min(100%,460px); margin:0; border:1px solid var(--border-subtle); border-radius:12px; padding:10px; background:var(--surface-raised); }
.history-notebook-preview__page img { display:block; width:100%; height:auto; background:#fff; }
.history-notebook-preview__page figcaption { padding-top:7px; color:var(--text-tertiary); text-align:center; font-size:11px; }
</style>
