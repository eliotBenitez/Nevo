<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import {
  createDbId,
  type DbField,
  type DbFieldOption,
  type DbFieldType,
} from '../../../../types/database-block'
import { nextOptionColor, optionChipColor } from './dbColorPalette'

const props = defineProps<{
  field: DbField
  t: (key: string) => string
}>()

const emit = defineEmits<{
  update: [patch: Partial<DbField>, immediate: boolean]
  delete: []
}>()

const FIELD_TYPES: DbFieldType[] = ['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url']

const nameDraft = ref(props.field.name)
watch(() => props.field.name, (next) => {
  if (next !== nameDraft.value) nameDraft.value = next
})

function onNameInput(event: Event) {
  nameDraft.value = (event.target as HTMLInputElement).value
  emit('update', { name: nameDraft.value }, false)
}

const fieldTypeOptions = computed(() => FIELD_TYPES.map(type => ({
  value: type,
  label: props.t(`database.fieldTypes.${type}`),
})))

function onTypeChange(nextType: string) {
  const type = nextType as DbFieldType
  const patch: Partial<DbField> = { type }
  if ((type === 'select' || type === 'multi_select') && !props.field.options) {
    patch.options = []
  }
  emit('update', patch, true)
}

function addOption() {
  const options: DbFieldOption[] = [
    ...(props.field.options ?? []),
    { id: createDbId('opt'), name: '', color: nextOptionColor(props.field.options?.length ?? 0) },
  ]
  emit('update', { options }, true)
}

function updateOption(optionId: string, patch: Partial<DbFieldOption>, immediate: boolean) {
  const options = (props.field.options ?? []).map(option => (option.id === optionId ? { ...option, ...patch } : option))
  emit('update', { options }, immediate)
}

function removeOption(optionId: string) {
  const options = (props.field.options ?? []).filter(option => option.id !== optionId)
  emit('update', { options }, true)
}
</script>

<template>
  <div class="nv-db-field-menu">
    <div class="nv-db-field-menu__section">
      <label class="nv-db-field-menu__label">{{ t('database.field.namePlaceholder') }}</label>
      <input
        class="nv-db-field-menu__input"
        type="text"
        :value="nameDraft"
        :placeholder="t('database.field.namePlaceholder')"
        @input="onNameInput"
      />
    </div>

    <div class="nv-db-field-menu__section">
      <label class="nv-db-field-menu__label">{{ t('database.field.type') }}</label>
      <NvSelect
        class="nv-db-field-menu__type-select"
        :model-value="field.type"
        :options="fieldTypeOptions"
        :min-width="0"
        @update:model-value="onTypeChange"
      />
    </div>

    <div v-if="field.type === 'select' || field.type === 'multi_select'" class="nv-db-field-menu__section">
      <label class="nv-db-field-menu__label">{{ t('database.field.options') }}</label>
      <div class="nv-db-field-menu__options">
        <div v-for="option in field.options ?? []" :key="option.id" class="nv-db-field-menu__option">
          <input
            type="color"
            class="nv-db-field-menu__color"
            :value="optionChipColor(option.color)"
            @input="updateOption(option.id, { color: ($event.target as HTMLInputElement).value }, false)"
          />
          <input
            type="text"
            class="nv-db-field-menu__option-name"
            :placeholder="t('database.field.optionNamePlaceholder')"
            :value="option.name"
            @input="updateOption(option.id, { name: ($event.target as HTMLInputElement).value }, false)"
          />
          <button type="button" class="nv-db-field-menu__option-remove" @click="removeOption(option.id)">
            <Trash2 :size="12" />
          </button>
        </div>
        <button type="button" class="nv-db-field-menu__add-option" @click="addOption">
          <Plus :size="12" />
          {{ t('database.field.addOption') }}
        </button>
      </div>
    </div>

    <button type="button" class="nv-db-field-menu__delete" @click="emit('delete')">
      <Trash2 :size="13" />
      {{ t('database.field.delete') }}
    </button>
  </div>
</template>
