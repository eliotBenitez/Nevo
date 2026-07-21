<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { FolderPlus, PencilLine, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'

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
const dialogRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const open = computed(() => props.open)
const isFolderVariant = computed(() => props.variant === 'folder')
const inputLabel = computed(() => props.inputLabel ?? t('workspace.context.renamePrompt'))
const { activate, deactivate } = useFocusTrap(dialogRef, open)

watch(() => props.open, (open) => {
  if (open) {
    void nextTick(() => {
      activate()
      inputRef.value?.focus()
    })
  } else {
    deactivate()
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="rename-backdrop" @click.self="emit('close')">
      <form
        ref="dialogRef"
        class="rename-modal"
        :class="{ 'rename-modal--folder': isFolderVariant }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-modal-title"
        @submit.prevent="emit('submit')"
        @keydown.escape.prevent="emit('close')"
      >
        <header class="rename-modal__header">
          <div class="rename-modal__heading">
            <span class="rename-modal__icon" aria-hidden="true">
              <FolderPlus v-if="isFolderVariant" :size="18" :stroke-width="1.8" />
              <PencilLine v-else :size="18" :stroke-width="1.8" />
            </span>
            <div>
              <h3 id="rename-modal-title" class="rename-modal__title">{{ heading }}</h3>
              <p v-if="description" class="rename-modal__description">{{ description }}</p>
            </div>
          </div>
          <button type="button" class="nv-btn nv-btn--icon rename-modal__close" :aria-label="t('common.close')" @click="emit('close')">
            <X :size="16" :stroke-width="1.8" />
          </button>
        </header>
        <div class="rename-modal__field">
          <label class="rename-modal__label" for="rename-modal-input">{{ inputLabel }}</label>
          <input
            id="rename-modal-input"
            ref="inputRef"
            :value="title"
            class="rename-modal__input"
            :placeholder="placeholder ?? t('workspace.context.renameModalPlaceholder')"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'rename-modal-error' : undefined"
            autocomplete="off"
            @input="emit('update:title', ($event.target as HTMLInputElement).value)"
          />
          <p v-if="error" id="rename-modal-error" class="rename-modal__error" role="alert">{{ error }}</p>
        </div>
        <div class="rename-modal__actions">
          <button type="button" class="nv-btn" @click="emit('close')">{{ t('workspace.context.cancel') }}</button>
          <button type="submit" class="nv-btn nv-btn--primary" :disabled="submitDisabled">{{ submitLabel ?? t('workspace.context.confirm') }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
