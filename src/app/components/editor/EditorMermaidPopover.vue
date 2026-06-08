<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorPopupPanel from './EditorPopupPanel.vue'

const props = defineProps<{
  open: boolean
  code: string
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:code': [value: string]
  apply: []
  remove: []
  keydown: [event: KeyboardEvent]
}>()

const { t } = useI18n()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

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
</script>

<template>
  <EditorPopupPanel
    :open="open"
    :popover-style="popoverStyle"
    class-name="mermaid-popover"
    :label="t('editor.mermaid.label')"
    input-id="mermaid-input"
    :shortcut-text="t('common.keyboard.ctrlCmdEnter')"
    :hint="t('editor.mermaid.applyHint')"
    :apply-label="t('editor.mermaid.apply')"
    :remove-label="t('editor.mermaid.delete')"
    @apply="emit('apply')"
    @remove="emit('remove')"
  >
    <textarea
      id="mermaid-input"
      ref="textareaRef"
      class="editor-popup-panel__input"
      :value="code"
      rows="8"
      :placeholder="t('editor.mermaid.placeholder')"
      @input="onInput"
      @keydown="emit('keydown', $event)"
    />
  </EditorPopupPanel>
</template>
