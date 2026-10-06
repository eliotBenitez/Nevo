<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CircleAlert, Inbox, ListFilter, RefreshCw, SearchX, Settings2 } from '@lucide/vue'
import DatabaseTableView from '../database/DatabaseTableView.vue'
import DatabaseListView from '../database/DatabaseListView.vue'
import DatabaseCardsView from '../database/DatabaseCardsView.vue'
import { defaultViewStyle } from '../../../../types/database-block'
import type { NoteQueryRequest, NoteRow } from '../../../../types/note-query'
import { noteQueryFieldsForView, noteRowsToDbRecords } from '../../../../features/query/noteQueryProjection'
import { summarizeQueryBlockFilters } from '../../../../features/query/queryBlockSummary'
import type { QueryBlockData } from '../../../../features/query/queryBlockData'

const props = defineProps<{
  data: QueryBlockData
  t: (key: string) => string
  /** Undefined when no workspace backend is available (e.g. no app context). */
  onQueryNotes?: (request: NoteQueryRequest) => Promise<NoteRow[]>
  onOpenNote?: (noteId: string) => void
  onEditRequest: (event?: MouseEvent) => void
}>()

const rows = ref<NoteRow[]>([])
const loading = ref(true)
const errored = ref(false)
let loadGeneration = 0

async function runQuery(): Promise<void> {
  if (!props.onQueryNotes) {
    loading.value = false
    return
  }
  const generation = ++loadGeneration
  loading.value = true
  errored.value = false
  try {
    const request: NoteQueryRequest = { filters: props.data.filters, sorts: props.data.sorts }
    const result = await props.onQueryNotes(request)
    if (generation !== loadGeneration) return
    rows.value = result
  } catch {
    if (generation !== loadGeneration) return
    errored.value = true
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

watch(() => props.data, () => { void runQuery() }, { immediate: true, deep: true })
onBeforeUnmount(() => { loadGeneration += 1 })

const fields = computed(() => noteQueryFieldsForView(rows.value, props.t, props.data.view))
const records = computed(() => noteRowsToDbRecords(rows.value))
const summary = computed(() => summarizeQueryBlockFilters(props.data))
const tableStyle = defaultViewStyle()

// Count badge only makes sense once a query actually ran and produced rows —
// hidden during loading/error/no-context/empty so it never shows a stale or
// misleading number.
const showCount = computed(() => !loading.value && !errored.value && !!props.onQueryNotes && rows.value.length > 0)
const countLabel = computed(() => `${rows.value.length} ${props.t('editor.queryBlock.resultsLabel')}`)
const regionLabel = computed(() => `${props.t('editor.queryBlock.title')}: ${summary.value}`)

const resultsRef = ref<HTMLElement | null>(null)

// DatabaseListView/DatabaseCardsView render a flat, unnested v-for of rows in
// the same order as `records`, so a delegated click can map the clicked DOM
// row back to its record by position without those (reused, read-only-here)
// components needing to know about note navigation.
function onResultsClick(event: MouseEvent): void {
  if (!props.onOpenNote) return
  const target = event.target as HTMLElement
  const rowEl = target.closest<HTMLElement>('.nv-db-list__row, .nv-db-cards__card')
  if (!rowEl) return
  const container = resultsRef.value
  if (!container) return
  const selector = rowEl.classList.contains('nv-db-list__row') ? '.nv-db-list__row' : '.nv-db-cards__card'
  const siblings = Array.from(container.querySelectorAll<HTMLElement>(selector))
  const index = siblings.indexOf(rowEl)
  const record = index >= 0 ? records.value[index] : null
  if (record) props.onOpenNote(record.id)
}

// The query block never edits records in place (results are a live, read-only
// projection), so the mutating events from the reused table view are no-ops.
function noop(): void {}
</script>

<template>
  <div class="nv-query-block" role="region" :aria-label="regionLabel">
    <div class="nv-query-block__header">
      <ListFilter :size="14" class="nv-query-block__icon" aria-hidden="true" />
      <span class="nv-query-block__title">{{ t('editor.queryBlock.title') }}</span>
      <span class="nv-query-block__summary">{{ summary }}</span>
      <span v-if="showCount" class="nv-query-block__count" :aria-label="countLabel">{{ rows.length }}</span>
      <button
        type="button"
        class="nv-query-block__edit-btn"
        :aria-label="t('editor.queryBlock.edit')"
        @click="onEditRequest($event)"
      >
        <Settings2 :size="14" aria-hidden="true" />
      </button>
    </div>
    <div
      ref="resultsRef"
      class="nv-query-block__body"
      :aria-busy="loading"
      @click="onResultsClick"
    >
      <div v-if="loading" class="nv-query-block__state" role="status" aria-live="polite">
        <div class="nv-query-block__skeleton" aria-hidden="true">
          <div v-for="n in 3" :key="n" class="nv-query-block__skeleton-row" />
        </div>
        <span class="nv-query-block__sr-only">{{ t('editor.queryBlock.loading') }}</span>
      </div>
      <div v-else-if="!onQueryNotes" class="nv-query-block__state">
        <Inbox :size="20" class="nv-query-block__state-icon" aria-hidden="true" />
        <p class="nv-query-block__state-text">{{ t('editor.queryBlock.noContext') }}</p>
      </div>
      <div v-else-if="errored" class="nv-query-block__state nv-query-block__state--error" role="alert">
        <CircleAlert :size="20" class="nv-query-block__state-icon" aria-hidden="true" />
        <p class="nv-query-block__state-text">{{ t('editor.queryBlock.error') }}</p>
        <button type="button" class="nv-query-block__retry-btn" @click="runQuery">
          <RefreshCw :size="13" aria-hidden="true" />
          {{ t('editor.queryBlock.retry') }}
        </button>
      </div>
      <div v-else-if="!rows.length" class="nv-query-block__state">
        <SearchX :size="20" class="nv-query-block__state-icon" aria-hidden="true" />
        <p class="nv-query-block__state-text">{{ t('editor.queryBlock.empty') }}</p>
        <button type="button" class="nv-query-block__retry-btn" @click="onEditRequest($event)">
          <Settings2 :size="13" aria-hidden="true" />
          {{ t('editor.queryBlock.edit') }}
        </button>
      </div>
      <template v-else>
        <DatabaseTableView
          v-if="data.view === 'table'"
          :t="t"
          :fields="fields"
          :records="records"
          :record-offset="0"
          :total-records="records.length"
          :style="tableStyle"
          @request-range="noop"
          @update-cell="noop"
          @update-field="noop"
          @delete-field="noop"
          @add-field="noop"
          @resize-field="noop"
          @add-record="noop"
          @delete-record="noop"
        />
        <DatabaseCardsView
          v-else-if="data.view === 'cards'"
          :t="t"
          :fields="fields"
          :records="records"
          :record-offset="0"
          :total-records="records.length"
          @request-range="noop"
        />
        <DatabaseListView
          v-else
          :t="t"
          :fields="fields"
          :records="records"
          :record-offset="0"
          :total-records="records.length"
          @request-range="noop"
        />
      </template>
    </div>
  </div>
</template>
