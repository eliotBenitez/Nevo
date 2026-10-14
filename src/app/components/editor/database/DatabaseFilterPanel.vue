<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2, Filter } from '../../../../ui/icons'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import NvNumberInput from '../../../../ui/primitives/NvNumberInput.vue'
import type { DbField, DbFilterOperator, DbFilterRule } from '../../../../types/database-block'
import {
  createFilterRule,
  defaultOperatorFor,
  defaultValueFor,
  operatorNeedsValue,
  operatorsForType,
} from '../../../../editor-core/databaseFilterSort'

const props = defineProps<{
  fields: DbField[]
  modelValue: DbFilterRule[]
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [rules: DbFilterRule[]]
}>()

const fieldsById = computed(() => new Map(props.fields.map(field => [field.id, field])))

function fieldFor(rule: DbFilterRule): DbField | undefined {
  return fieldsById.value.get(rule.fieldId)
}

const fieldOptions = computed(() => props.fields.map(field => ({ value: field.id, label: field.name })))

function operatorOptions(rule: DbFilterRule) {
  const field = fieldFor(rule)
  if (!field) return []
  return operatorsForType(field.type).map(op => ({ value: op, label: props.t(`database.filter.op.${op}`) }))
}

function selectValueOptions(rule: DbFilterRule) {
  return (fieldFor(rule)?.options ?? []).map(option => ({ value: option.id, label: option.name }))
}

const checkboxOptions = computed(() => [
  { value: 'true', label: props.t('database.filter.checked') },
  { value: 'false', label: props.t('database.filter.unchecked') },
])

function patch(index: number, next: Partial<DbFilterRule>) {
  emit('update:modelValue', props.modelValue.map((rule, i) => (i === index ? { ...rule, ...next } : rule)))
}

function onFieldChange(index: number, fieldId: string) {
  const field = fieldsById.value.get(fieldId)
  if (!field) return
  patch(index, { fieldId, operator: defaultOperatorFor(field.type), value: defaultValueFor(field.type) })
}

