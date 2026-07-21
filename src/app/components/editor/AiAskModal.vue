<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const value = defineModel<string>({ required: true })

const { t } = useI18n()

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('confirm')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ai-ask-backdrop"
      @mousedown.self="emit('cancel')"
    >
      <div class="ai-ask-modal" role="dialog" :aria-label="t('editor.aiAsk.title')">
        <p class="ai-ask-modal__title">{{ t('editor.aiAsk.title') }}</p>
        <input
          v-model="value"
          class="ai-ask-modal__input"
          type="text"
          :placeholder="t('editor.aiAsk.placeholder')"
          autofocus
          @keydown="onKeyDown"
        />
        <div class="ai-ask-modal__actions">
          <button type="button" class="nv-btn nv-btn--ghost" @click="emit('cancel')">
            {{ t('editor.aiAsk.cancel') }}
          </button>
          <button type="button" class="nv-btn nv-btn--primary" @click="emit('confirm')">
            {{ t('editor.aiAsk.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ai-ask-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.ai-ask-modal {
  background: var(--nv-surface-1, #fff);
  border: 1px solid var(--nv-border, rgba(0, 0, 0, 0.12));
  border-radius: var(--nv-radius-lg, 10px);
  padding: 20px;
  width: 360px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-ask-modal__title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--nv-text-1, inherit);
}

.ai-ask-modal__input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--nv-border, rgba(0, 0, 0, 0.15));
  border-radius: var(--nv-radius-md, 6px);
  background: var(--nv-surface-2, #f5f5f5);
  color: var(--nv-text-1, inherit);
  font-size: 14px;
  outline: none;
}

.ai-ask-modal__input:focus {
  border-color: var(--nv-accent, #6c63ff);
}

.ai-ask-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
