<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Upload, X } from 'lucide-vue-next'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import { parseCsv, inferColumnType, detectDelimiter, CSV_DELIMITERS } from '../../../../utils/csv/parseCsv'
import { parseCsvInWorker } from '../../../../features/database/databaseWorkerClient'
import {
  createDbId,
  type DbCellValue,
  type DbField,
  type DbFieldOption,
  type DbFieldType,
  type DbRecord,
} from '../../../../types/database-block'
import { nextOptionColor } from './dbColorPalette'

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

function cellFor(raw: string, type: DbFieldType, optionMap: Map<string, DbFieldOption>): DbCellValue {
  const trimmed = raw.trim()
  switch (type) {
    case 'number': {
      if (trimmed === '') return null
      const num = Number(trimmed)
      return Number.isNaN(num) ? null : num
    }
    case 'checkbox':
      return /^(true|yes)$/i.test(trimmed)
    case 'select': {
      if (trimmed === '') return null
      let option = Array.from(optionMap.values()).find(item => item.name === trimmed)
      if (!option) {
        option = { id: createDbId('opt'), name: trimmed, color: nextOptionColor(optionMap.size) }
        optionMap.set(option.id, option)
      }
      return option.id
    }
    case 'multi_select': {
      if (trimmed === '') return []
      const parts = trimmed.split(',').map(part => part.trim()).filter(Boolean)
      return parts.map(part => {
        let option = Array.from(optionMap.values()).find(item => item.name === part)
        if (!option) {
          option = { id: createDbId('opt'), name: part, color: nextOptionColor(optionMap.size) }
          optionMap.set(option.id, option)
        }
        return option.id
      })
    }
    case 'date':
      return trimmed === '' ? null : trimmed
    default:
      return trimmed
  }
}

function buildFieldsAndRecords(): { fields: DbField[]; records: DbRecord[] } {
  const newFieldIds = columns.value.map(() => createDbId('f'))
  const optionMaps: Map<string, DbFieldOption>[] = columns.value.map(() => new Map())

  const records: DbRecord[] = dataRows.value.map(row => {
    const cells: Record<string, DbCellValue> = {}
    columns.value.forEach((_, colIndex) => {
      cells[newFieldIds[colIndex]] = cellFor(row[colIndex] ?? '', columnTypes.value[colIndex], optionMaps[colIndex])
    })
    return { id: createDbId('r'), cells }
  })

  const fields: DbField[] = columns.value.map((name, i) => {
    const type = columnTypes.value[i]
    const field: DbField = { id: newFieldIds[i], name, type, width: 180 }
    if (type === 'select' || type === 'multi_select') field.options = Array.from(optionMaps[i].values())
    return field
  })

  return { fields, records }
}

function confirmImport() {
  const built = buildFieldsAndRecords()

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
  <Teleport to="body">
    <div class="nv-db-csv-backdrop" @mousedown.self="emit('close')">
      <div class="nv-db-csv-modal" role="dialog" aria-modal="true">
        <div class="nv-db-csv-modal__header">
          <span class="nv-db-csv-modal__title">{{ t('database.csv.title') }}</span>
          <button type="button" class="nv-db-csv-modal__close" @click="emit('close')">
            <X :size="15" />
          </button>
        </div>

        <div class="nv-db-csv-modal__body">
          <template v-if="!hasFile">
            <button type="button" class="nv-db-csv-modal__pick" @click="triggerFilePick">
              <Upload :size="16" />
              {{ t('database.csv.chooseFile') }}
            </button>
            <p class="nv-db-csv-modal__hint">{{ t('database.csv.dropHint') }}</p>
            <p v-if="parseError" class="nv-db-csv-modal__error">{{ t('database.csv.parseError') }}</p>
          </template>

          <template v-else>
            <div class="nv-db-csv-modal__file-row">
              <span class="nv-db-csv-modal__filename">{{ fileName }}</span>
              <button type="button" class="nv-db-csv-modal__change" @click="triggerFilePick">
                {{ t('database.csv.chooseFile') }}
              </button>
            </div>

            <div class="nv-db-csv-modal__delimiter-row">
              <span class="nv-db-csv-modal__delimiter-label">{{ t('database.csv.delimiter') }}</span>
              <NvSelect
                class="nv-db-csv-modal__delimiter-select"
                :model-value="delimiter"
                :options="delimiterOptions"
                :min-width="150"
                @update:model-value="delimiter = $event as string"
              />
            </div>

            <label class="nv-db-csv-modal__toggle-row">
              <input type="checkbox" v-model="firstRowIsHeader" />
              <span>{{ t('database.csv.firstRowHeader') }}</span>
            </label>

            <div class="nv-db-csv-modal__section-label">{{ t('database.csv.columnMapping') }}</div>
            <div class="nv-db-csv-modal__columns">
              <div v-for="(name, i) in columns" :key="i" class="nv-db-csv-modal__column-row">
                <span class="nv-db-csv-modal__column-name">{{ name }}</span>
                <NvSelect
                  class="nv-db-csv-modal__column-type"
                  :model-value="columnTypes[i]"
                  :options="typeOptions()"
                  :min-width="130"
                  @update:model-value="columnTypes[i] = $event as DbFieldType"
                />
              </div>
            </div>

            <div class="nv-db-csv-modal__section-label">{{ t('database.csv.preview') }}</div>
            <div class="nv-db-csv-modal__preview-wrap">
              <table class="nv-db-csv-modal__preview">
                <thead>
                  <tr>
                    <th v-for="(name, i) in columns" :key="i">{{ name }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, r) in previewRows" :key="r">
                    <td v-for="c in columns.length" :key="c">{{ row[c - 1] ?? '' }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="nv-db-csv-modal__rows-count">{{ dataRows.length }} {{ t('database.csv.rowsCount') }}</div>
            </div>

            <div class="nv-db-csv-modal__section-label">{{ t('database.csv.mode') }}</div>
            <div class="nv-db-csv-modal__mode">
              <label class="nv-db-csv-modal__mode-opt">
                <input type="radio" value="replace" v-model="mode" />
                <span>{{ t('database.csv.modeReplace') }}</span>
              </label>
              <label class="nv-db-csv-modal__mode-opt">
                <input type="radio" value="append" v-model="mode" />
                <span>{{ t('database.csv.modeAppend') }}</span>
              </label>
            </div>
          </template>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          accept=".csv,text/csv"
          class="nv-db-csv-modal__file-input"
          @change="onFileChange"
        />

        <div class="nv-db-csv-modal__footer">
          <button type="button" class="nv-db-csv-modal__cancel" @click="emit('close')">
            {{ t('database.csv.cancel') }}
          </button>
          <button type="button" class="nv-db-csv-modal__confirm" :disabled="!hasFile" @click="confirmImport">
            {{ t('database.csv.import') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
