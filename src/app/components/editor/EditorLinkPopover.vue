<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  open: boolean
  href: string
  editing: boolean
  error: string
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:href': [value: string]
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
</script>

<template>
  <form
    v-if="open"
    class="editor-overlay link-popover"
    :style="popoverStyle"
    @submit.prevent="emit('apply')"
  >
    <label class="link-popover__label" for="link-input">{{ t('workspace.linkUrlLabel') }}</label>
    <input
      id="link-input"
      ref="inputRef"
      class="link-popover__input"
      type="text"
      :value="href"
      :placeholder="t('workspace.linkPlaceholder')"
      @input="emit('update:href', ($event.target as HTMLInputElement).value)"
      @keydown="emit('keydown', $event)"
    />
    <p v-if="error" class="link-popover__error">{{ error }}</p>
    <div class="link-popover__actions">
      <button type="submit" class="nv-btn nv-btn--primary">
        {{ editing ? t('workspace.linkUpdate') : t('workspace.linkApply') }}
      </button>
      <button
        v-if="editing"
        type="button"
        class="nv-btn"
        @click="emit('remove')"
      >
        {{ t('workspace.linkRemove') }}
      </button>
    </div>
  </form>
</template>
