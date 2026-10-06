<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2, Filter } from '@lucide/vue'
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
  <div class="kb-filter tw:flex tw:max-w-[460px] tw:flex-col">
    <div v-if="!modelValue.length" class="kb-filter__empty tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-3.5 tw:text-xs tw:text-content-muted">
      <Filter :size="14" />
      <span>{{ t('kanban.filter.empty') }}</span>
    </div>

    <div v-else class="kb-filter__rules tw:flex tw:max-h-[320px] tw:flex-col tw:gap-1.5 tw:overflow-y-auto tw:p-2">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="kb-filter__rule tw:flex tw:flex-wrap tw:items-center tw:gap-[5px]">
        <span class="kb-filter__conj tw:min-w-[38px] tw:text-[11px] tw:text-content-muted tw:lowercase">{{ index === 0 ? t('kanban.filter.where') : t('kanban.filter.and') }}</span>

        <NvSelect
          class="kb-filter__field tw:shrink-0"
          :model-value="rule.fieldId"
          :options="fieldOptions"
          :min-width="120"
          @update:model-value="onFieldChange(index, $event)"
        />

        <NvSelect
          class="kb-filter__op tw:shrink-0"
          :model-value="rule.operator"
          :options="operatorOptions(rule)"
          :min-width="110"
          @update:model-value="onOperatorChange(index, $event as KanbanFilterOperator)"
        />

        <template v-if="showValueInput(rule)">
          <template v-if="fieldFor(rule)?.type === 'select'">
            <NvSelect
              class="kb-filter__value-select tw:min-w-[120px] tw:flex-1"
              :model-value="valueString(rule)"
              :options="selectValueOptions(rule)"
              :min-width="120"
              :placeholder="t('kanban.filter.selectValue')"
              @update:model-value="patch(index, { value: $event })"
            />
          </template>

          <template v-else-if="fieldFor(rule)?.type === 'checkbox'">
            <NvSelect
              class="kb-filter__value-select tw:min-w-[120px] tw:flex-1"
              :model-value="valueString(rule)"
              :options="checkboxOptions"
              :min-width="120"
              @update:model-value="patch(index, { value: $event })"
            />
          </template>

          <template v-else-if="fieldFor(rule)?.type === 'multi_select'">
            <div class="kb-filter__multi tw:flex tw:min-w-[120px] tw:flex-1 tw:flex-wrap tw:gap-x-2.5 tw:gap-y-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-1.5 tw:py-1">
              <label
                v-for="opt in fieldFor(rule)?.options ?? []"
                :key="opt.id"
                class="kb-filter__multi-opt tw:inline-flex tw:items-center tw:gap-[5px] tw:text-[11.5px] tw:text-content-secondary tw:cursor-pointer"
              >
                <input
                  type="checkbox"
                  class="tw:size-3 tw:accent-accent"
                  :checked="valueArray(rule).includes(opt.id)"
                  @change="toggleMultiValue(index, opt.id, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ opt.name }}</span>
              </label>
              <span v-if="!(fieldFor(rule)?.options?.length)" class="kb-filter__multi-empty tw:text-[11px] tw:text-content-muted">
                {{ t('kanban.filter.noOptions') }}
              </span>
            </div>
          </template>

          <input
            v-else-if="fieldFor(rule)?.type === 'number'"
            type="number"
            class="kb-filter__input kb-filter__select--value tw:h-[30px] tw:min-w-[90px] tw:flex-1 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2 tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:border-accent"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />

          <input
            v-else-if="fieldFor(rule)?.type === 'date'"
            type="date"
            class="kb-filter__input kb-filter__select--value tw:h-[30px] tw:min-w-[90px] tw:flex-1 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2 tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:border-accent"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />

          <input
            v-else
            type="text"
            class="kb-filter__input kb-filter__select--value tw:h-[30px] tw:min-w-[90px] tw:flex-1 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2 tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:border-accent"
            :placeholder="t('kanban.filter.valuePlaceholder')"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />
        </template>

        <button
          type="button"
          class="kb-filter__remove tw:inline-flex tw:size-[26px] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-danger"
          :aria-label="t('kanban.filter.removeRule')"
          @click="removeRule(index)"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="kb-filter__footer tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-2 tw:py-[7px]">
      <button type="button" class="kb-filter__add tw:inline-flex tw:h-[26px] tw:items-center tw:gap-[5px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:px-2.5 tw:text-[11.5px] tw:font-[550] tw:text-accent tw:cursor-pointer tw:enabled:hover:bg-[var(--accent-soft,rgb(161_98_7/0.12))] tw:disabled:cursor-not-allowed tw:disabled:text-content-muted" :disabled="!fields.length" @click="addRule">
        <Plus :size="13" />
        {{ t('kanban.filter.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="kb-filter__clear tw:h-[26px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:px-2.5 tw:text-[11.5px] tw:text-[var(--text-muted,var(--text-secondary))] tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-content-primary" @click="clearAll">
        {{ t('kanban.filter.clearAll') }}
      </button>
    </div>
  </div>
</template>
