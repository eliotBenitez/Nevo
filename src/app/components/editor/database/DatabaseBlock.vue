<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  createDbId,
  defaultViewStyle,
  type DatabaseBlockData,
  type DatabaseBlockDataV2,
  type DbCellValue,
  type DbChartConfig,
  type DbField,
  type DbFilterRule,
  type DbRecord,
  type DbSortRule,
  type DbView,
  type DbViewStyle,
  type DbViewType,
} from '../../../../types/database-block'
import type { DatabaseRepository } from '../../../../features/database/databaseRepository'
import DatabaseToolbar from './DatabaseToolbar.vue'
import DatabaseTableView from './DatabaseTableView.vue'
import DatabaseListView from './DatabaseListView.vue'
import DatabaseCardsView from './DatabaseCardsView.vue'
import DatabaseChartView from './DatabaseChartView.vue'
import DatabaseCsvImport from './DatabaseCsvImport.vue'

const props = defineProps<{
  data: DatabaseBlockData
  repository: DatabaseRepository
  t: (key: string) => string
  onChange: (next: DatabaseBlockData) => void
  onRequestDelete: () => void
}>()

const PAGE_SIZE = 180
const model = ref<DatabaseBlockDataV2 | null>(null)
const records = ref<DbRecord[]>([])
const recordsOffset = ref(0)
const rowCount = ref(0)
const loading = ref(true)
const migrationError = ref(false)
let loadGeneration = 0
let commitTimer: ReturnType<typeof setTimeout> | null = null

function commit(immediate = true) {
  if (!model.value) return
  if (commitTimer) clearTimeout(commitTimer)
  const run = () => {
    commitTimer = null
    if (model.value) props.onChange({ ...model.value, rowCount: rowCount.value })
  }
  if (immediate) run()
  else commitTimer = setTimeout(run, 200)
}

