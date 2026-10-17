<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy, FilePlus, RefreshCw, Replace, TextCursorInput } from '../../../ui/icons'
import NvButton from '../../../ui/primitives/NvButton.vue'

defineProps<{
  /** Text captured from the editor when the question was asked; Replace is disabled without it. */
  selectionText?: string
  /** Answer text with citation markers already removed. */
  answerText: string
}>()
const emit = defineEmits<{ insert: []; replace: []; copy: []; 'save-note': []; retry: [] }>()

const { t } = useI18n()
const previewing = ref(false)
const copied = ref(false)
const replaceBtn = ref<InstanceType<typeof NvButton> | null>(null)
const applyBtn = ref<InstanceType<typeof NvButton> | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

function focusButton(button: InstanceType<typeof NvButton> | null) {
  (button?.$el as HTMLElement | undefined)?.focus()
}

async function openPreview() {
  previewing.value = true
  await nextTick()
  focusButton(applyBtn.value)
}

async function closePreview() {
  previewing.value = false
  await nextTick()
  focusButton(replaceBtn.value)
}

function apply() {
  previewing.value = false
  emit('replace')
}

function copy() {
  emit('copy')
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 1400)
}

onBeforeUnmount(() => clearTimeout(copiedTimer))
</script>

<template>
  <div
    v-if="previewing"
    class="ai-diff-block"
    @keydown.ctrl.enter.prevent="apply"
    @keydown.meta.enter.prevent="apply"
    @keydown.esc.stop.prevent="closePreview"
  >
    <div class="ai-diff" role="group" :aria-label="t('aiChat.actions.diffLabel')">
      <del>{{ selectionText }}</del> <ins>{{ answerText }}</ins>
    </div>
    <div class="ai-diff-bar">
      <NvButton ref="applyBtn" variant="primary" @click="apply"><Check :size="14" aria-hidden="true" />{{ t('aiChat.actions.apply') }}</NvButton>
      <NvButton variant="ghost" @click="closePreview">{{ t('aiChat.actions.cancel') }}</NvButton>
      <span class="ai-diff-bar__hint"><kbd class="nv-kbd">Ctrl Enter</kbd></span>
    </div>
  </div>
  <div v-else class="ai-actions">
    <NvButton variant="ghost" @click="emit('insert')"><TextCursorInput :size="14" aria-hidden="true" />{{ t('aiChat.actions.insert') }}</NvButton>
    <NvButton
      ref="replaceBtn"
      variant="ghost"
      :disabled="!selectionText"
      :title="selectionText ? undefined : t('aiChat.actions.replaceNeedsSelection')"
      @click="openPreview"
    >
      <Replace :size="14" aria-hidden="true" />{{ t('aiChat.actions.replace') }}
    </NvButton>
    <NvButton variant="ghost" icon :class="{ 'ai-copied': copied }" :aria-label="t('aiChat.actions.copy')" :title="t('aiChat.actions.copy')" @click="copy">
      <component :is="copied ? Check : Copy" :size="14" aria-hidden="true" />
    </NvButton>
    <NvButton variant="ghost" icon :aria-label="t('aiChat.actions.saveAsNote')" :title="t('aiChat.actions.saveAsNote')" @click="emit('save-note')">
      <FilePlus :size="14" aria-hidden="true" />
    </NvButton>
    <NvButton variant="ghost" icon :aria-label="t('aiChat.actions.retry')" :title="t('aiChat.actions.retry')" @click="emit('retry')">
      <RefreshCw :size="14" aria-hidden="true" />
    </NvButton>
  </div>
</template>
