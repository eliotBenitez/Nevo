<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
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
  <div class="nv-db-field-menu tw:flex tw:flex-col tw:gap-2.5 tw:p-1.5 tw:w-full tw:min-w-0 tw:max-w-full tw:box-border tw:overflow-x-hidden">
    <div class="nv-db-field-menu__section tw:flex tw:flex-col tw:gap-1.5 tw:pb-2 tw:min-w-0">
      <label class="nv-db-field-menu__label tw:text-[11px] tw:font-semibold tw:text-content-muted tw:uppercase tw:tracking-[.02em]">{{ t('database.field.namePlaceholder') }}</label>
      <input
        class="nv-db-field-menu__input tw:h-[30px] tw:px-2 tw:py-0 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:text-[12.5px] tw:outline-none tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--input-ring)] tw:font-nv-ui tw:w-full tw:min-w-0 tw:box-border"
        type="text"
        :value="nameDraft"
        :placeholder="t('database.field.namePlaceholder')"
        @input="onNameInput"
      />
    </div>

    <div class="nv-db-field-menu__section tw:flex tw:flex-col tw:gap-1.5 tw:pb-2 tw:min-w-0">
      <label class="nv-db-field-menu__label tw:text-[11px] tw:font-semibold tw:text-content-muted tw:uppercase tw:tracking-[.02em]">{{ t('database.field.type') }}</label>
      <NvSelect
        class="nv-db-field-menu__type-select"
        :model-value="field.type"
        :options="fieldTypeOptions"
        :min-width="0"
        @update:model-value="onTypeChange"
      />
    </div>

    <div v-if="field.type === 'select' || field.type === 'multi_select'" class="nv-db-field-menu__section tw:flex tw:flex-col tw:gap-1.5 tw:pb-2 tw:min-w-0">
      <label class="nv-db-field-menu__label tw:text-[11px] tw:font-semibold tw:text-content-muted tw:uppercase tw:tracking-[.02em]">{{ t('database.field.options') }}</label>
      <div class="nv-db-field-menu__options tw:flex tw:flex-col tw:gap-[5px]">
        <div v-for="option in field.options ?? []" :key="option.id" class="nv-db-field-menu__option tw:flex tw:items-center tw:gap-1.5 tw:min-w-0">
          <input
            type="color"
            class="nv-db-field-menu__color tw:size-[22px] tw:p-0 tw:border-0 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:bg-transparent tw:cursor-pointer tw:shrink-0"
            :value="optionChipColor(option.color)"
            @input="updateOption(option.id, { color: ($event.target as HTMLInputElement).value }, false)"
          />
          <input
            type="text"
            class="nv-db-field-menu__option-name tw:flex-1 tw:h-[26px] tw:px-[7px] tw:py-0 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:text-[12px] tw:outline-none tw:min-w-0 tw:box-border"
            :placeholder="t('database.field.optionNamePlaceholder')"
            :value="option.name"
            @input="updateOption(option.id, { name: ($event.target as HTMLInputElement).value }, false)"
          />
          <button type="button" class="nv-db-field-menu__option-remove tw:inline-flex tw:items-center tw:justify-center tw:size-[22px] tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:rounded-[calc(5px*var(--radius-scale,1))] tw:shrink-0 tw:hover:bg-[var(--hover,var(--surface-overlay))] tw:hover:text-danger" @click="removeOption(option.id)">
            <Trash2 :size="12" />
          </button>
        </div>
        <button type="button" class="nv-db-field-menu__add-option tw:inline-flex tw:items-center tw:gap-[5px] tw:h-[26px] tw:px-2 tw:py-0 tw:border-0 tw:bg-transparent tw:text-accent tw:text-[11.5px] tw:font-[550] tw:cursor-pointer tw:self-start tw:hover:bg-(--accent-soft) tw:hover:rounded-[calc(6px*var(--radius-scale,1))]" @click="addOption">
          <Plus :size="12" />
          {{ t('database.field.addOption') }}
        </button>
      </div>
    </div>

    <button type="button" class="nv-db-field-menu__delete tw:inline-flex tw:items-center tw:gap-1.5 tw:h-[30px] tw:px-2.5 tw:py-0 tw:border tw:border-solid tw:border-[var(--danger-line,transparent)] tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--danger-soft) tw:text-danger tw:text-[12px] tw:font-[550] tw:cursor-pointer tw:hover:bg-[color-mix(in_oklab,var(--danger)_20%,transparent)]" @click="emit('delete')">
      <Trash2 :size="13" />
      {{ t('database.field.delete') }}
    </button>
  </div>
</template>
