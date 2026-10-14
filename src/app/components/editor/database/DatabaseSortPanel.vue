<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from '@lucide/vue'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import type { DbField, DbSortRule } from '../../../../types/database-block'
import { createSortRule } from '../../../../editor-core/databaseFilterSort'

const props = defineProps<{
  fields: DbField[]
  modelValue: DbSortRule[]
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [rules: DbSortRule[]]
}>()

const usedFieldIds = computed(() => new Set(props.modelValue.map(rule => rule.fieldId)))
const availableFields = computed(() => props.fields.filter(field => !usedFieldIds.value.has(field.id)))

function fieldOptionsFor(rule: DbSortRule) {
  return props.fields
    .filter(field => field.id === rule.fieldId || !usedFieldIds.value.has(field.id))
    .map(field => ({ value: field.id, label: field.name }))
}

function patch(index: number, next: Partial<DbSortRule>) {
  emit('update:modelValue', props.modelValue.map((rule, i) => (i === index ? { ...rule, ...next } : rule)))
}

function toggleDirection(index: number) {
  const rule = props.modelValue[index]
  patch(index, { direction: rule.direction === 'asc' ? 'desc' : 'asc' })
}

function addRule() {
  const field = availableFields.value[0] ?? props.fields[0]
  if (!field) return
  emit('update:modelValue', [...props.modelValue, createSortRule(field)])
}

function removeRule(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function clearAll() {
  emit('update:modelValue', [])
}
</script>

<template>
  <div class="nv-db-sort tw:flex tw:flex-col">
    <div v-if="!modelValue.length" class="nv-db-sort__empty tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-3.5 tw:text-[12px] tw:text-content-muted">
      <ArrowUpDown :size="14" />
      <span>{{ t('database.sort.empty') }}</span>
    </div>

    <div v-else class="nv-db-sort__rules tw:flex tw:max-h-70 tw:flex-col tw:gap-1.5 tw:overflow-y-auto tw:p-2">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="nv-db-sort__rule">
        <span class="nv-db-sort__conj tw:min-w-[46px] tw:text-[11px] tw:text-content-muted">{{ index === 0 ? t('database.sort.sortBy') : t('database.sort.then') }}</span>

        <NvSelect
          class="nv-db-sort__select"
          :model-value="rule.fieldId"
          :options="fieldOptionsFor(rule)"
          :min-width="140"
          @update:model-value="patch(index, { fieldId: $event })"
        />

        <button
          type="button"
          class="nv-db-sort__dir tw:inline-flex tw:h-[26px] tw:cursor-pointer tw:items-center tw:gap-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:py-0 tw:text-[11px] tw:whitespace-nowrap tw:text-content-secondary tw:hover:text-content-primary"
          :title="rule.direction === 'asc' ? t('database.sort.asc') : t('database.sort.desc')"
          @click="toggleDirection(index)"
        >
          <ArrowUp v-if="rule.direction === 'asc'" :size="13" />
          <ArrowDown v-else :size="13" />
          {{ rule.direction === 'asc' ? t('database.sort.asc') : t('database.sort.desc') }}
        </button>

        <button type="button" class="nv-db-sort__remove" :aria-label="t('database.sort.removeRule')" @click="removeRule(index)">
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="nv-db-sort__footer tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-2 tw:py-[7px]">
      <button type="button" class="nv-db-sort__add tw:inline-flex tw:h-[26px] tw:cursor-pointer tw:items-center tw:gap-[5px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-[9px] tw:py-0 tw:text-[11.5px] tw:font-[550] tw:text-accent tw:hover:enabled:bg-(--accent-soft) tw:disabled:cursor-not-allowed tw:disabled:text-content-muted" :disabled="!availableFields.length" @click="addRule">
        <Plus :size="13" />
        {{ t('database.sort.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="nv-db-sort__clear tw:h-[26px] tw:cursor-pointer tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-[9px] tw:py-0 tw:text-[11.5px] tw:text-content-muted tw:hover:bg-(--hover) tw:hover:text-content-primary" @click="clearAll">
        {{ t('database.sort.clearAll') }}
      </button>
    </div>
  </div>
</template>
