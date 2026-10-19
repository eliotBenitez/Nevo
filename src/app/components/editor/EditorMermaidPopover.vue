<script setup lang="ts">
import { editorPopupInputClass } from './editorPopupClasses'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorPopupPanel from './EditorPopupPanel.vue'
import { HTML_BLOCK_MAX_HEIGHT, HTML_BLOCK_MIN_HEIGHT } from '../../../editor-core/schema/htmlBlock'

// Shared source popover: mermaid diagrams and raw HTML blocks.
const props = withDefaults(defineProps<{
  open: boolean
  kind?: 'mermaid' | 'html'
  code: string
  height?: number
  popoverStyle: Record<string, string>
}>(), { kind: 'mermaid', height: 240 })

const emit = defineEmits<{
  'update:code': [value: string]
  'update:height': [value: number]
  apply: []
  remove: []
  keydown: [event: KeyboardEvent]
}>()

const { t } = useI18n()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const inputId = computed(() => `${props.kind}-input`)
const heightInputId = computed(() => `${props.kind}-height-input`)

function focusInput() {
  textareaRef.value?.focus()
}

defineExpose({ focusInput })

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nextTick(() => textareaRef.value?.focus())
  },
)

function onInput(event: Event) {
  emit('update:code', (event.target as HTMLTextAreaElement).value)
}

function onHeightInput(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value)) emit('update:height', value)
}
</script>

<template>
  <EditorPopupPanel
    :open="open"
    :popover-style="popoverStyle"
    class-name="mermaid-popover"
    :label="t(`editor.${kind}.label`)"
    :input-id="inputId"
    :shortcut-text="t('common.keyboard.ctrlCmdEnter')"
    :hint="t(`editor.${kind}.applyHint`)"
    :apply-label="t(`editor.${kind}.apply`)"
    :remove-label="t(`editor.${kind}.delete`)"
    @apply="emit('apply')"
    @remove="emit('remove')"
  >
    <textarea
      :id="inputId"
      ref="textareaRef"
      class="editor-popup-panel__input" :class="editorPopupInputClass"
      :value="code"
      rows="8"
      :placeholder="t(`editor.${kind}.placeholder`)"
      @input="onInput"
      @keydown="emit('keydown', $event)"
    />
    <label v-if="kind === 'html'" class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-secondary" :for="heightInputId">
      <span>{{ t('editor.html.height') }}</span>
      <input
        :id="heightInputId"
        type="number"
        class="editor-popup-panel__input tw:w-28 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-3 tw:py-1.5 tw:text-[13px] tw:text-content-primary tw:outline-none tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--input-ring)]"
        :value="height"
        :min="HTML_BLOCK_MIN_HEIGHT"
        :max="HTML_BLOCK_MAX_HEIGHT"
        step="10"
        @input="onHeightInput"
        @keydown="emit('keydown', $event)"
      >
    </label>
  </EditorPopupPanel>
</template>
