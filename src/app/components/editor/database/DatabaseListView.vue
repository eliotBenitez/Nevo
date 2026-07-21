<script setup lang="ts">
import { computed } from 'vue'
import type { DbField, DbRecord } from '../../../../types/database-block'
import { formatCellValue, isValuePresent } from './dbCellFormat'

const props = defineProps<{
  t: (key: string) => string
  fields: DbField[]
  records: DbRecord[]
  recordOffset: number
  totalRecords: number
}>()

const emit = defineEmits<{ 'request-range': [offset: number] }>()
const ROW_HEIGHT = 54
const PAGE_SIZE = 180

function onScroll(event: Event) {
  const target = event.target as HTMLElement
  const desired = Math.max(0, Math.floor(target.scrollTop / ROW_HEIGHT) - 60)
  if (desired < props.recordOffset || desired + PAGE_SIZE > props.recordOffset + props.records.length) emit('request-range', desired)
}

const primaryField = computed(() => props.fields[0])
const restFields = computed(() => props.fields.slice(1))

function titleFor(record: DbRecord): string {
  if (!primaryField.value) return props.t('database.list.untitled')
  const value = record.cells[primaryField.value.id] ?? null
  const text = formatCellValue(primaryField.value, value, props.t)
  return text || props.t('database.list.untitled')
}

function metaFor(record: DbRecord): string {
  return restFields.value
    .map(field => {
      const value = record.cells[field.id] ?? null
      if (!isValuePresent(value)) return null
      const text = formatCellValue(field, value, props.t)
      return text ? `${field.name}: ${text}` : null
    })
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}
</script>

<template>
  <div class="nv-db-list" @scroll="onScroll">
    <div v-if="!totalRecords" class="nv-db-list__empty">{{ t('database.table.empty') }}</div>
    <div v-if="recordOffset" class="nv-db-list__spacer" :style="{ height: `${recordOffset * ROW_HEIGHT}px` }" />
    <div v-for="record in records" :key="record.id" class="nv-db-list__row">
      <div class="nv-db-list__title">{{ titleFor(record) }}</div>
      <div v-if="metaFor(record)" class="nv-db-list__meta">{{ metaFor(record) }}</div>
    </div>
    <div v-if="totalRecords > recordOffset + records.length" class="nv-db-list__spacer" :style="{ height: `${(totalRecords - recordOffset - records.length) * ROW_HEIGHT}px` }" />
  </div>
</template>