function onOperatorChange(index: number, operator: DbFilterOperator) {
  const rule = props.modelValue[index]
  const field = fieldFor(rule)
  const needsValue = operatorNeedsValue(operator)
  const value = needsValue
    ? (Array.isArray(rule.value) || typeof rule.value === 'string' ? rule.value : '')
    : (field ? defaultValueFor(field.type) : '')
  patch(index, { operator, value })
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

function valueArray(rule: DbFilterRule): string[] {
  return Array.isArray(rule.value) ? rule.value : []
}

function valueString(rule: DbFilterRule): string {
  return typeof rule.value === 'string' ? rule.value : ''
}

function numberValue(rule: DbFilterRule): number {
  const value = Number(valueString(rule))
  return Number.isFinite(value) ? value : Number.NaN
}

function updateNumberValue(index: number, value: number) {
  patch(index, { value: Number.isNaN(value) ? '' : String(value) })
}
</script>

<template>
  <div class="nv-db-filter tw:flex tw:max-w-[460px] tw:flex-col">
    <div v-if="!modelValue.length" class="nv-db-filter__empty tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-3.5 tw:text-[12px] tw:text-content-muted">
      <Filter :size="14" />
      <span>{{ t('database.filter.empty') }}</span>
    </div>

    <div v-else class="nv-db-filter__rules tw:flex tw:max-h-80 tw:flex-col tw:gap-1.5 tw:overflow-y-auto tw:p-2">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="nv-db-filter__rule tw:flex tw:flex-wrap tw:items-center tw:gap-[5px]">
        <span class="nv-db-filter__conj tw:min-w-[38px] tw:text-[11px] tw:lowercase tw:text-content-muted">{{ index === 0 ? t('database.filter.where') : t('database.filter.and') }}</span>

        <NvSelect
          class="nv-db-filter__field tw:shrink-0"
          :model-value="rule.fieldId"
          :options="fieldOptions"
          :min-width="120"
          @update:model-value="onFieldChange(index, $event)"
        />

        <NvSelect
          class="nv-db-filter__op tw:shrink-0"
          :model-value="rule.operator"
          :options="operatorOptions(rule)"
          :min-width="110"
          @update:model-value="onOperatorChange(index, $event as DbFilterOperator)"
        />

        <template v-if="operatorNeedsValue(rule.operator)">
          <NvSelect
            v-if="fieldFor(rule)?.type === 'select'"
            class="nv-db-filter__value tw:flex-1"
            :model-value="valueString(rule)"
            :options="selectValueOptions(rule)"
            :min-width="120"
            :placeholder="t('database.filter.selectValue')"
            @update:model-value="patch(index, { value: $event })"
          />

          <NvSelect
            v-else-if="fieldFor(rule)?.type === 'checkbox'"
            class="nv-db-filter__value tw:flex-1"
            :model-value="valueString(rule)"
            :options="checkboxOptions"
            :min-width="120"
            @update:model-value="patch(index, { value: $event })"
          />

          <div v-else-if="fieldFor(rule)?.type === 'multi_select'" class="nv-db-filter__multi tw:flex tw:min-w-[120px] tw:flex-1 tw:flex-wrap tw:gap-x-2.5 tw:gap-y-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-1.5 tw:py-1">
            <label v-for="opt in fieldFor(rule)?.options ?? []" :key="opt.id" class="nv-db-filter__multi-opt tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-[5px] tw:text-[11.5px] tw:text-content-secondary">
              <input
                type="checkbox"
                class="tw:h-3 tw:w-3 tw:accent-(--accent)"
                :checked="valueArray(rule).includes(opt.id)"
                @change="toggleMultiValue(index, opt.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ opt.name }}</span>
            </label>
            <span v-if="!(fieldFor(rule)?.options?.length)" class="nv-db-filter__multi-empty tw:text-[11px] tw:text-content-muted">
              {{ t('database.filter.noOptions') }}
            </span>
          </div>

          <NvNumberInput
            v-else-if="fieldFor(rule)?.type === 'number'"
            class="nv-db-filter__number-input tw:min-w-[112px] tw:flex-1"
            :model-value="numberValue(rule)"
            allow-empty
            :placeholder="t('database.filter.valuePlaceholder')"
            @update:model-value="updateNumberValue(index, $event)"
          />

          <input
            v-else-if="fieldFor(rule)?.type === 'date'"
            type="date"
            class="nv-db-filter__input tw:h-[30px] tw:min-w-[90px] tw:flex-1 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2 tw:py-0 tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--input-ring)]"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />

          <input
            v-else
            type="text"
            class="nv-db-filter__input tw:h-[30px] tw:min-w-[90px] tw:flex-1 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2 tw:py-0 tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--input-ring)]"
            :placeholder="t('database.filter.valuePlaceholder')"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />
        </template>

        <button type="button" class="nv-db-filter__remove tw:inline-flex tw:h-[26px] tw:w-[26px] tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:hover:bg-(--hover) tw:hover:text-danger" :aria-label="t('database.filter.removeRule')" @click="removeRule(index)">
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="nv-db-filter__footer tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-2 tw:py-[7px]">
      <button type="button" class="nv-db-filter__add tw:inline-flex tw:h-[26px] tw:cursor-pointer tw:items-center tw:gap-[5px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-[9px] tw:py-0 tw:text-[11.5px] tw:font-[550] tw:text-accent tw:hover:enabled:bg-(--accent-soft) tw:disabled:cursor-not-allowed tw:disabled:text-content-muted" :disabled="!fields.length" @click="addRule">
        <Plus :size="13" />
        {{ t('database.filter.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="nv-db-filter__clear tw:h-[26px] tw:cursor-pointer tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-[9px] tw:py-0 tw:text-[11.5px] tw:text-content-muted tw:hover:bg-(--hover) tw:hover:text-content-primary" @click="clearAll">
        {{ t('database.filter.clearAll') }}
      </button>
    </div>
  </div>
</template>
