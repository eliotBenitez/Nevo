<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, X } from 'lucide-vue-next'
import NvButton from './NvButton.vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import { resolvePasswordPrompt, usePasswordPrompt } from '../composables/usePasswordPrompt'

const { t } = useI18n()
const { passwordPromptState } = usePasswordPrompt()

const dialogRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const value = ref('')
const reveal = ref(false)

const active = computed(() => passwordPromptState.open)
const options = computed(() => passwordPromptState.options)
const required = computed(() => options.value?.required ?? true)
const canConfirm = computed(() => !required.value || value.value.length > 0)
const cancelLabel = computed(() => options.value?.cancelLabel ?? t('workspace.context.cancel'))
const confirmLabel = computed(() => options.value?.confirmLabel ?? t('workspace.context.confirm'))

const { activate, deactivate } = useFocusTrap(dialogRef, active)

watch(active, async (open) => {
  if (open) {
    value.value = ''
    reveal.value = false
    await nextTick()
    activate()
    inputRef.value?.focus()
  } else {
    deactivate()
  }
})

function cancel() {
  resolvePasswordPrompt(null)
}

function submit() {
  if (!canConfirm.value) return
  resolvePasswordPrompt(value.value)
}

function onKeyDown(event: KeyboardEvent) {
  if (!active.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  if (active.value) cancel()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="nv-confirm">
      <div
        v-if="active && options"
        class="nv-confirm-backdrop"
        data-testid="nv-password-prompt-backdrop"
        @click.self="cancel"
      >
        <section
          ref="dialogRef"
          class="nv-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nv-password-prompt-title"
          tabindex="-1"
        >
          <header class="nv-confirm-dialog__header">
            <span class="nv-confirm-dialog__icon" aria-hidden="true">
              <KeyRound :size="18" />
            </span>
            <div class="nv-confirm-dialog__heading">
              <h2 id="nv-password-prompt-title">{{ options.title }}</h2>
              <p v-if="options.message" class="nv-confirm-dialog__message">{{ options.message }}</p>
            </div>
          </header>

          <form class="nv-password-prompt__form" @submit.prevent="submit">
            <label class="nv-password-prompt__label" :for="'nv-password-prompt-input'">{{ options.label }}</label>
            <div class="nv-password-prompt__field">
              <input
                id="nv-password-prompt-input"
                ref="inputRef"
                v-model="value"
                class="nv-password-prompt__input"
                :type="reveal ? 'text' : 'password'"
                :placeholder="options.placeholder"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
              >
              <button
                type="button"
                class="nv-password-prompt__reveal"
                :aria-label="reveal ? t('workspaceTransfer.passwordPrompt.hide') : t('workspaceTransfer.passwordPrompt.show')"
                @click="reveal = !reveal"
              >
                <EyeOff v-if="reveal" :size="14" />
                <Eye v-else :size="14" />
              </button>
            </div>
            <p v-if="options.errorMessage" class="nv-password-prompt__error">
              <AlertTriangle :size="12" aria-hidden="true" />
              {{ options.errorMessage }}
            </p>
          </form>

          <footer class="nv-confirm-dialog__footer">
            <NvButton variant="ghost" class="nv-confirm-dialog__button" @click="cancel">
              <X :size="14" aria-hidden="true" />
              {{ cancelLabel }}
            </NvButton>
            <NvButton
              variant="primary"
              class="nv-confirm-dialog__button nv-confirm-dialog__button--confirm"
              :disabled="!canConfirm"
              @click="submit"
            >
              <Check :size="14" aria-hidden="true" />
              {{ confirmLabel }}
            </NvButton>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Shares .nv-confirm-* layout/animation with NvConfirmDialog (src/ui/primitives/NvConfirmDialog.vue);
   only the form-specific rules below are unique to this dialog. */
.nv-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(80% 70% at 50% 0%, color-mix(in oklab, var(--accent) 9%, transparent), transparent 72%),
    rgb(5 6 8 / 0.54);
  backdrop-filter: blur(10px) saturate(105%);
  -webkit-backdrop-filter: blur(10px) saturate(105%);
}

.nv-confirm-dialog {
  position: relative;
  width: min(430px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 18px 16px;
  overflow: hidden;
  border: 1px solid var(--line-strong, var(--border-muted));
  border-radius: calc(8px * var(--radius-scale, 1));
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--glass-3, var(--surface-1)) 96%, var(--canvas-1, transparent)), var(--glass-3, var(--surface-1))),
    var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  box-shadow: var(--shadow-pop, var(--shadow-strong));
  backdrop-filter: blur(22px) saturate(116%);
  -webkit-backdrop-filter: blur(22px) saturate(116%);
  outline: none;
}

