<script setup lang="ts">
import { editorPopupInputClass } from './editorPopupClasses'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
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

const firstFieldRef = ref<{ focus: () => void } | null>(null)

function setFirstFieldRef(el: unknown) {
  firstFieldRef.value = (el as { focus: () => void } | null) ?? null
}

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
    class="editor-overlay editor-popup-panel plugin-node-popover tw:fixed tw:z-60 tw:grid tw:w-[min(520px,calc(100vw-24px))] tw:-translate-x-1/2 tw:gap-2.5 tw:overflow-y-auto tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-3.5 tw:shadow-(--shadow-overlay)"
    :style="popoverStyle"
    @submit.prevent="emit('apply')"
    @keydown="emit('keydown', $event)"
  >
    <label class="editor-popup-panel__label tw:text-xs tw:font-semibold tw:tracking-[0.02em] tw:text-content-secondary tw:uppercase">{{ title }}</label>

    <div
      v-for="(field, index) in fields"
      :key="field.key"
      class="plugin-node-popover__field tw:mb-2 tw:flex tw:flex-col tw:gap-1"
    >
      <label v-if="field.label" class="plugin-node-popover__field-label tw:text-xs tw:text-content-secondary tw:opacity-70" :for="`plugin-field-${field.key}`">
        {{ field.label }}
      </label>

      <textarea
        v-if="(field.type ?? 'textarea') === 'textarea'"
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? setFirstFieldRef : undefined"
        class="editor-popup-panel__input" :class="editorPopupInputClass"
        :value="stringValue(field.key)"
        :rows="field.rows ?? 6"
        :placeholder="field.placeholder"
        @input="onText(field, $event)"
      />

      <NvSelect
        v-else-if="field.type === 'select'"
        :ref="index === 0 ? setFirstFieldRef : undefined"
        class="plugin-node-popover__select"
        :model-value="stringValue(field.key)"
        :options="field.options ?? []"
        :min-width="'100%'"
        @update:model-value="(value) => emit('update:value', { key: field.key, value })"
      />

      <input
        v-else-if="field.type === 'number'"
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? setFirstFieldRef : undefined"
        type="number"
        class="editor-popup-panel__input" :class="editorPopupInputClass"
        :value="stringValue(field.key)"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :placeholder="field.placeholder"
        @input="onNumber(field, $event)"
      >

      <label v-else-if="field.type === 'checkbox'" class="plugin-node-popover__checkbox tw:flex tw:items-center tw:gap-2 tw:text-[13px]">
        <input
          :id="`plugin-field-${field.key}`"
          :ref="index === 0 ? setFirstFieldRef : undefined"
          type="checkbox"
          :checked="booleanValue(field.key)"
          @change="onCheckbox(field, $event)"
        >
        <span>{{ field.placeholder ?? field.label }}</span>
      </label>

      <input
        v-else-if="field.type === 'color'"
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? setFirstFieldRef : undefined"
        type="color"
        class="plugin-node-popover__color tw:h-7 tw:w-12 tw:border-0 tw:bg-transparent tw:bg-transparent tw:p-0"
        :value="stringValue(field.key) || '#000000'"
        @input="onText(field, $event)"
      >

      <input
        v-else
        :id="`plugin-field-${field.key}`"
        :ref="index === 0 ? setFirstFieldRef : undefined"
        type="text"
        class="editor-popup-panel__input" :class="editorPopupInputClass"
        :value="stringValue(field.key)"
        :placeholder="field.placeholder"
        @input="onText(field, $event)"
      >
    </div>

    <div class="editor-popup-panel__meta tw:flex tw:items-center tw:justify-between tw:gap-3 tw:text-[11px] tw:text-content-muted">
      <span class="nv-kbd">{{ t('common.keyboard.ctrlCmdEnter') }}</span>
      <span>{{ t('editor.pluginBlock.applyHint') }}</span>
    </div>

    <div class="editor-popup-panel__actions tw:flex tw:justify-end tw:gap-2">
      <button type="submit" class="nv-btn nv-btn--primary">
        {{ t('editor.pluginBlock.apply') }}
      </button>
      <button v-if="removable" type="button" class="nv-btn" @click="emit('remove')">
        {{ t('editor.pluginBlock.delete') }}
      </button>
    </div>
  </form>
</template>
