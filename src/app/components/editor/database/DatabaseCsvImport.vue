<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Upload } from '../../../../ui/icons'
import NvModal from '../../../../ui/primitives/NvModal.vue'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import { parseCsv, inferColumnType, detectDelimiter, CSV_DELIMITERS } from '../../../../utils/csv/parseCsv'
import { parseCsvInWorker } from '../../../../features/database/databaseWorkerClient'
import {
  type DbCellValue,
  type DbField,
  type DbFieldType,
  type DbRecord,
} from '../../../../types/database-block'
import { nextOptionColor } from './dbColorPalette'
import { buildCsvFieldsAndRecords } from '../../../../utils/noteImport/notion/csvDatabase'

const props = defineProps<{
  t: (key: string) => string
  existingFields: DbField[]
  existingRecords: DbRecord[]
}>()

const emit = defineEmits<{
  close: []
  import: [payload: { fields: DbField[]; records: DbRecord[]; mode: 'replace' | 'append' }]
}>()

const FIELD_TYPES: DbFieldType[] = ['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url']

const DELIMITER_LABEL_KEY: Record<string, string> = {
  ',': 'comma',
  ';': 'semicolon',
  '\t': 'tab',
  '|': 'pipe',
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const parseError = ref(false)
const rawText = ref('')
const delimiter = ref<string>(',')
const rawHeaders = ref<string[]>([])
const rawRows = ref<string[][]>([])
const firstRowIsHeader = ref(true)
const columnTypes = ref<DbFieldType[]>([])
const mode = ref<'replace' | 'append'>('replace')

const delimiterOptions = computed(() =>
  CSV_DELIMITERS.map(value => ({ value, label: props.t(`database.csv.delimiters.${DELIMITER_LABEL_KEY[value]}`) })))

const hasFile = computed(() => rawHeaders.value.length > 0)

const columns = computed<string[]>(() => firstRowIsHeader.value
  ? rawHeaders.value
  : rawHeaders.value.map((_, i) => `${props.t('database.csv.columnName')} ${i + 1}`))

const dataRows = computed<string[][]>(() => firstRowIsHeader.value
  ? rawRows.value
  : [rawHeaders.value, ...rawRows.value])

const previewRows = computed(() => dataRows.value.slice(0, 5))

function typeOptions() {
  return FIELD_TYPES.map(type => ({ value: type, label: props.t(`database.fieldTypes.${type}`) }))
}

function recomputeInferredTypes() {
  columnTypes.value = columns.value.map((_, i) => inferColumnType(dataRows.value.map(row => row[i] ?? '')))
}

watch(firstRowIsHeader, recomputeInferredTypes)

async function reparse() {
  if (!rawText.value) return
  const parsed = rawText.value.length > 32_000
    ? await parseCsvInWorker(rawText.value, delimiter.value)
    : parseCsv(rawText.value, delimiter.value)
  if (!parsed.headers.length) {
    parseError.value = true
    rawHeaders.value = []
    rawRows.value = []
    return
  }
  parseError.value = false
  rawHeaders.value = parsed.headers
  rawRows.value = parsed.rows
  if ('types' in parsed) columnTypes.value = parsed.types as DbFieldType[]
  else recomputeInferredTypes()
}

watch(delimiter, () => { void reparse() })

function triggerFilePick() {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  parseError.value = false
  try {
    const text = await file.text()
    rawText.value = text
    firstRowIsHeader.value = true
    delimiter.value = detectDelimiter(text)
    await reparse()
  } catch {
    parseError.value = true
  } finally {
    input.value = ''
  }
}

function confirmImport() {
  const built = buildCsvFieldsAndRecords(columns.value, dataRows.value, columnTypes.value, nextOptionColor)

  if (mode.value === 'replace') {
    emit('import', { ...built, mode: 'replace' })
    return
  }

  const nameToExisting = new Map(props.existingFields.map(field => [field.name.trim().toLowerCase(), field]))
  const remap = new Map<string, string>()
  const finalFields = [...props.existingFields]

  for (const field of built.fields) {
    const existing = nameToExisting.get(field.name.trim().toLowerCase())
    if (existing) remap.set(field.id, existing.id)
    else finalFields.push(field)
  }

  const remappedRecords: DbRecord[] = built.records.map(record => {
    const cells: Record<string, DbCellValue> = {}
    for (const [fieldId, value] of Object.entries(record.cells)) {
      cells[remap.get(fieldId) ?? fieldId] = value
    }
    return { id: record.id, cells }
  })

  emit('import', { fields: finalFields, records: remappedRecords, mode: 'append' })
}
</script>

<template>
  <NvModal :open="true" size="md" :title="t('database.csv.title')" @close="emit('close')">
    <div class="nv-db-csv-modal__body tw:flex tw:flex-col tw:gap-3">
      <template v-if="!hasFile">
        <button type="button" class="nv-db-csv-modal__pick tw:inline-flex tw:h-9 tw:cursor-pointer tw:items-center tw:gap-2 tw:self-start tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--accent-soft) tw:px-3.5 tw:py-0 tw:text-[13px] tw:font-[550] tw:text-accent tw:hover:bg-[color-mix(in_oklab,var(--accent)_24%,transparent)]" @click="triggerFilePick">
          <Upload :size="16" />
          {{ t('database.csv.chooseFile') }}
        </button>
        <p class="nv-db-csv-modal__hint tw:m-0 tw:text-[12px] tw:text-content-muted">{{ t('database.csv.dropHint') }}</p>
        <p v-if="parseError" class="nv-db-csv-modal__error tw:m-0 tw:text-[12px] tw:text-danger">{{ t('database.csv.parseError') }}</p>
      </template>

      <template v-else>
        <div class="nv-db-csv-modal__file-row tw:flex tw:items-center tw:justify-between tw:gap-2">
          <span class="nv-db-csv-modal__filename tw:overflow-hidden tw:text-[12.5px] tw:text-ellipsis tw:whitespace-nowrap tw:text-content-secondary">{{ fileName }}</span>
          <button type="button" class="nv-db-csv-modal__change tw:h-[26px] tw:shrink-0 tw:cursor-pointer tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2.5 tw:py-0 tw:text-[11.5px] tw:text-content-secondary tw:hover:bg-(--hover)" @click="triggerFilePick">
            {{ t('database.csv.chooseFile') }}
          </button>
        </div>

        <div class="nv-db-csv-modal__delimiter-row tw:flex tw:items-center tw:justify-between tw:gap-2.5 tw:text-[12.5px] tw:text-content-secondary">
          <span class="nv-db-csv-modal__delimiter-label tw:flex-1">{{ t('database.csv.delimiter') }}</span>
          <NvSelect
            class="nv-db-csv-modal__delimiter-select"
            :model-value="delimiter"
            :options="delimiterOptions"
            :min-width="150"
            @update:model-value="delimiter = $event as string"
          />
        </div>

        <label class="nv-db-csv-modal__toggle-row tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-[12.5px] tw:text-content-secondary">
          <input type="checkbox" v-model="firstRowIsHeader" />
          <span>{{ t('database.csv.firstRowHeader') }}</span>
        </label>

        <div class="nv-db-csv-modal__section-label tw:mt-1 tw:text-[11px] tw:font-semibold tw:tracking-[0.02em] tw:text-content-muted tw:uppercase">{{ t('database.csv.columnMapping') }}</div>
        <div class="nv-db-csv-modal__columns tw:flex tw:max-h-40 tw:flex-col tw:gap-[5px] tw:overflow-y-auto">
          <div v-for="(name, i) in columns" :key="i" class="nv-db-csv-modal__column-row tw:flex tw:items-center tw:justify-between tw:gap-2">
            <span class="nv-db-csv-modal__column-name tw:overflow-hidden tw:text-[12.5px] tw:text-ellipsis tw:whitespace-nowrap tw:text-content-primary">{{ name }}</span>
            <NvSelect
              class="nv-db-csv-modal__column-type"
              :model-value="columnTypes[i]"
              :options="typeOptions()"
              :min-width="130"
              @update:model-value="columnTypes[i] = $event as DbFieldType"
            />
          </div>
        </div>

        <div class="nv-db-csv-modal__section-label tw:mt-1 tw:text-[11px] tw:font-semibold tw:tracking-[0.02em] tw:text-content-muted tw:uppercase">{{ t('database.csv.preview') }}</div>
        <div class="nv-db-csv-modal__preview-wrap tw:max-h-[200px] tw:overflow-auto tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-border-subtle">
          <table class="nv-db-csv-modal__preview tw:w-full tw:border-collapse tw:text-[11.5px]">
            <thead>
              <tr>
                <th v-for="(name, i) in columns" :key="i" class="tw:border-0 tw:border-b tw:border-solid tw:border-border-subtle tw:px-2 tw:py-[5px] tw:text-left tw:whitespace-nowrap tw:sticky tw:top-0 tw:bg-surface-subtle tw:text-content-muted">{{ name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, r) in previewRows" :key="r">
                <td v-for="c in columns.length" :key="c" class="tw:border-0 tw:border-b tw:border-solid tw:border-border-subtle tw:px-2 tw:py-[5px] tw:text-left tw:whitespace-nowrap tw:text-content-secondary">{{ row[c - 1] ?? '' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="nv-db-csv-modal__rows-count tw:px-2 tw:py-1 tw:text-[11px] tw:text-content-muted">{{ dataRows.length }} {{ t('database.csv.rowsCount') }}</div>
        </div>

        <div class="nv-db-csv-modal__section-label tw:mt-1 tw:text-[11px] tw:font-semibold tw:tracking-[0.02em] tw:text-content-muted tw:uppercase">{{ t('database.csv.mode') }}</div>
        <div class="nv-db-csv-modal__mode tw:flex tw:gap-4">
          <label class="nv-db-csv-modal__mode-opt tw:flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:text-[12.5px] tw:text-content-secondary">
            <input type="radio" value="replace" v-model="mode" class="tw:accent-(--accent)" />
            <span>{{ t('database.csv.modeReplace') }}</span>
          </label>
          <label class="nv-db-csv-modal__mode-opt tw:flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:text-[12.5px] tw:text-content-secondary">
            <input type="radio" value="append" v-model="mode" class="tw:accent-(--accent)" />
            <span>{{ t('database.csv.modeAppend') }}</span>
          </label>
        </div>
      </template>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".csv,text/csv"
      class="nv-db-csv-modal__file-input tw:hidden"
      @change="onFileChange"
    />

    <template #footer>
      <button type="button" class="nv-db-csv-modal__cancel tw:h-8 tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-3.5 tw:py-0 tw:text-[12.5px] tw:text-content-secondary tw:hover:bg-(--hover)" @click="emit('close')">
        {{ t('database.csv.cancel') }}
      </button>
      <button type="button" class="nv-db-csv-modal__confirm tw:h-8 tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:bg-(--accent-fill) tw:px-4 tw:py-0 tw:text-[12.5px] tw:font-semibold tw:text-(--accent-on) tw:hover:enabled:bg-accent-hover tw:disabled:cursor-not-allowed tw:disabled:bg-(--hover-strong) tw:disabled:text-content-muted" :disabled="!hasFile" @click="confirmImport">
        {{ t('database.csv.import') }}
      </button>
    </template>
  </NvModal>
</template>
