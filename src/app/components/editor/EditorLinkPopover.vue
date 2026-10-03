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
    class="editor-overlay link-popover tw:fixed tw:z-60 tw:flex tw:w-[min(340px,calc(100vw-24px))] tw:-translate-x-1/2 tw:-translate-y-full tw:flex-col tw:gap-2 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:shadow-(--shadow-raised)"
    :style="popoverStyle"
    @submit.prevent="emit('apply')"
  >
    <label class="link-popover__label tw:text-[11px] tw:text-content-muted" for="link-input">{{ t('workspace.linkUrlLabel') }}</label>
    <input
      id="link-input"
      ref="inputRef"
      class="link-popover__input tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:py-[7px] tw:font-nv-ui tw:text-[13px] tw:leading-[1.3] tw:text-content-secondary tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--input-ring)] tw:focus:outline-none"
      type="text"
      :value="href"
      :placeholder="t('workspace.linkPlaceholder')"
      @input="emit('update:href', ($event.target as HTMLInputElement).value)"
      @keydown="emit('keydown', $event)"
    />
    <p v-if="error" class="link-popover__error tw:m-0 tw:text-[11px] tw:text-(--danger)">{{ error }}</p>
    <div class="link-popover__actions tw:flex tw:gap-1.5">
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
