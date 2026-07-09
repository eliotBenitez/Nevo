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
  <div class="kb-sort">
    <div v-if="!modelValue.length" class="kb-sort__empty">
      <ArrowUpDown :size="14" />
      <span>{{ t('kanban.sort.empty') }}</span>
    </div>

    <div v-else class="kb-sort__rules">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="kb-sort__rule">
        <span class="kb-sort__conj">{{ index === 0 ? t('kanban.sort.sortBy') : t('kanban.sort.then') }}</span>

        <NvSelect
          class="kb-sort__select"
          :model-value="rule.fieldId"
          :options="fieldOptionsFor(rule)"
          :min-width="140"
          @update:model-value="patch(index, { fieldId: $event })"
        />

        <button
          type="button"
          class="kb-sort__dir"
          :title="rule.direction === 'asc' ? t('kanban.sort.asc') : t('kanban.sort.desc')"
          @click="toggleDirection(index)"
        >
          <ArrowUp v-if="rule.direction === 'asc'" :size="13" />
          <ArrowDown v-else :size="13" />
          {{ rule.direction === 'asc' ? t('kanban.sort.asc') : t('kanban.sort.desc') }}
        </button>

        <button
          type="button"
          class="kb-sort__remove"
          :aria-label="t('kanban.sort.removeRule')"
          @click="removeRule(index)"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="kb-sort__footer">
      <button
        type="button"
        class="kb-sort__add"
        :disabled="!availableFields.length"
        @click="addRule"
      >
        <Plus :size="13" />
        {{ t('kanban.sort.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="kb-sort__clear" @click="clearAll">
        {{ t('kanban.sort.clearAll') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.kb-sort {
  display: flex;
  flex-direction: column;
}

.kb-sort__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  color: var(--text-4, var(--text-muted));
  font-size: 12px;
}

.kb-sort__rules {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.kb-sort__rule {
  display: flex;
  align-items: center;
  gap: 5px;
}

.kb-sort__conj {
  font-size: 11px;
  color: var(--text-4, var(--text-muted));
  min-width: 46px;
}

.kb-sort__select {
  flex: 1;
}

.kb-sort__dir {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: 1px solid var(--line-1, var(--border-subtle));
  background: var(--hover, var(--surface-1));
  color: var(--text-2, var(--text-secondary));
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.kb-sort__dir:hover { color: var(--text-1, var(--text-primary)); }

.kb-sort__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: none;
  background: none;
  color: var(--text-4, var(--text-muted));
  cursor: pointer;
  flex-shrink: 0;
}

.kb-sort__remove:hover {
  background: var(--hover, var(--surface-1));
  color: oklch(0.6 0.18 25);
}

.kb-sort__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px;
  border-top: 1px solid var(--line-1, var(--border-subtle));
}

.kb-sort__add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: none;
  background: none;
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
}

.kb-sort__add:disabled {
  color: var(--text-4, var(--text-muted));
  cursor: not-allowed;
}

.kb-sort__add:not(:disabled):hover {
  background: var(--accent-soft, rgb(161 98 7 / 0.12));
}

.kb-sort__clear {
  height: 26px;
  padding: 0 9px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: none;
  background: none;
  color: var(--text-3, var(--text-secondary));
  font-size: 11.5px;
  cursor: pointer;
}

.kb-sort__clear:hover {
  background: var(--hover, var(--surface-1));
  color: var(--text-1, var(--text-primary));
}
</style>
