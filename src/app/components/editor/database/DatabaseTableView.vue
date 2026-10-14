<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Trash2 } from '../../../../ui/icons'
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
  <div class="nv-db-table-wrap tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-(--db-border) tw:bg-surface-panel">
    <div class="nv-db-table-scroll tw:max-h-[460px] tw:overflow-auto tw:overscroll-contain tw:[scrollbar-color:color-mix(in_oklab,var(--text-muted)_38%,transparent)_transparent]" @scroll="onScroll">
    <div
      class="nv-db-table tw:grid tw:min-w-max tw:bg-surface-panel"
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
        <span class="nv-db-table__field-name tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ field.name }}</span>
        <NvPopupMenu placement="bottom-start" width="220px">
          <template #trigger>
            <button type="button" class="nv-db-table__field-menu-trigger tw:shrink-0 tw:cursor-pointer tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-1 tw:py-0.5 tw:text-content-muted tw:hover:bg-[color-mix(in_oklab,var(--accent)_10%,var(--hover,var(--surface-overlay)))] tw:hover:text-content-primary">⋮</button>
          </template>
          <DatabaseFieldMenu
            :t="t"
            :field="field"
            @update="(patch, immediate) => emit('update-field', field.id, patch, immediate)"
            @delete="emit('delete-field', field.id)"
          />
        </NvPopupMenu>
        <div class="nv-db-table__resize-handle tw:absolute tw:top-0 tw:right-0 tw:h-full tw:w-1.5 tw:cursor-col-resize tw:touch-none tw:hover:bg-[color-mix(in_oklab,var(--accent)_40%,transparent)]" @pointerdown="startResize(field, $event)" />
      </div>
      <div class="nv-db-cell-box nv-db-cell-box--head nv-db-cell-box--add-field">
        <button type="button" class="nv-db-table__add-field-btn tw:inline-flex tw:h-[22px] tw:w-[22px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:hover:bg-(--hover) tw:hover:text-content-primary" :aria-label="t('database.table.addField')" @click="emit('add-field')">
          <Plus :size="14" />
        </button>
      </div>
      <div class="nv-db-cell-box nv-db-cell-box--head nv-db-cell-box--actions" />

      <div v-if="topSpacer" class="nv-db-table__virtual-spacer tw:pointer-events-none tw:col-[1/-1]" :style="{ height: `${topSpacer}px` }" />
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
          <button type="button" class="nv-db-table__row-delete tw:inline-flex tw:h-[22px] tw:w-[22px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:hover:bg-(--hover) tw:hover:text-content-primary" @click="emit('delete-record', record.id)">
            <Trash2 :size="13" />
          </button>
        </div>
      </template>
      <div v-if="bottomSpacer" class="nv-db-table__virtual-spacer tw:pointer-events-none tw:col-[1/-1]" :style="{ height: `${bottomSpacer}px` }" />
    </div>
    </div>

    <button type="button" class="nv-db-table__add-row tw:flex tw:h-9 tw:w-full tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-0 tw:border-t tw:border-solid tw:border-t-(--db-border) tw:bg-transparent tw:px-3 tw:py-0 tw:text-left tw:text-[12px] tw:text-content-muted tw:hover:bg-[color-mix(in_oklab,var(--accent)_5%,var(--hover,var(--surface-overlay)))] tw:hover:text-content-primary" @click="emit('add-record')">
      <Plus :size="13" />
      {{ t('database.table.addRow') }}
    </button>

    <div v-if="!totalRecords" class="nv-db-table__empty">{{ t('database.table.empty') }}</div>
  </div>
</template>
