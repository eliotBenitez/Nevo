<script setup lang="ts">
import { computed } from 'vue'
import type { DbCellValue, DbField } from '../../../../types/database-block'
import { optionChipColor } from './dbColorPalette'
import { formatCellValue } from './dbCellFormat'
import { parseDateOnly } from '../../../../utils/dateOnly'
import { i18n } from '../../../../i18n'

// Static rendering of a cell for read-only tables (query block results):
// no inputs, menus or placeholders that suggest the value can be edited here.
const props = defineProps<{
  field: DbField
  value: DbCellValue
  t: (key: string) => string
}>()

const chips = computed(() => {
  if (props.field.type !== 'select' && props.field.type !== 'multi_select') return []
  const ids = Array.isArray(props.value) ? props.value : typeof props.value === 'string' ? [props.value] : []
  return (props.field.options ?? []).filter(option => ids.includes(option.id))
})

const text = computed(() => {
  if (props.field.type === 'date' && typeof props.value === 'string') {
    const date = parseDateOnly(props.value)
    if (date) return date.toLocaleDateString(String(i18n.global.locale.value), { year: 'numeric', month: 'short', day: 'numeric' })
  }
  return formatCellValue(props.field, props.value, props.t)
})
</script>

<template>
  <div class="nv-db-cell nv-db-cell--readonly tw:flex tw:w-full tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-1" :class="`nv-db-cell--${field.type}`">
    <template v-if="field.type === 'select' || field.type === 'multi_select'">
      <span
        v-for="option in chips"
        :key="option.id"
        class="nv-db-chip tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--chip-color)_30%,transparent)] tw:bg-[color-mix(in_oklab,var(--chip-color)_16%,transparent)] tw:px-[7px] tw:py-0.5 tw:text-[11px] tw:leading-[1.5] tw:font-medium tw:whitespace-nowrap tw:text-(--chip-color) tw:[--chip-color:var(--text-muted)]"
        :style="{ '--chip-color': optionChipColor(option.color) }"
      >{{ option.name }}</span>
    </template>
    <span v-else class="nv-db-cell__text tw:overflow-hidden tw:px-0.5 tw:py-[3px] tw:font-nv-ui tw:text-[12.5px] tw:text-ellipsis tw:whitespace-nowrap tw:text-content-primary">{{ text }}</span>
  </div>
</template>
