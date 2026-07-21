<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-vue-next'
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
  <div class="nv-db-sort">
    <div v-if="!modelValue.length" class="nv-db-sort__empty">
      <ArrowUpDown :size="14" />
      <span>{{ t('database.sort.empty') }}</span>
    </div>

    <div v-else class="nv-db-sort__rules">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="nv-db-sort__rule">
        <span class="nv-db-sort__conj">{{ index === 0 ? t('database.sort.sortBy') : t('database.sort.then') }}</span>

        <NvSelect
          class="nv-db-sort__select"
          :model-value="rule.fieldId"
          :options="fieldOptionsFor(rule)"
          :min-width="140"
          @update:model-value="patch(index, { fieldId: $event })"
        />

        <button
          type="button"
          class="nv-db-sort__dir"
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

    <div class="nv-db-sort__footer">
      <button type="button" class="nv-db-sort__add" :disabled="!availableFields.length" @click="addRule">
        <Plus :size="13" />
        {{ t('database.sort.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="nv-db-sort__clear" @click="clearAll">
        {{ t('database.sort.clearAll') }}
      </button>
    </div>
  </div>
</template>
