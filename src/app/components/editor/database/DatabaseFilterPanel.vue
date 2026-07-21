<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2, Filter } from 'lucide-vue-next'
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
  <div class="nv-db-filter">
    <div v-if="!modelValue.length" class="nv-db-filter__empty">
      <Filter :size="14" />
      <span>{{ t('database.filter.empty') }}</span>
    </div>

    <div v-else class="nv-db-filter__rules">
      <div v-for="(rule, index) in modelValue" :key="rule.id" class="nv-db-filter__rule">
        <span class="nv-db-filter__conj">{{ index === 0 ? t('database.filter.where') : t('database.filter.and') }}</span>

        <NvSelect
          class="nv-db-filter__field"
          :model-value="rule.fieldId"
          :options="fieldOptions"
          :min-width="120"
          @update:model-value="onFieldChange(index, $event)"
        />

        <NvSelect
          class="nv-db-filter__op"
          :model-value="rule.operator"
          :options="operatorOptions(rule)"
          :min-width="110"
          @update:model-value="onOperatorChange(index, $event as DbFilterOperator)"
        />

        <template v-if="operatorNeedsValue(rule.operator)">
          <NvSelect
            v-if="fieldFor(rule)?.type === 'select'"
            class="nv-db-filter__value"
            :model-value="valueString(rule)"
            :options="selectValueOptions(rule)"
            :min-width="120"
            :placeholder="t('database.filter.selectValue')"
            @update:model-value="patch(index, { value: $event })"
          />

          <NvSelect
            v-else-if="fieldFor(rule)?.type === 'checkbox'"
            class="nv-db-filter__value"
            :model-value="valueString(rule)"
            :options="checkboxOptions"
            :min-width="120"
            @update:model-value="patch(index, { value: $event })"
          />

          <div v-else-if="fieldFor(rule)?.type === 'multi_select'" class="nv-db-filter__multi">
            <label v-for="opt in fieldFor(rule)?.options ?? []" :key="opt.id" class="nv-db-filter__multi-opt">
              <input
                type="checkbox"
                :checked="valueArray(rule).includes(opt.id)"
                @change="toggleMultiValue(index, opt.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ opt.name }}</span>
            </label>
            <span v-if="!(fieldFor(rule)?.options?.length)" class="nv-db-filter__multi-empty">
              {{ t('database.filter.noOptions') }}
            </span>
          </div>

          <NvNumberInput
            v-else-if="fieldFor(rule)?.type === 'number'"
            class="nv-db-filter__number-input"
            :model-value="numberValue(rule)"
            allow-empty
            :placeholder="t('database.filter.valuePlaceholder')"
            @update:model-value="updateNumberValue(index, $event)"
          />

          <input
            v-else-if="fieldFor(rule)?.type === 'date'"
            type="date"
            class="nv-db-filter__input"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />

          <input
            v-else
            type="text"
            class="nv-db-filter__input"
            :placeholder="t('database.filter.valuePlaceholder')"
            :value="valueString(rule)"
            @input="patch(index, { value: ($event.target as HTMLInputElement).value })"
          />
        </template>

        <button type="button" class="nv-db-filter__remove" :aria-label="t('database.filter.removeRule')" @click="removeRule(index)">
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="nv-db-filter__footer">
      <button type="button" class="nv-db-filter__add" :disabled="!fields.length" @click="addRule">
        <Plus :size="13" />
        {{ t('database.filter.addRule') }}
      </button>
      <button v-if="modelValue.length" type="button" class="nv-db-filter__clear" @click="clearAll">
        {{ t('database.filter.clearAll') }}
      </button>
    </div>
  </div>
</template>
