<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2, Filter } from 'lucide-vue-next'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import type {
  KanbanFilterField,
  KanbanFilterOperator,
  KanbanFilterRule,
} from './kanbanFilterSort'
import {
  createFilterRule,
  defaultOperatorFor,
  defaultValueFor,
  operatorNeedsValue,
  operatorsForType,
} from './kanbanFilterSort'

interface Props {
  fields: KanbanFilterField[]
  modelValue: KanbanFilterRule[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [rules: KanbanFilterRule[]]
}>()

const { t } = useI18n()

const fieldsById = computed(() => new Map(props.fields.map(field => [field.id, field])))

function fieldFor(rule: KanbanFilterRule): KanbanFilterField | undefined {
  return fieldsById.value.get(rule.fieldId)
}

const fieldOptions = computed(() => props.fields.map(field => ({ value: field.id, label: field.name })))

function operatorOptions(rule: KanbanFilterRule) {
  const field = fieldFor(rule)
  if (!field) return []
  return operatorsForType(field.type).map(op => ({ value: op, label: t(`kanban.filter.op.${op}`) }))
}

function selectValueOptions(rule: KanbanFilterRule) {
  return (fieldFor(rule)?.options ?? []).map(option => ({ value: option.id, label: option.name }))
}

const checkboxOptions = computed(() => [
  { value: 'true', label: t('kanban.filter.checked') },
  { value: 'false', label: t('kanban.filter.unchecked') },
])

function patch(index: number, next: Partial<KanbanFilterRule>) {
  const rules = props.modelValue.map((rule, i) => (i === index ? { ...rule, ...next } : rule))
  emit('update:modelValue', rules)
}

function onFieldChange(index: number, fieldId: string) {
  const field = fieldsById.value.get(fieldId)
  if (!field) return
  patch(index, {
    fieldId,
    operator: defaultOperatorFor(field.type),
    value: defaultValueFor(field.type),
  })
}

function onOperatorChange(index: number, operator: KanbanFilterOperator) {
  const rule = props.modelValue[index]
  const field = fieldFor(rule)
  const needsValue = operatorNeedsValue(operator)
  const value = needsValue
    ? (Array.isArray(rule.value) || typeof rule.value === 'string' ? rule.value : '')
    : ''
  patch(index, { operator, value: needsValue ? value : (field ? defaultValueFor(field.type) : value) })
}

function toggleMultiValue(index: number, optionId: string, checked: boolean) {
  const rule = props.modelValue[index]
  const current = Array.isArray(rule.value) ? rule.value : []
  const next = checked ? [...current, optionId] : current.filter(id => id !== optionId)
  patch(index, { value: next })
}

function addRule() {
  const field = props.fields[0]
  if (!field) return
  emit('update:modelValue', [...props.modelValue, createFilterRule(field)])
}

function removeRule(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function clearAll() {
  emit('update:modelValue', [])
}

function showValueInput(rule: KanbanFilterRule) {
  return operatorNeedsValue(rule.operator)
}

function valueArray(rule: KanbanFilterRule): string[] {
  return Array.isArray(rule.value) ? rule.value : []
}

function valueString(rule: KanbanFilterRule): string {
  return typeof rule.value === 'string' ? rule.value : ''
}
</script>

<template>
  <div class="kb-filter">
    <div v-if="!modelValue.length" class="kb-filter__empty">
      <Filter :size="14" />
      <span>{{ t('kanban.filter.empty') }}</span>
    </div>

    <div v-else class="kb-filter__rules">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="kb-filter__rule">
        <span class="kb-filter__conj">{{ index === 0 ? t('kanban.filter.where') : t('kanban.filter.and') }}</span>

        <NvSelect
          class="kb-filter__field"
          :model-value="rule.fieldId"
          :options="fieldOptions"
          :min-width="120"
          @update:model-value="onFieldChange(index, $event)"
        />

        <NvSelect
          class="kb-filter__op"
          :model-value="rule.operator"
          :options="operatorOptions(rule)"
          :min-width="110"
          @update:model-value="onOperatorChange(index, $event as KanbanFilterOperator)"
        />

        <template v-if="showValueInput(rule)">
          <template v-if="fieldFor(rule)?.type === 'select'">
            <NvSelect
              class="kb-filter__value-select"
              :model-value="valueString(rule)"
              :options="selectValueOptions(rule)"
              :min-width="120"
              :placeholder="t('kanban.filter.selectValue')"
              @update:model-value="patch(index, { value: $event })"
            />
          </template>

          <template v-else-if="fieldFor(rule)?.type === 'checkbox'">
            <NvSelect
              class="kb-filter__value-select"
              :model-value="valueString(rule)"
              :options="checkboxOptions"
              :min-width="120"
              @update:model-value="patch(index, { value: $event })"
            />
          </template>

          <template v-else-if="fieldFor(rule)?.type === 'multi_select'">
            <div class="kb-filter__multi">
              <label
                v-for="opt in fieldFor(rule)?.options ?? []"
                :key="opt.id"
                class="kb-filter__multi-opt"
              >
                <input
                  type="checkbox"
                  :checked="valueArray(rule).includes(opt.id)"
                  @change="toggleMultiValue(index, opt.id, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ opt.name }}</span>
              </label>
              <span v-if="!(fieldFor(rule)?.options?.length)" class="kb-filter__multi-empty">
                {{ t('kanban.filter.noOptions') }}
              </span>
            </div>
          </template>

          <input
            v-else-if="fieldFor(rule)?.type === 'number'"
            type="number"
            class="kb-filter__input kb-filter__select--value"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />

          <input
            v-else-if="fieldFor(rule)?.type === 'date'"
            type="date"
            class="kb-filter__input kb-filter__select--value"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />

          <input
            v-else
            type="text"
            class="kb-filter__input kb-filter__select--value"
            :placeholder="t('kanban.filter.valuePlaceholder')"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />
        </template>

        <button
          type="button"
          class="kb-filter__remove"
          :aria-label="t('kanban.filter.removeRule')"
          @click="removeRule(index)"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="kb-filter__footer">
      <button type="button" class="kb-filter__add" :disabled="!fields.length" @click="addRule">
        <Plus :size="13" />
        {{ t('kanban.filter.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="kb-filter__clear" @click="clearAll">
        {{ t('kanban.filter.clearAll') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.kb-filter {
  display: flex;
  flex-direction: column;
  max-width: 460px;
}

.kb-filter__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  color: var(--text-4, var(--text-muted));
  font-size: 12px;
}

.kb-filter__rules {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.kb-filter__rule {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.kb-filter__conj {
  font-size: 11px;
  color: var(--text-4, var(--text-muted));
  min-width: 38px;
  text-transform: lowercase;
}

.kb-filter__input {
  height: 30px;
  padding: 0 8px;
  border-radius: calc(8px * var(--radius-scale, 1));
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--hover, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  font-size: 12.5px;
  outline: none;
}

.kb-filter__input:focus {
  border-color: var(--accent);
}

.kb-filter__select--value { flex: 1; min-width: 90px; }

.kb-filter__field,
.kb-filter__op { flex-shrink: 0; }

.kb-filter__value-select {
  flex: 1;
  min-width: 120px;
}

.kb-filter__multi {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  flex: 1;
  min-width: 120px;
  padding: 4px 6px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: 1px solid var(--line-1, var(--border-subtle));
  background: var(--hover, var(--surface-1));
}

.kb-filter__multi-opt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-2, var(--text-secondary));
  cursor: pointer;
}

.kb-filter__multi-opt input {
  width: 12px;
  height: 12px;
  accent-color: var(--accent);
}

.kb-filter__multi-empty {
  font-size: 11px;
  color: var(--text-4, var(--text-muted));
}

.kb-filter__remove {
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

.kb-filter__remove:hover {
  background: var(--hover, var(--surface-1));
  color: oklch(0.6 0.18 25);
}

.kb-filter__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px;
  border-top: 1px solid var(--line-1, var(--border-subtle));
}

.kb-filter__add {
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

.kb-filter__add:disabled {
  color: var(--text-4, var(--text-muted));
  cursor: not-allowed;
}

.kb-filter__add:not(:disabled):hover {
  background: var(--accent-soft, oklch(0.66 0.10 258 / 0.12));
}

.kb-filter__clear {
  height: 26px;
  padding: 0 9px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: none;
  background: none;
  color: var(--text-3, var(--text-secondary));
  font-size: 11.5px;
  cursor: pointer;
}

.kb-filter__clear:hover {
  background: var(--hover, var(--surface-1));
  color: var(--text-1, var(--text-primary));
}
</style>
