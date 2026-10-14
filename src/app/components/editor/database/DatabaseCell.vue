<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, Plus, X } from '../../../../ui/icons'
import NvPopupMenu from '../../../../ui/primitives/NvPopupMenu.vue'
import NvNumberInput from '../../../../ui/primitives/NvNumberInput.vue'
import NvCheckbox from '../../../../ui/primitives/NvCheckbox.vue'
import type { DbCellValue, DbField } from '../../../../types/database-block'
import { optionChipColor } from './dbColorPalette'
import { systemCommands } from '../../../../tauri/commands'

const props = defineProps<{
  field: DbField
  value: DbCellValue
  t: (key: string) => string
}>()

const emit = defineEmits<{
  update: [value: DbCellValue, immediate: boolean]
}>()

const isEditingUrl = ref(false)

const textValue = computed(() => (typeof props.value === 'string' ? props.value : ''))
const numberValue = computed<number>(() => (typeof props.value === 'number' ? props.value : Number.NaN))
const dateValue = computed(() => (typeof props.value === 'string' ? props.value : ''))
const boolValue = computed(() => props.value === true)
const arrayValue = computed(() => (Array.isArray(props.value) ? props.value : []))

const options = computed(() => props.field.options ?? [])
const selectedOption = computed(() => options.value.find(option => option.id === textValue.value))
const selectedOptions = computed(() => options.value.filter(option => arrayValue.value.includes(option.id)))

function onTextInput(event: Event) {
  emit('update', (event.target as HTMLInputElement).value, false)
}

function onNumberInput(value: number) {
  emit('update', Number.isNaN(value) ? null : value, false)
}

function onDateInput(event: Event) {
  emit('update', (event.target as HTMLInputElement).value, true)
}

function onCheckboxChange(value: boolean) {
  emit('update', value, true)
}

