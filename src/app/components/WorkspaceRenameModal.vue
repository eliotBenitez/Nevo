<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { FolderPlus, PencilLine } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvModal from '../../ui/primitives/NvModal.vue'

interface Props {
  open: boolean
  title: string
  heading: string
  description?: string
  inputLabel?: string
  placeholder?: string
  submitLabel?: string
  error?: string
  submitDisabled?: boolean
  variant?: 'default' | 'folder'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:title': [value: string]
  submit: []
  close: []
}>()

const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)
const isFolderVariant = computed(() => props.variant === 'folder')
const inputLabel = computed(() => props.inputLabel ?? t('workspace.context.renamePrompt'))

// NvModal owns the focus trap and runs its own activate() (which focuses the
// first focusable element, i.e. the header's close button) in a nextTick
// queued off this same prop change. Waiting a second tick here guarantees
// this input-focus runs after that, so the input — not the close button —
// ends up focused, matching this dialog's pre-NvModal behaviour.
watch(() => props.open, async (open) => {
  if (!open) return
  await nextTick()
  await nextTick()
  inputRef.value?.focus()
})
</script>

<template>
  <NvModal :open="open" size="sm" labelled-by="rename-modal-title" @close="emit('close')">
    <template #header>
      <span class="rename-modal__icon tw:grid tw:w-9 tw:h-9 tw:flex-none tw:place-items-center tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(11px*var(--radius-scale,1))] tw:bg-(--accent-soft) tw:text-accent" aria-hidden="true">
        <FolderPlus v-if="isFolderVariant" :size="18" :stroke-width="1.8" />
        <PencilLine v-else :size="18" :stroke-width="1.8" />
      </span>
      <div>
        <h3 id="rename-modal-title" class="rename-modal__title tw:m-0 tw:text-base tw:leading-[1.25] tw:text-content-primary tw:font-[620]">{{ heading }}</h3>
        <p v-if="description" class="rename-modal__description tw:mt-1 tw:mb-0 tw:text-content-muted tw:text-[12.5px] tw:leading-[1.45]">{{ description }}</p>
      </div>
    </template>
    <form
      id="rename-modal-form"
      class="rename-modal tw:flex tw:flex-col tw:gap-[18px]"
      :class="{ 'rename-modal--folder': isFolderVariant }"
      @submit.prevent="emit('submit')"
    >
      <div class="rename-modal__field tw:flex tw:flex-col tw:gap-[7px]">
        <label class="rename-modal__label tw:text-content-secondary tw:text-xs tw:font-[560]" for="rename-modal-input">{{ inputLabel }}</label>
        <input
          id="rename-modal-input"
          ref="inputRef"
          :value="title"
          class="rename-modal__input tw:w-full tw:h-10 tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:px-3 tw:text-[13.5px] tw:outline-none tw:transition-[border-color,box-shadow,background] tw:duration-150 tw:focus:border-accent tw:focus:shadow-[0_0_0_2px_var(--accent-soft)] tw:aria-[invalid=true]:border-[oklch(0.6_0.18_25)]"
          :placeholder="placeholder ?? t('workspace.context.renameModalPlaceholder')"
          :aria-invalid="!!error"
          :aria-describedby="error ? 'rename-modal-error' : undefined"
          autocomplete="off"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
        />
        <p v-if="error" id="rename-modal-error" class="rename-modal__error tw:m-0 tw:text-danger tw:text-xs tw:leading-[1.35]" role="alert">{{ error }}</p>
      </div>
    </form>
    <template #footer>
      <div class="rename-modal__actions tw:flex tw:items-center tw:justify-end tw:gap-2">
        <button type="button" class="nv-btn tw:min-h-[34px] tw:px-[13px]" @click="emit('close')">{{ t('workspace.context.cancel') }}</button>
        <button type="submit" form="rename-modal-form" class="nv-btn nv-btn--primary tw:min-h-[34px] tw:px-[13px]" :disabled="submitDisabled">{{ submitLabel ?? t('workspace.context.confirm') }}</button>
      </div>
    </template>
  </NvModal>
</template>
