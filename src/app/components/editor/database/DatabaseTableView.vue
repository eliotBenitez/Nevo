<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import NvPopupMenu from '../../../../ui/primitives/NvPopupMenu.vue'
import DatabaseCell from './DatabaseCell.vue'
import DatabaseFieldMenu from './DatabaseFieldMenu.vue'
import type { DbCellValue, DbField, DbRecord, DbViewStyle } from '../../../../types/database-block'

const props = defineProps<{
  t: (key: string) => string
  fields: DbField[]
  records: DbRecord[]
  recordOffset: number
  totalRecords: number
  style: DbViewStyle
}>()

const emit = defineEmits<{
  'update-cell': [recordId: string, fieldId: string, value: DbCellValue, immediate: boolean]
  'update-field': [fieldId: string, patch: Partial<DbField>, immediate: boolean]
  'delete-field': [fieldId: string]
  'add-field': []
  'resize-field': [fieldId: string, width: number]
  'add-record': []
  'delete-record': [recordId: string]
  'request-range': [offset: number]
}>()

const MIN_WIDTH = 80
const DEFAULT_WIDTH = 180
const ROWNUM_WIDTH = 40
const ADD_FIELD_WIDTH = 40
const ACTIONS_WIDTH = 34
const ROW_HEIGHT = 36
const PAGE_SIZE = 180

const localWidths = ref<Record<string, number>>({})

function widthFor(field: DbField): number {
  return localWidths.value[field.id] ?? field.width ?? DEFAULT_WIDTH
}

const gridTemplateColumns = computed(() => {
  const cols: string[] = []
  if (props.style.showRowNumbers) cols.push(`${ROWNUM_WIDTH}px`)
  for (const field of props.fields) cols.push(`${widthFor(field)}px`)
  cols.push(`${ADD_FIELD_WIDTH}px`)
  cols.push(`${ACTIONS_WIDTH}px`)
  return cols.join(' ')
})

const topSpacer = computed(() => props.recordOffset * ROW_HEIGHT)
const bottomSpacer = computed(() => Math.max(0, props.totalRecords - props.recordOffset - props.records.length) * ROW_HEIGHT)

function isTintedRow(rowIndex: number): boolean {
  return props.style.rowColorScheme !== 'neutral' && (props.recordOffset + rowIndex) % 2 === 0
}

function onScroll(event: Event) {
  const target = event.target as HTMLElement
  const desired = Math.max(0, Math.floor(target.scrollTop / ROW_HEIGHT) - Math.floor(PAGE_SIZE / 3))
  if (desired < props.recordOffset || desired + PAGE_SIZE > props.recordOffset + props.records.length) emit('request-range', desired)
}

function startResize(field: DbField, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  const startX = event.clientX
  const startWidth = widthFor(field)

  function onMove(moveEvent: PointerEvent) {
    const next = Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX))
    localWidths.value = { ...localWidths.value, [field.id]: next }
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const finalWidth = localWidths.value[field.id]
    if (typeof finalWidth === 'number') emit('resize-field', field.id, finalWidth)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>

<template>
  <div class="nv-db-table-wrap">
    <div class="nv-db-table-scroll" @scroll="onScroll">
    <div
      class="nv-db-table"
      :class="{
        'nv-db-table--grid-lines': style.gridLines,
        'nv-db-table--striped': style.stripedRows,
        'nv-db-table--compact': style.compact,
        [`nv-db-table--scheme-${style.rowColorScheme}`]: style.rowColorScheme !== 'neutral',
      }"
      :style="{ gridTemplateColumns }"
    >
      <div v-if="style.showRowNumbers" class="nv-db-cell-box nv-db-cell-box--head nv-db-cell-box--rownum">
        {{ t('database.table.rowNumber') }}
      </div>
      <div v-for="field in fields" :key="`h-${field.id}`" class="nv-db-cell-box nv-db-cell-box--head">
        <span class="nv-db-table__field-name">{{ field.name }}</span>
        <NvPopupMenu placement="bottom-start" width="220px">
          <template #trigger>
            <button type="button" class="nv-db-table__field-menu-trigger">⋮</button>
          </template>
          <DatabaseFieldMenu
            :t="t"
            :field="field"
            @update="(patch, immediate) => emit('update-field', field.id, patch, immediate)"
            @delete="emit('delete-field', field.id)"
          />
        </NvPopupMenu>
        <div class="nv-db-table__resize-handle" @pointerdown="startResize(field, $event)" />
      </div>
      <div class="nv-db-cell-box nv-db-cell-box--head nv-db-cell-box--add-field">
        <button type="button" class="nv-db-table__add-field-btn" :aria-label="t('database.table.addField')" @click="emit('add-field')">
          <Plus :size="14" />
        </button>
      </div>
      <div class="nv-db-cell-box nv-db-cell-box--head nv-db-cell-box--actions" />

      <div v-if="topSpacer" class="nv-db-table__virtual-spacer" :style="{ height: `${topSpacer}px` }" />
      <template v-for="(record, rowIndex) in records" :key="record.id">
        <div v-if="style.showRowNumbers" class="nv-db-cell-box nv-db-cell-box--rownum" :class="{ 'nv-db-cell-box--tinted': isTintedRow(rowIndex) }">
          {{ recordOffset + rowIndex + 1 }}
        </div>
        <div v-for="field in fields" :key="`${record.id}-${field.id}`" class="nv-db-cell-box" :class="{ 'nv-db-cell-box--tinted': isTintedRow(rowIndex) }">
          <DatabaseCell
            :t="t"
            :field="field"
            :value="record.cells[field.id] ?? null"
            @update="(value, immediate) => emit('update-cell', record.id, field.id, value, immediate)"
          />
        </div>
        <div class="nv-db-cell-box nv-db-cell-box--add-field" :class="{ 'nv-db-cell-box--tinted': isTintedRow(rowIndex) }" />
        <div class="nv-db-cell-box nv-db-cell-box--actions" :class="{ 'nv-db-cell-box--tinted': isTintedRow(rowIndex) }">
          <button type="button" class="nv-db-table__row-delete" @click="emit('delete-record', record.id)">
            <Trash2 :size="13" />
          </button>
        </div>
      </template>
      <div v-if="bottomSpacer" class="nv-db-table__virtual-spacer" :style="{ height: `${bottomSpacer}px` }" />
    </div>
    </div>

    <button type="button" class="nv-db-table__add-row" @click="emit('add-record')">
      <Plus :size="13" />
      {{ t('database.table.addRow') }}
    </button>

    <div v-if="!totalRecords" class="nv-db-table__empty">{{ t('database.table.empty') }}</div>
  </div>
</template>
