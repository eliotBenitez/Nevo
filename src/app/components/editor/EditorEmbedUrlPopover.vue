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
    class="editor-overlay embed-popover tw:fixed tw:z-60 tw:flex tw:min-w-[320px] tw:flex-col tw:gap-2"
    :style="{ top: position.top + 'px', left: position.left + 'px' }"
    @submit.prevent="handleSubmit"
  >
    <label class="embed-popover__label tw:text-[13px] tw:font-medium tw:text-content-secondary" for="embed-url-input">{{ t('embed.pasteUrl') }}</label>
    <input
      id="embed-url-input"
      ref="inputRef"
      v-model="urlRef"
      class="embed-popover__input tw:w-full tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-line-default tw:bg-(--surface-raised) tw:px-3 tw:py-2 tw:text-sm tw:text-content-primary tw:outline-none tw:transition-colors tw:duration-120 tw:focus:border-accent tw:disabled:opacity-50"
      type="url"
      placeholder="https://www.youtube.com/watch?v=..."
      :disabled="loadingRef"
      @keydown="emit('keydown', $event)"
    />
    <div v-if="errorRef" class="embed-popover__error tw:text-xs tw:text-danger">{{ errorRef }}</div>
    <div class="embed-popover__actions tw:flex tw:justify-end tw:gap-2">
      <button type="submit" class="nv-btn nv-btn--primary" :disabled="!urlRef.trim() || loadingRef">
        {{ loadingRef ? t('embed.loading') : t('embed.pasteUrl') }}
      </button>
      <button type="button" class="nv-btn" @click="emit('cancel')">
        {{ t('embed.remove') }}
      </button>
    </div>
  </form>
</template>
