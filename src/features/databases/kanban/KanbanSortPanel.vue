<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-vue-next'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import type { KanbanFilterField, KanbanSortRule } from './kanbanFilterSort'
import { createSortRule } from './kanbanFilterSort'

interface Props {
  fields: KanbanFilterField[]
  modelValue: KanbanSortRule[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [rules: KanbanSortRule[]]
}>()

const { t } = useI18n()

const usedFieldIds = computed(() => new Set(props.modelValue.map(rule => rule.fieldId)))
const availableFields = computed(() => props.fields.filter(field => !usedFieldIds.value.has(field.id)))

function fieldOptionsFor(rule: KanbanSortRule) {
  return props.fields
    .filter(field => field.id === rule.fieldId || !usedFieldIds.value.has(field.id))
    .map(field => ({ value: field.id, label: field.name }))
}

function patch(index: number, next: Partial<KanbanSortRule>) {
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
  <div class="kb-sort tw:flex tw:flex-col">
    <div v-if="!modelValue.length" class="kb-sort__empty tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-3.5 tw:text-xs tw:text-content-muted">
      <ArrowUpDown :size="14" />
      <span>{{ t('kanban.sort.empty') }}</span>
    </div>

    <div v-else class="kb-sort__rules tw:flex tw:max-h-[280px] tw:flex-col tw:gap-1.5 tw:overflow-y-auto tw:p-2">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="kb-sort__rule tw:flex tw:items-center tw:gap-[5px]">
        <span class="kb-sort__conj tw:min-w-[46px] tw:text-[11px] tw:text-content-muted">{{ index === 0 ? t('kanban.sort.sortBy') : t('kanban.sort.then') }}</span>

        <NvSelect
          class="kb-sort__select tw:flex-1"
          :model-value="rule.fieldId"
          :options="fieldOptionsFor(rule)"
          :min-width="140"
          @update:model-value="patch(index, { fieldId: $event })"
        />

        <button
          type="button"
          class="kb-sort__dir tw:inline-flex tw:h-[26px] tw:items-center tw:gap-1 tw:whitespace-nowrap tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-[var(--hover,var(--surface-raised))] tw:px-2 tw:text-[11px] tw:text-content-secondary tw:cursor-pointer tw:hover:text-content-primary"
          :title="rule.direction === 'asc' ? t('kanban.sort.asc') : t('kanban.sort.desc')"
          @click="toggleDirection(index)"
        >
          <ArrowUp v-if="rule.direction === 'asc'" :size="13" />
          <ArrowDown v-else :size="13" />
          {{ rule.direction === 'asc' ? t('kanban.sort.asc') : t('kanban.sort.desc') }}
        </button>

        <button
          type="button"
          class="kb-sort__remove tw:inline-flex tw:size-[26px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-danger"
          :aria-label="t('kanban.sort.removeRule')"
          @click="removeRule(index)"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="kb-sort__footer tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-2 tw:py-[7px]">
      <button
        type="button"
        class="kb-sort__add tw:inline-flex tw:h-[26px] tw:items-center tw:gap-[5px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:px-2.5 tw:text-[11.5px] tw:font-[550] tw:text-accent tw:cursor-pointer tw:enabled:hover:bg-[var(--accent-soft,rgb(161_98_7/0.12))] tw:disabled:cursor-not-allowed tw:disabled:text-content-muted"
        :disabled="!availableFields.length"
        @click="addRule"
      >
        <Plus :size="13" />
        {{ t('kanban.sort.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="kb-sort__clear tw:h-[26px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:px-2.5 tw:text-[11.5px] tw:text-[var(--text-muted,var(--text-secondary))] tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-content-primary" @click="clearAll">
        {{ t('kanban.sort.clearAll') }}
      </button>
    </div>
  </div>
</template>
