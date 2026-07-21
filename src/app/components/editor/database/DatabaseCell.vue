<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, Plus, X } from 'lucide-vue-next'
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
  <div class="nv-db-cell" :class="`nv-db-cell--${field.type}`">
    <input
      v-if="field.type === 'text'"
      class="nv-db-cell__input"
      type="text"
      :value="textValue"
      @input="onTextInput"
    />

    <div v-else-if="field.type === 'url'" class="nv-db-cell__url">
      <a
        v-if="!isEditingUrl && textValue"
        href="#"
        class="nv-db-cell__link"
        @click="openUrl"
      >
        <span class="nv-db-cell__link-text">{{ textValue }}</span>
        <ExternalLink :size="11" />
      </a>
      <input
        v-if="isEditingUrl || !textValue"
        class="nv-db-cell__input"
        type="text"
        :placeholder="t('database.cell.urlPlaceholder')"
        :value="textValue"
        @input="onTextInput"
        @blur="isEditingUrl = false"
      />
      <button
        v-if="textValue && !isEditingUrl"
        type="button"
        class="nv-db-cell__url-edit"
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
      class="nv-db-cell__input"
      type="date"
      :value="dateValue"
      @input="onDateInput"
    />

    <NvCheckbox v-else-if="field.type === 'checkbox'" class="nv-db-cell__checkbox" size="sm" :model-value="boolValue" @update:model-value="onCheckboxChange" />

    <NvPopupMenu v-else-if="field.type === 'select'" placement="bottom-start">
      <template #trigger>
        <button type="button" class="nv-db-cell__select-trigger">
          <span
            v-if="selectedOption"
            class="nv-db-chip"
            :style="{ '--chip-color': optionChipColor(selectedOption.color) }"
          >{{ selectedOption.name }}</span>
          <span v-else class="nv-db-cell__placeholder">{{ t('database.cell.selectPlaceholder') }}</span>
        </button>
      </template>
      <div class="nv-db-cell__option-list">
        <div v-if="!options.length" class="nv-db-cell__option-empty">{{ t('database.cell.noOptions') }}</div>
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          class="nv-db-cell__option-row"
          @click="pickSelectOption(option.id)"
        >
          <span class="nv-db-chip" :style="{ '--chip-color': optionChipColor(option.color) }">{{ option.name }}</span>
          <X v-if="option.id === textValue" :size="12" class="nv-db-cell__option-clear" />
        </button>
      </div>
    </NvPopupMenu>

    <NvPopupMenu v-else-if="field.type === 'multi_select'" placement="bottom-start">
      <template #trigger>
        <button type="button" class="nv-db-cell__multi-trigger">
          <span
            v-for="option in selectedOptions"
            :key="option.id"
            class="nv-db-chip"
            :style="{ '--chip-color': optionChipColor(option.color) }"
          >{{ option.name }}</span>
          <Plus v-if="!selectedOptions.length" :size="12" />
        </button>
      </template>
      <div class="nv-db-cell__option-list">
        <div v-if="!options.length" class="nv-db-cell__option-empty">{{ t('database.cell.noOptions') }}</div>
        <label v-for="option in options" :key="option.id" class="nv-db-cell__option-row nv-db-cell__option-row--multi">
          <input
            type="checkbox"
            :checked="arrayValue.includes(option.id)"
            @change="toggleMultiOption(option.id)"
          />
          <span class="nv-db-chip" :style="{ '--chip-color': optionChipColor(option.color) }">{{ option.name }}</span>
        </label>
      </div>
    </NvPopupMenu>
  </div>
</template>
