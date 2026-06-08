<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveEmbed, type EmbedResult } from '../../../utils/oembed'

const props = defineProps<{
  open: boolean
  position: { top: number; left: number }
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [result: { url: string; embedType: string; embedHtml: string; title: string; thumbnailUrl: string }]
  keydown: [event: KeyboardEvent]
}>()

const { t } = useI18n()

const urlRef = ref('')
const loadingRef = ref(false)
const errorRef = ref('')
const previewRef = ref<EmbedResult | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

function focusInput() {
  inputRef.value?.focus()
}

defineExpose({ focusInput })

watch(
  () => props.open,
  (open) => {
    if (!open) return
    urlRef.value = ''
    loadingRef.value = false
    errorRef.value = ''
    previewRef.value = null
    nextTick(() => inputRef.value?.focus())
  },
)

async function handleSubmit() {
  const url = urlRef.value.trim()
  if (!url) return

  loadingRef.value = true
  errorRef.value = ''

  try {
    const result = await resolveEmbed(url)
    if (!result) {
      errorRef.value = t('embed.unsupported')
      loadingRef.value = false
      return
    }

    emit('confirm', {
      url,
      embedType: result.provider,
      embedHtml: result.embedHtml,
      title: result.title,
      thumbnailUrl: result.thumbnailUrl,
    })
  } catch {
    errorRef.value = t('embed.error')
  } finally {
    loadingRef.value = false
  }
}
</script>

<template>
  <form
    v-if="open"
    class="editor-overlay embed-popover"
    :style="{ top: position.top + 'px', left: position.left + 'px' }"
    @submit.prevent="handleSubmit"
  >
    <label class="embed-popover__label" for="embed-url-input">{{ t('embed.pasteUrl') }}</label>
    <input
      id="embed-url-input"
      ref="inputRef"
      v-model="urlRef"
      class="embed-popover__input"
      type="url"
      placeholder="https://www.youtube.com/watch?v=..."
      :disabled="loadingRef"
      @keydown="emit('keydown', $event)"
    />
    <div v-if="errorRef" class="embed-popover__error">{{ errorRef }}</div>
    <div class="embed-popover__actions">
      <button type="submit" class="nv-btn nv-btn--primary" :disabled="!urlRef.trim() || loadingRef">
        {{ loadingRef ? t('embed.loading') : t('embed.pasteUrl') }}
      </button>
      <button type="button" class="nv-btn" @click="emit('cancel')">
        {{ t('embed.remove') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.embed-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 320px;
}
.embed-popover__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}
.embed-popover__input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border-2, color-mix(in oklab, var(--accent) 20%, transparent));
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--text-1);
  outline: none;
  transition: border-color 120ms ease;
}
.embed-popover__input:focus {
  border-color: var(--accent);
}
.embed-popover__input:disabled {
  opacity: 0.5;
}
.embed-popover__error {
  font-size: 12px;
  color: var(--danger, #ef4444);
}
.embed-popover__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>