async function openUrl(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  const url = textValue.value.trim()
  if (!url) return
  await systemCommands.openExternalUrl(/^https?:\/\//i.test(url) ? url : `https://${url}`)
}

function pickSelectOption(optionId: string) {
  emit('update', optionId === textValue.value ? '' : optionId, true)
}

function toggleMultiOption(optionId: string) {
  const next = arrayValue.value.includes(optionId)
    ? arrayValue.value.filter(id => id !== optionId)
    : [...arrayValue.value, optionId]
  emit('update', next, true)
}
</script>

<template>
  <div class="nv-db-cell tw:w-full tw:min-w-0" :class="`nv-db-cell--${field.type}`">
    <input
      v-if="field.type === 'text'"
      class="nv-db-cell__input tw:w-full tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-0.5 tw:py-[3px] tw:font-nv-ui tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:bg-[color-mix(in_oklab,var(--accent)_8%,var(--hover-strong,var(--surface-overlay)))] tw:focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_16%,transparent)]"
      type="text"
      :value="textValue"
      @input="onTextInput"
    />

    <div v-else-if="field.type === 'url'" class="nv-db-cell__url tw:flex tw:w-full tw:min-w-0 tw:items-center tw:gap-1">
      <a
        v-if="!isEditingUrl && textValue"
        href="#"
        class="nv-db-cell__link"
        @click="openUrl"
      >
        <span class="nv-db-cell__link-text tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ textValue }}</span>
        <ExternalLink :size="11" />
      </a>
      <input
        v-if="isEditingUrl || !textValue"
        class="nv-db-cell__input tw:w-full tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-0.5 tw:py-[3px] tw:font-nv-ui tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:bg-[color-mix(in_oklab,var(--accent)_8%,var(--hover-strong,var(--surface-overlay)))] tw:focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_16%,transparent)]"
        type="text"
        :placeholder="t('database.cell.urlPlaceholder')"
        :value="textValue"
        @input="onTextInput"
        @blur="isEditingUrl = false"
      />
      <button
        v-if="textValue && !isEditingUrl"
        type="button"
        class="nv-db-cell__url-edit tw:shrink-0 tw:cursor-pointer tw:border-0 tw:bg-transparent tw:text-[10.5px] tw:text-content-muted"
        @click="isEditingUrl = true"
      >
        {{ t('database.cell.edit') }}
      </button>
    </div>

    <NvNumberInput
      v-else-if="field.type === 'number'"
      class="nv-db-cell__number-input"
      :model-value="numberValue"
      allow-empty
      :placeholder="t('database.cell.numberPlaceholder')"
      @update:model-value="onNumberInput"
    />

    <input
      v-else-if="field.type === 'date'"
      class="nv-db-cell__input tw:w-full tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-0.5 tw:py-[3px] tw:font-nv-ui tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:bg-[color-mix(in_oklab,var(--accent)_8%,var(--hover-strong,var(--surface-overlay)))] tw:focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_16%,transparent)]"
      type="date"
      :value="dateValue"
      @input="onDateInput"
    />

    <NvCheckbox v-else-if="field.type === 'checkbox'" class="nv-db-cell__checkbox" size="sm" :model-value="boolValue" @update:model-value="onCheckboxChange" />

    <NvPopupMenu v-else-if="field.type === 'select'" placement="bottom-start">
      <template #trigger>
        <button type="button" class="nv-db-cell__select-trigger tw:flex tw:min-h-6 tw:w-full tw:cursor-pointer tw:flex-wrap tw:items-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-0.5 tw:text-content-muted tw:hover:bg-(--hover)">
          <span
            v-if="selectedOption"
            class="nv-db-chip tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--chip-color)_30%,transparent)] tw:bg-[color-mix(in_oklab,var(--chip-color)_16%,transparent)] tw:px-[7px] tw:py-0.5 tw:text-[11px] tw:leading-[1.5] tw:font-medium tw:whitespace-nowrap tw:text-(--chip-color) tw:[--chip-color:var(--text-muted)]"
            :style="{ '--chip-color': optionChipColor(selectedOption.color) }"
          >{{ selectedOption.name }}</span>
          <span v-else class="nv-db-cell__placeholder tw:text-[12px] tw:text-content-muted">{{ t('database.cell.selectPlaceholder') }}</span>
        </button>
      </template>
      <div class="nv-db-cell__option-list tw:flex tw:min-w-40 tw:flex-col tw:gap-0.5 tw:p-1">
        <div v-if="!options.length" class="nv-db-cell__option-empty tw:p-2 tw:text-center tw:text-[11.5px] tw:text-content-muted">{{ t('database.cell.noOptions') }}</div>
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          class="nv-db-cell__option-row tw:flex tw:h-[30px] tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-1.5 tw:py-0 tw:hover:bg-(--hover) tw:justify-between"
          @click="pickSelectOption(option.id)"
        >
          <span class="nv-db-chip tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--chip-color)_30%,transparent)] tw:bg-[color-mix(in_oklab,var(--chip-color)_16%,transparent)] tw:px-[7px] tw:py-0.5 tw:text-[11px] tw:leading-[1.5] tw:font-medium tw:whitespace-nowrap tw:text-(--chip-color) tw:[--chip-color:var(--text-muted)]" :style="{ '--chip-color': optionChipColor(option.color) }">{{ option.name }}</span>
          <X v-if="option.id === textValue" :size="12" class="nv-db-cell__option-clear tw:text-content-muted" />
        </button>
      </div>
    </NvPopupMenu>

    <NvPopupMenu v-else-if="field.type === 'multi_select'" placement="bottom-start">
      <template #trigger>
        <button type="button" class="nv-db-cell__multi-trigger tw:flex tw:min-h-6 tw:w-full tw:cursor-pointer tw:flex-wrap tw:items-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-0.5 tw:text-content-muted tw:hover:bg-(--hover)">
          <span
            v-for="option in selectedOptions"
            :key="option.id"
            class="nv-db-chip tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--chip-color)_30%,transparent)] tw:bg-[color-mix(in_oklab,var(--chip-color)_16%,transparent)] tw:px-[7px] tw:py-0.5 tw:text-[11px] tw:leading-[1.5] tw:font-medium tw:whitespace-nowrap tw:text-(--chip-color) tw:[--chip-color:var(--text-muted)]"
            :style="{ '--chip-color': optionChipColor(option.color) }"
          >{{ option.name }}</span>
          <Plus v-if="!selectedOptions.length" :size="12" />
        </button>
      </template>
      <div class="nv-db-cell__option-list tw:flex tw:min-w-40 tw:flex-col tw:gap-0.5 tw:p-1">
        <div v-if="!options.length" class="nv-db-cell__option-empty tw:p-2 tw:text-center tw:text-[11.5px] tw:text-content-muted">{{ t('database.cell.noOptions') }}</div>
        <label v-for="option in options" :key="option.id" class="nv-db-cell__option-row nv-db-cell__option-row--multi tw:flex tw:h-[30px] tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-1.5 tw:py-0 tw:hover:bg-(--hover) tw:justify-start">
          <input
            type="checkbox" class="tw:accent-accent"
            :checked="arrayValue.includes(option.id)"
            @change="toggleMultiOption(option.id)"
          />
          <span class="nv-db-chip tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-[color-mix(in_oklab,var(--chip-color)_30%,transparent)] tw:bg-[color-mix(in_oklab,var(--chip-color)_16%,transparent)] tw:px-[7px] tw:py-0.5 tw:text-[11px] tw:leading-[1.5] tw:font-medium tw:whitespace-nowrap tw:text-(--chip-color) tw:[--chip-color:var(--text-muted)]" :style="{ '--chip-color': optionChipColor(option.color) }">{{ option.name }}</span>
        </label>
      </div>
    </NvPopupMenu>
  </div>
</template>