.nv-confirm-dialog__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.nv-confirm-dialog__icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: calc(8px * var(--radius-scale, 1));
  border: 1px solid var(--line-2, transparent);
  background: color-mix(in oklab, var(--hover-strong, var(--hover)) 80%, var(--glass-3, transparent));
  color: var(--text-2, var(--text-secondary));
}

.nv-confirm-dialog__heading {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding-top: 0;
}

.nv-confirm-dialog__header h2 {
  margin: 0;
  color: var(--text-1, var(--text-primary));
  font-size: 15.5px;
  line-height: 1.25;
  font-weight: 650;
  letter-spacing: 0;
}

.nv-confirm-dialog__message {
  margin: 0;
  color: var(--text-2, var(--text-secondary));
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.nv-confirm-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.nv-confirm-dialog :deep(.nv-btn) {
  min-height: 36px;
  padding-inline: 14px;
  justify-content: center;
  font-size: 12.5px;
  transition:
    background 160ms ease,
    color 160ms ease,
    border-color 160ms ease,
    box-shadow 180ms ease,
    transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.nv-confirm-dialog :deep(.nv-btn:hover:not(:disabled)) {
  transform: translateY(-1px);
}

.nv-confirm-dialog :deep(.nv-btn:active:not(:disabled)) {
  transform: translateY(0) scale(0.98);
}

.nv-confirm-dialog :deep(.nv-btn svg) {
  flex: 0 0 auto;
  stroke-width: 2;
}

.nv-confirm-dialog__button--confirm {
  min-width: 96px;
}

.nv-password-prompt__form {
  display: grid;
  gap: 6px;
}

.nv-password-prompt__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2, var(--text-secondary));
}

.nv-password-prompt__field {
  position: relative;
  display: flex;
  align-items: center;
}

.nv-password-prompt__input {
  width: 100%;
  height: 38px;
  padding: 0 38px 0 12px;
  border: 1px solid var(--line-2, var(--border-muted));
  border-radius: calc(8px * var(--radius-scale, 1));
  background: var(--surface-1, var(--glass-2));
  color: var(--text-1, var(--text-primary));
  font-size: 13px;
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.nv-password-prompt__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent);
}

.nv-password-prompt__reveal {
  position: absolute;
  right: 6px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: calc(6px * var(--radius-scale, 1));
  background: transparent;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
}

.nv-password-prompt__reveal:hover {
  background: var(--hover, color-mix(in oklab, var(--text-1) 8%, transparent));
  color: var(--text-1, var(--text-primary));
}

.nv-password-prompt__reveal:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.nv-password-prompt__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--status-danger, oklch(0.56 0.19 25));
  font-size: 12px;
}

.nv-confirm-enter-active,
.nv-confirm-leave-active {
  transition: opacity 170ms ease;
}

.nv-confirm-enter-from,
.nv-confirm-leave-to {
  opacity: 0;
}

.nv-confirm-enter-active .nv-confirm-dialog {
  animation: nv-confirm-dialog-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.nv-confirm-leave-active .nv-confirm-dialog {
  animation: nv-confirm-dialog-out 120ms ease forwards;
}

@keyframes nv-confirm-dialog-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes nv-confirm-dialog-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(3px) scale(0.99);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nv-confirm-enter-active,
  .nv-confirm-leave-active {
    transition: none;
  }

  .nv-confirm-enter-active .nv-confirm-dialog,
  .nv-confirm-leave-active .nv-confirm-dialog {
    animation: none;
  }

  .nv-confirm-dialog :deep(.nv-btn) {
    transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
  }

  .nv-confirm-dialog :deep(.nv-btn:hover:not(:disabled)),
  .nv-confirm-dialog :deep(.nv-btn:active:not(:disabled)) {
    transform: none;
  }
}

@media (max-width: 480px) {
  .nv-confirm-dialog {
    width: 100%;
  }

  .nv-confirm-dialog__footer {
    flex-direction: column-reverse;
  }

  .nv-confirm-dialog :deep(.nv-btn) {
    min-height: 44px;
    width: 100%;
    justify-content: center;
  }
}
</style>
