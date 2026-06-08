<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorPopupPanel from './EditorPopupPanel.vue'

const props = defineProps<{
  open: boolean
  markdown: string
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:markdown': [value: string]
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
  emit('update:markdown', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <EditorPopupPanel
    :open="open"
    :popover-style="popoverStyle"
    class-name="markmap-popover"
    :label="t('editor.markmap.label')"
    input-id="markmap-input"
    :shortcut-text="t('common.keyboard.ctrlCmdEnter')"
    :hint="t('editor.markmap.applyHint')"
    :apply-label="t('editor.markmap.apply')"
    :remove-label="t('editor.markmap.delete')"
    @apply="emit('apply')"
    @remove="emit('remove')"
  >
    <textarea
      id="markmap-input"
      ref="textareaRef"
      class="editor-popup-panel__input"
      :value="markdown"
      rows="8"
      :placeholder="t('editor.markmap.placeholder')"
      @input="onInput"
      @keydown="emit('keydown', $event)"
    />
  </EditorPopupPanel>
</template>
