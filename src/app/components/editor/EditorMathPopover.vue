<script setup lang="ts">
import { editorPopupInputClass } from './editorPopupClasses'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorPopupPanel from './EditorPopupPanel.vue'
import { findKatexCommandMatch, getKatexAutocompleteItems } from './katexAutocomplete'

const props = defineProps<{
  open: boolean
  latex: string
  isInline: boolean
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:latex': [value: string]
  apply: []
  remove: []
  keydown: [event: KeyboardEvent]
}>()

const { t } = useI18n()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const selectionStart = ref(0)
const activeSuggestionIndex = ref(0)
const pendingCaret = ref<number | null>(null)

const activeCommandMatch = computed(() => findKatexCommandMatch(props.latex, selectionStart.value))
const suggestions = computed(() => {
  const match = activeCommandMatch.value
  if (!match) return []
  return getKatexAutocompleteItems(match.query)
})

function focusInput() {
  textareaRef.value?.focus()
  textareaRef.value?.select()
  syncSelection()
}

defineExpose({ focusInput })

watch(
  () => props.open,
  (open) => {
    if (!open) {
      activeSuggestionIndex.value = 0
      selectionStart.value = 0
      return
    }

    nextTick(() => {
      syncSelection()
    })
  },
)

watch(
  () => props.latex,
  () => {
    if (pendingCaret.value === null) return
    const nextCaret = pendingCaret.value
    nextTick(() => {
      const textarea = textareaRef.value
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(nextCaret, nextCaret)
      selectionStart.value = nextCaret
      pendingCaret.value = null
    })
  },
)

watch(
  () => activeCommandMatch.value?.query ?? null,
  () => {
    activeSuggestionIndex.value = 0
  },
)

watch(suggestions, (next) => {
  if (next.length === 0) {
    activeSuggestionIndex.value = 0
    return
  }
  activeSuggestionIndex.value = Math.min(activeSuggestionIndex.value, next.length - 1)
})

function syncSelection() {
  const textarea = textareaRef.value
  if (!textarea) return
  selectionStart.value = textarea.selectionStart ?? 0
}

function selectSuggestion(index: number) {
  const textarea = textareaRef.value
  const match = activeCommandMatch.value
  const item = suggestions.value[index]
  if (!textarea || !match || !item) return

  const nextValue = `${props.latex.slice(0, match.from)}${item.insertText}${props.latex.slice(match.to)}`
  const nextCaret = match.from + item.cursorOffset

  pendingCaret.value = nextCaret
  emit('update:latex', nextValue)
  activeSuggestionIndex.value = 0
}

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:latex', target.value)
  selectionStart.value = target.selectionStart ?? target.value.length
}

function onKeyDown(event: KeyboardEvent) {
  const hasSuggestions = suggestions.value.length > 0

  if (hasSuggestions && event.key === 'ArrowDown') {
    event.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value + 1) % suggestions.value.length
    return
  }

  if (hasSuggestions && event.key === 'ArrowUp') {
    event.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value - 1 + suggestions.value.length) % suggestions.value.length
    return
  }

  if (hasSuggestions && (event.key === 'Enter' || event.key === 'Tab') && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    selectSuggestion(activeSuggestionIndex.value)
    return
  }

  emit('keydown', event)
}
</script>

<template>
  <EditorPopupPanel
    :open="open"
    :popover-style="popoverStyle"
    class-name="math-popover"
    :label="isInline ? t('workspace.inlineMathLabel') : t('workspace.mathBlockLabel')"
    input-id="math-input"
    :shortcut-text="t('common.keyboard.ctrlCmdEnter')"
    :hint="t('workspace.mathPopoverHint')"
    :apply-label="t('workspace.mathApply')"
    :remove-label="t('workspace.mathRemove')"
    @apply="emit('apply')"
    @remove="emit('remove')"
  >
    <textarea
      id="math-input"
      ref="textareaRef"
      class="editor-popup-panel__input" :class="editorPopupInputClass"
      :value="latex"
      :rows="isInline ? 3 : 6"
      :placeholder="t('workspace.mathPlaceholder')"
      @input="onInput"
      @keydown="onKeyDown"
      @click="syncSelection"
      @focus="syncSelection"
      @keyup="syncSelection"
      @select="syncSelection"
    />
    <div v-if="suggestions.length > 0" class="math-popover__suggestions tw:grid tw:max-h-[min(240px,38vh)] tw:gap-1.5 tw:overflow-y-auto tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:p-1.5">
      <button
        v-for="(item, index) in suggestions"
        :key="item.command"
        type="button"
        class="math-popover__suggestion tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:justify-between tw:gap-4 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:px-2.5 tw:py-2 tw:text-left tw:font-nv-ui tw:text-content-primary"
        :class="index === activeSuggestionIndex ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent-soft)_72%,transparent)]' : 'tw:bg-transparent'"
        @mousedown.prevent
        @click="selectSuggestion(index)"
      >
        <span class="math-popover__suggestion-command tw:font-nv-mono tw:text-xs tw:leading-[1.4]">{{ item.command }}</span>
        <span v-if="item.insertText !== item.command" class="math-popover__suggestion-preview tw:font-nv-mono tw:text-xs tw:leading-[1.4] tw:text-content-muted">{{ item.insertText }}</span>
      </button>
    </div>
  </EditorPopupPanel>
</template>