async function loadRange(offset = 0) {
  const data = model.value
  if (!data) return
  const generation = ++loadGeneration
  loading.value = true
  try {
    const view = data.views.find(item => item.id === data.activeView)
    const result = await props.repository.queryRecords(data.databaseId, {
      offset: Math.max(0, offset),
      limit: PAGE_SIZE,
      fields: data.fields,
      filters: view?.filters,
      sorts: view?.sorts,
    })
    if (generation !== loadGeneration) return
    records.value = result.records
    recordsOffset.value = Math.max(0, offset)
    rowCount.value = result.total
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function bootstrap(data: DatabaseBlockData) {
  loading.value = true
  migrationError.value = false
  if (data.version === 1) {
    try {
      // The note is deliberately updated only after every legacy row has been
      // persisted. If this fails the v1 attrs remain intact and retry on reopen.
      const next: DatabaseBlockDataV2 = {
        version: 2,
        databaseId: createDbId('database'),
        rowCount: data.records.length,
        title: data.title,
        fields: data.fields,
        activeView: data.activeView,
        views: data.views,
      }
      await props.repository.importRecords(next.databaseId, data.records, 'replace')
      model.value = next
      rowCount.value = next.rowCount
      props.onChange(next)
    } catch {
      model.value = null
      migrationError.value = true
      loading.value = false
      return
    }
  } else {
    model.value = data
    rowCount.value = data.rowCount
  }
  await loadRange(0)
}

watch(() => props.data, data => {
  const current = model.value
  if (!current || data.version === 1 || data.databaseId !== current.databaseId) void bootstrap(data)
  else model.value = data
}, { immediate: true })

onBeforeUnmount(() => { if (commitTimer) { clearTimeout(commitTimer); commit() } })

const activeView = computed<DbView | undefined>(() => model.value?.views.find(view => view.id === model.value?.activeView))

function pruneOrphanRules(data: DatabaseBlockDataV2) {
  const fieldIds = new Set(data.fields.map(field => field.id))
  for (const view of data.views) {
    view.filters = view.filters.filter(rule => fieldIds.has(rule.fieldId))
    view.sorts = view.sorts.filter(rule => fieldIds.has(rule.fieldId))
    if (view.chart) {
      const chart = view.chart
      if (chart.xField && !fieldIds.has(chart.xField)) chart.xField = data.fields[0]?.id ?? ''
      const yFields = chart.series !== undefined
        ? chart.series.map(series => series.fieldId)
        : chart.yFields ?? (chart.yField ? [chart.yField] : [])
      chart.yFields = [...new Set(yFields.filter(fieldId => fieldIds.has(fieldId)))]
      chart.yField = chart.yFields[0] ?? ''
      chart.series = chart.yFields.map((fieldId, index) => ({
        id: chart.series?.find(series => series.fieldId === fieldId)?.id ?? `${view.id}_series_${index}`,
        fieldId,
      }))
    }
  }
}

function onTitleInput(event: Event) { if (model.value) { model.value.title = (event.target as HTMLInputElement).value; commit(false) } }

async function updateCell(recordId: string, fieldId: string, value: DbCellValue, immediate: boolean) {
  const data = model.value
  if (!data) return
  const index = records.value.findIndex(record => record.id === recordId)
  const previous = index >= 0 ? records.value[index].cells[fieldId] ?? null : null
  if (index >= 0) {
    records.value[index] = { ...records.value[index], cells: { ...records.value[index].cells, [fieldId]: value } }
  }
  const persist = async () => {
    try {
      await props.repository.applyOperations(data.databaseId, [{ type: 'updateCell', recordId, fieldId, value }])
    } catch {
      const currentIndex = records.value.findIndex(record => record.id === recordId)
      if (currentIndex >= 0 && records.value[currentIndex].cells[fieldId] === value) {
        records.value[currentIndex] = {
          ...records.value[currentIndex],
          cells: { ...records.value[currentIndex].cells, [fieldId]: previous },
        }
      }
    }
  }
  if (immediate) await persist()
  else void persist()
}

function updateField(fieldId: string, patch: Partial<DbField>, immediate: boolean) {
  const field = model.value?.fields.find(item => item.id === fieldId)
  if (field) { Object.assign(field, patch); commit(immediate) }
}

async function deleteField(fieldId: string) {
  const data = model.value
  if (!data) return
  data.fields = data.fields.filter(field => field.id !== fieldId)
  pruneOrphanRules(data)
  await props.repository.applyOperations(data.databaseId, [{ type: 'deleteField', fieldId }])
  records.value = records.value.map(record => { const cells = { ...record.cells }; delete cells[fieldId]; return { ...record, cells } })
  commit()
}

function addField() {
  const data = model.value
  if (!data) return
  data.fields.push({ id: createDbId('f'), name: `${props.t('database.field.defaultName')} ${data.fields.length + 1}`, type: 'text', width: 180 })
  commit()
}

function resizeField(fieldId: string, width: number) { updateField(fieldId, { width }, true) }

async function addRecord() {
  const data = model.value
  if (!data) return
  const count = await props.repository.applyOperations(data.databaseId, [{ type: 'insert', record: { id: createDbId('r'), cells: {} } }])
  rowCount.value = count
  await loadRange(Math.max(0, count - PAGE_SIZE))
  commit()
}

async function deleteRecord(recordId: string) {
  const data = model.value
  if (!data) return
  rowCount.value = await props.repository.applyOperations(data.databaseId, [{ type: 'delete', recordId }])
  await loadRange(recordsOffset.value)
  commit()
}

function switchView(id: string) { if (model.value) { model.value.activeView = id; commit(); void loadRange(0) } }
function addView(type: DbViewType) {
  const data = model.value
  if (!data) return
  const view: DbView = { id: createDbId('v'), name: '', type, filters: [], sorts: [], style: defaultViewStyle() }
  if (type === 'chart') view.chart = { kind: 'bar', xField: data.fields[0]?.id ?? '', yField: '', yFields: [], series: [], aggregate: 'count' }
  data.views.push(view); data.activeView = view.id; commit()
}
function deleteView(id: string) {
  const data = model.value
  if (!data || data.views.length <= 1) return
  const index = data.views.findIndex(view => view.id === id)
  if (index < 0) return
  data.views.splice(index, 1)
  if (data.activeView === id) data.activeView = data.views[Math.min(index, data.views.length - 1)].id
  commit()
  void loadRange(0)
}
function updateFilters(rules: DbFilterRule[]) { if (activeView.value) { activeView.value.filters = rules; commit(); void loadRange(0) } }
function updateSorts(rules: DbSortRule[]) { if (activeView.value) { activeView.value.sorts = rules; commit(); void loadRange(0) } }
function updateStyle(style: DbViewStyle) { if (activeView.value) { activeView.value.style = style; commit() } }
function updateViewName(name: string) { if (activeView.value) { activeView.value.name = name; commit(false) } }
function updateChart(config: DbChartConfig) { if (activeView.value) { activeView.value.chart = config; commit() } }
function requestRange(offset: number) { if (offset !== recordsOffset.value) void loadRange(offset) }

const showCsvImport = ref(false)
function applyCsvImport(payload: { fields: DbField[]; records: DbRecord[]; mode: 'replace' | 'append' }) {
  const data = model.value
  if (!data) return
  data.fields = payload.fields
  pruneOrphanRules(data)
  showCsvImport.value = false
  void props.repository.importRecords(data.databaseId, payload.records, payload.mode).then(count => {
    rowCount.value = count
    commit()
    return loadRange(0)
  })
}
</script>

<template>
  <div class="nv-db-block">
    <div v-if="migrationError" class="nv-db-table__empty">{{ t('database.table.empty') }}</div>
    <div v-else-if="!model" class="nv-db-table__empty">Loading…</div>
    <template v-else-if="activeView">
      <div class="nv-db-block__title-row"><input class="nv-db-block__title" type="text" :value="model.title" :placeholder="t('database.titlePlaceholder')" @input="onTitleInput" /></div>
      <DatabaseToolbar :t="t" :views="model.views" :active-view-id="model.activeView" :active-view="activeView" :fields="model.fields" :on-request-delete="onRequestDelete" :on-open-csv-import="() => { showCsvImport = true }" @update:active-view-id="switchView" @add-view="addView" @delete-view="deleteView" @update:filters="updateFilters" @update:sorts="updateSorts" @update:style="updateStyle" @update:view-name="updateViewName" />
      <div class="nv-db-block__body">
        <DatabaseTableView v-if="activeView.type === 'table'" :t="t" :fields="model.fields" :records="records" :record-offset="recordsOffset" :total-records="rowCount" :style="activeView.style ?? defaultViewStyle()" @request-range="requestRange" @update-cell="updateCell" @update-field="updateField" @delete-field="deleteField" @add-field="addField" @resize-field="resizeField" @add-record="addRecord" @delete-record="deleteRecord" />
        <DatabaseListView v-else-if="activeView.type === 'list'" :t="t" :fields="model.fields" :records="records" :record-offset="recordsOffset" :total-records="rowCount" @request-range="requestRange" />
        <DatabaseCardsView v-else-if="activeView.type === 'cards'" :t="t" :fields="model.fields" :records="records" :record-offset="recordsOffset" :total-records="rowCount" @request-range="requestRange" />
        <DatabaseChartView v-else :t="t" :fields="model.fields" :records="records" :chart="activeView.chart" :on-open-csv-import="() => { showCsvImport = true }" @update:chart="updateChart" />
      </div>
    </template>
    <DatabaseCsvImport v-if="showCsvImport && model" :t="t" :existing-fields="model.fields" :existing-records="[]" @close="showCsvImport = false" @import="applyCsvImport" />
  </div>
</template>
