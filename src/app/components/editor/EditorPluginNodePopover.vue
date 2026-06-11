<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NevoNodePopoverField } from '../../../types/editor-plugin'

const props = defineProps<{
  open: boolean
  title: string
  fields: NevoNodePopoverField[]
  values: Record<string, unknown>
  removable: boolean
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:value': [payload: { key: string; value: unknown }]
  apply: []
  remove: []
  keydown: [event: KeyboardEvent]
}>()

const { t } = useI18n()

const firstFieldRef = ref<HTMLElement | null>(null)

function focusInput() {
  firstFieldRef.value?.focus()
}

defineExpose({ focusInput })

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nextTick(() => firstFieldRef.value?.focus())
  },
)

function stringValue(key: string): string {
  const value = props.values[key]
  return value == null ? '' : String(value)
}

function booleanValue(key: string): boolean {
  return Boolean(props.values[key])
}

function onText(field: NevoNodePopoverField, event: Event) {
  emit('update:value', { key: field.key, value: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
}

function onNumber(field: NevoNodePopoverField, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  emit('update:value', { key: field.key, value: raw === '' ? '' : Number(raw) })
}

function onCheckbox(field: NevoNodePopoverField, event: Event) {
  emit('update:value', { key: field.key, value: (event.target as HTMLInputElement).checked })
}
</script>

<template>
  <form
    v-if="open"
    class="editor-overlay editor-popup-panel plugin-node-popover"
    :style="popoverStyle"
    @submit.prevent="emit('apply')"
  >
    <label class="editor-popup-panel__label">{{ title }}</label>

    <div
      v-for="(field, index) in fields"
      :key="field.key"
      class="plugin-node-popover__field"
    >
      <label v-if="field.label" class="plugin-node-popover__field-label" :for="`plugin-field-${field.key}`">
        {{ field.label }}
      </label>

      <textarea
        v-if="(field.type ?? 'textarea') === 'textarea'"
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? (el) => { firstFieldRef = el as HTMLElement } : undefined"
        class="editor-popup-panel__input"
        :value="stringValue(field.key)"
        :rows="field.rows ?? 6"
        :placeholder="field.placeholder"
        @input="onText(field, $event)"
        @keydown="emit('keydown', $event)"
      />

      <select
        v-else-if="field.type === 'select'"
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? (el) => { firstFieldRef = el as HTMLElement } : undefined"
        class="editor-popup-panel__input plugin-node-popover__select"
        :value="stringValue(field.key)"
        @change="onText(field, $event)"
        @keydown="emit('keydown', $event)"
      >
        <option v-for="opt in field.options ?? []" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>

      <input
        v-else-if="field.type === 'number'"
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? (el) => { firstFieldRef = el as HTMLElement } : undefined"
        type="number"
        class="editor-popup-panel__input"
        :value="stringValue(field.key)"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :placeholder="field.placeholder"
        @input="onNumber(field, $event)"
        @keydown="emit('keydown', $event)"
      >

      <label v-else-if="field.type === 'checkbox'" class="plugin-node-popover__checkbox">
        <input
          :id="`plugin-field-${field.key}`"
          :ref="index === 0 ? (el) => { firstFieldRef = el as HTMLElement } : undefined"
          type="checkbox"
          :checked="booleanValue(field.key)"
          @change="onCheckbox(field, $event)"
          @keydown="emit('keydown', $event)"
        >
        <span>{{ field.placeholder ?? field.label }}</span>
      </label>

      <input
        v-else-if="field.type === 'color'"
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? (el) => { firstFieldRef = el as HTMLElement } : undefined"
        type="color"
        class="plugin-node-popover__color"
        :value="stringValue(field.key) || '#000000'"
        @input="onText(field, $event)"
        @keydown="emit('keydown', $event)"
      >

      <input
        v-else
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? (el) => { firstFieldRef = el as HTMLElement } : undefined"
        type="text"
        class="editor-popup-panel__input"
        :value="stringValue(field.key)"
        :placeholder="field.placeholder"
        @input="onText(field, $event)"
        @keydown="emit('keydown', $event)"
      >
    </div>

    <div class="editor-popup-panel__meta">
      <span class="nv-kbd">{{ t('common.keyboard.ctrlCmdEnter') }}</span>
      <span>{{ t('editor.pluginBlock.applyHint') }}</span>
    </div>

    <div class="editor-popup-panel__actions">
      <button type="submit" class="nv-btn nv-btn--primary">
        {{ t('editor.pluginBlock.apply') }}
      </button>
      <button v-if="removable" type="button" class="nv-btn" @click="emit('remove')">
        {{ t('editor.pluginBlock.delete') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.plugin-node-popover__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.plugin-node-popover__field-label {
  font-size: 12px;
  opacity: 0.7;
}

.plugin-node-popover__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.plugin-node-popover__color {
  width: 48px;
  height: 28px;
  padding: 0;
  border: none;
  background: none;
}
</style>
