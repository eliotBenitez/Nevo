<script setup lang="ts">
import { computed } from 'vue'
import type { DbField, DbRecord } from '../../../../types/database-block'
import { formatCellValue, isValuePresent } from './dbCellFormat'
import { optionChipColor } from './dbColorPalette'

interface Badge {
  key: string
  text: string
  color?: string
}

const props = defineProps<{
  t: (key: string) => string
  fields: DbField[]
  records: DbRecord[]
  recordOffset: number
  totalRecords: number
}>()

const emit = defineEmits<{ 'request-range': [offset: number] }>()
const ROW_HEIGHT = 100
const PAGE_SIZE = 180

function onScroll(event: Event) {
  const target = event.target as HTMLElement
  const desired = Math.max(0, Math.floor(target.scrollTop / ROW_HEIGHT) * 3 - 60)
  if (desired < props.recordOffset || desired + PAGE_SIZE > props.recordOffset + props.records.length) emit('request-range', desired)
}

const primaryField = computed(() => props.fields[0])
const badgeFields = computed(() =>
  props.fields.slice(1).filter(field => field.type === 'select' || field.type === 'multi_select' || field.type === 'number'),
)

function titleFor(record: DbRecord): string {
  if (!primaryField.value) return props.t('database.list.untitled')
  const value = record.cells[primaryField.value.id] ?? null
  const text = formatCellValue(primaryField.value, value, props.t)
  return text || props.t('database.list.untitled')
}

function badgesFor(record: DbRecord): Badge[] {
  const badges: Badge[] = []
  for (const field of badgeFields.value) {
    const value = record.cells[field.id] ?? null
    if (!isValuePresent(value)) continue
    if (field.type === 'select') {
      const option = field.options?.find(item => item.id === value)
      if (option) badges.push({ key: field.id, text: option.name, color: option.color })
    } else if (field.type === 'multi_select') {
      const ids = Array.isArray(value) ? value : []
      for (const id of ids) {
        const option = field.options?.find(item => item.id === id)
        if (option) badges.push({ key: `${field.id}-${id}`, text: option.name, color: option.color })
      }
    } else if (field.type === 'number') {
      badges.push({ key: field.id, text: `${field.name}: ${formatCellValue(field, value, props.t)}` })
    }
  }
  return badges
}
</script>

<template>
  <div class="nv-db-cards tw:grid tw:max-h-[460px] tw:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] tw:gap-2 tw:overflow-auto tw:overscroll-contain tw:max-[640px]:grid-cols-[repeat(auto-fill,minmax(144px,1fr))]" @scroll="onScroll">
    <div v-if="!totalRecords" class="nv-db-cards__empty tw:col-[1/-1] tw:p-4 tw:text-center tw:text-[12.5px] tw:text-content-muted">{{ t('database.table.empty') }}</div>
    <div v-if="recordOffset" class="nv-db-cards__spacer tw:pointer-events-none tw:col-[1/-1]" :style="{ height: `${Math.ceil(recordOffset / 3) * ROW_HEIGHT}px` }" />
    <div v-for="record in records" :key="record.id" class="nv-db-cards__card tw:flex tw:min-h-[92px] tw:flex-col tw:gap-[7px] tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-raised tw:p-3 tw:shadow-[0_1px_1px_rgb(15_23_42_/_2%)] tw:transition-[transform,border-color,box-shadow] tw:duration-150 tw:ease-[ease] tw:hover:border-[color-mix(in_oklab,var(--accent)_26%,var(--db-border))] tw:hover:shadow-[0_7px_16px_rgb(15_23_42_/_7%)] tw:motion-safe:hover:-translate-y-px tw:motion-reduce:transition-none">
      <div class="nv-db-cards__title tw:font-nv-ui tw:text-[13px] tw:leading-[normal] tw:font-[550] tw:text-content-primary">{{ titleFor(record) }}</div>
      <div v-if="badgesFor(record).length" class="nv-db-cards__badges tw:flex tw:flex-wrap tw:gap-1">
        <span
          v-for="badge in badgesFor(record)"
          :key="badge.key"
          class="nv-db-chip tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--chip-color)_30%,transparent)] tw:bg-[color-mix(in_oklab,var(--chip-color)_16%,transparent)] tw:px-[7px] tw:py-0.5 tw:text-[11px] tw:leading-[1.5] tw:font-medium tw:whitespace-nowrap tw:text-(--chip-color) tw:[--chip-color:var(--text-muted)]"
          :style="badge.color ? { '--chip-color': optionChipColor(badge.color) } : undefined"
        >{{ badge.text }}</span>
      </div>
    </div>
    <div v-if="totalRecords > recordOffset + records.length" class="nv-db-cards__spacer tw:pointer-events-none tw:col-[1/-1]" :style="{ height: `${Math.ceil((totalRecords - recordOffset - records.length) / 3) * ROW_HEIGHT}px` }" />
  </div>
</template>
