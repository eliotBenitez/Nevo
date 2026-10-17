<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUp, Square } from '../../../ui/icons'
import NvButton from '../../../ui/primitives/NvButton.vue'
import AiChatModelPicker from './AiChatModelPicker.vue'

const props = defineProps<{
  streaming: boolean
  model: string
  local: boolean
  host: string
}>()
const emit = defineEmits<{ submit: [text: string]; stop: []; 'open-settings': [] }>()

const { t } = useI18n()
const draft = ref('')
const input = ref<HTMLTextAreaElement | null>(null)

function autosize() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

function submit() {
  const text = draft.value.trim()
  if (!text) return
  emit('submit', text)
  draft.value = ''
  void nextTick(autosize)
}

function onKeydown(event: KeyboardEvent) {
  // keyCode 229 is the IME "processing" key on engines that do not set isComposing for the committing Enter.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  // Enter never stops a reply; Stop is an explicit button.
  if (!props.streaming) submit()
}

defineExpose({ focus: () => input.value?.focus({ preventScroll: true }) })
</script>

<template>
  <form class="ai-composer" @submit.prevent="submit">
    <textarea
      ref="input"
      v-model="draft"
      class="ai-input"
      rows="2"
      :aria-label="t('aiChat.composer.label')"
      :placeholder="t('aiChat.composer.placeholder')"
      @input="autosize"
      @keydown="onKeydown"
    />
    <div class="ai-cbar">
      <AiChatModelPicker
        :model="model"
        :local="local"
        :host="host"
        @open-settings="emit('open-settings')"
      />
      <NvButton
        class="ai-send"
        variant="primary"
        icon
        :type="streaming ? 'button' : 'submit'"
        :disabled="!streaming && !draft.trim()"
        :aria-label="streaming ? t('aiChat.composer.stop') : t('aiChat.composer.send')"
        :title="streaming ? t('aiChat.composer.stop') : t('aiChat.composer.send')"
        @click="streaming && emit('stop')"
      >
        <component :is="streaming ? Square : ArrowUp" :size="16" aria-hidden="true" />
      </NvButton>
    </div>
  </form>
</template>
