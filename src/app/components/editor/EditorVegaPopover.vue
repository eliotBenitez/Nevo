<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorPopupPanel from './EditorPopupPanel.vue'

const props = defineProps<{
  open: boolean
  spec: string
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:spec': [value: string]
  apply: []
  remove: []
  keydown: [event: KeyboardEvent]
}>()

const { t, tm } = useI18n()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const placeholder = computed(() => {
  const message = tm('editor.vega.placeholder')
  return typeof message === 'string' ? message : ''
})

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
  emit('update:spec', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <EditorPopupPanel
    :open="open"
    :popover-style="popoverStyle"
    class-name="vega-popover"
    :label="t('editor.vega.label')"
    input-id="vega-input"
    :shortcut-text="t('common.keyboard.ctrlCmdEnter')"
    :hint="t('editor.vega.applyHint')"
    :apply-label="t('editor.vega.apply')"
    :remove-label="t('editor.vega.delete')"
    @apply="emit('apply')"
    @remove="emit('remove')"
  >
    <textarea
      id="vega-input"
      ref="textareaRef"
      class="editor-popup-panel__input"
      :value="spec"
      rows="12"
      :placeholder="placeholder"
      @input="onInput"
      @keydown="emit('keydown', $event)"
    />
  </EditorPopupPanel>
</template>
