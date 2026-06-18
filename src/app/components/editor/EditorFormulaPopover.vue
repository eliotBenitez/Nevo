<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorPopupPanel from './EditorPopupPanel.vue'

const props = defineProps<{
  open: boolean
  formula: string
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:formula': [value: string]
  apply: []
  remove: []
  keydown: [event: KeyboardEvent]
}>()

const { t } = useI18n()

const inputRef = ref<HTMLInputElement | null>(null)

function focusInput() {
  inputRef.value?.focus()
  inputRef.value?.select()
}

defineExpose({ focusInput })

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nextTick(() => focusInput())
  },
)

function onInput(event: Event) {
  emit('update:formula', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <EditorPopupPanel
    :open="open"
    :popover-style="popoverStyle"
    class-name="formula-popover"
    :label="t('editor.table.formulaLabel')"
    input-id="formula-input"
    :shortcut-text="t('common.keyboard.ctrlCmdEnter')"
    :hint="t('editor.table.formulaHint')"
    :apply-label="t('editor.table.formulaApply')"
    :remove-label="t('editor.table.formulaRemove')"
    @apply="emit('apply')"
    @remove="emit('remove')"
  >
    <input
      id="formula-input"
      ref="inputRef"
      class="editor-popup-panel__input"
      :value="formula"
      :placeholder="t('editor.table.formulaPlaceholder')"
      spellcheck="false"
      autocomplete="off"
      @input="onInput"
      @keydown="emit('keydown', $event)"
    />
  </EditorPopupPanel>
</template>
