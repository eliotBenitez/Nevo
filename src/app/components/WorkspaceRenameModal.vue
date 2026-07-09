<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  open: boolean
  title: string
  heading: string
  placeholder?: string
  submitLabel?: string
  error?: string
  submitDisabled?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:title': [value: string]
  submit: []
  close: []
}>()

const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.open, (open) => {
  if (open) {
    void nextTick(() => inputRef.value?.focus())
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="rename-backdrop" @click.self="emit('close')">
      <form class="rename-modal" @submit.prevent="emit('submit')" @keydown.escape.prevent="emit('close')">
        <h3 class="rename-modal__title">{{ heading }}</h3>
        <input
          ref="inputRef"
          :value="title"
          class="rename-modal__input"
          :placeholder="placeholder ?? t('workspace.context.renameModalPlaceholder')"
          :aria-invalid="!!error"
          :aria-describedby="error ? 'rename-modal-error' : undefined"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
        />
        <p v-if="error" id="rename-modal-error" class="rename-modal__error">{{ error }}</p>
        <div class="rename-modal__actions">
          <button type="button" class="nv-btn" @click="emit('close')">{{ t('workspace.context.cancel') }}</button>
          <button type="submit" class="nv-btn nv-btn--primary" :disabled="submitDisabled">{{ submitLabel ?? t('workspace.context.confirm') }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
