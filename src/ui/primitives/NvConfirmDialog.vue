<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Check, CircleHelp, Trash2, X } from 'lucide-vue-next'
import NvButton from './NvButton.vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import { resolveConfirmDialog, useConfirmDialog } from '../composables/useConfirmDialog'

const { t } = useI18n()
const { confirmDialogState } = useConfirmDialog()

const dialogRef = ref<HTMLElement | null>(null)
const active = computed(() => confirmDialogState.open)
const options = computed(() => confirmDialogState.options)
const title = computed(() => options.value?.title ?? t('confirmDialog.title'))
const message = computed(() => options.value?.message ?? '')
const variant = computed(() => options.value?.variant ?? 'default')
const cancelLabel = computed(() => options.value?.cancelLabel ?? t('workspace.context.cancel'))
const confirmLabel = computed(() =>
  options.value?.confirmLabel
    ?? (variant.value === 'danger' ? t('confirmDialog.delete') : t('workspace.context.confirm'))
)

const { activate, deactivate } = useFocusTrap(dialogRef, active)

watch(active, async (open) => {
  if (open) {
    await nextTick()
    activate()
  } else {
    deactivate()
  }
})

function cancel() {
  resolveConfirmDialog(false)
}

function submit() {
  resolveConfirmDialog(true)
}

function onKeyDown(event: KeyboardEvent) {
  if (!active.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  cancel()
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
        v-if="active"
        class="nv-confirm-backdrop"
        data-testid="nv-confirm-backdrop"
        @click.self="cancel"
      >
        <section
          ref="dialogRef"
          class="nv-confirm-dialog"
          :class="variant === 'danger' && 'nv-confirm-dialog--danger'"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nv-confirm-title"
          aria-describedby="nv-confirm-message"
          tabindex="-1"
        >
          <header class="nv-confirm-dialog__header">
            <span class="nv-confirm-dialog__icon" aria-hidden="true">
              <AlertTriangle v-if="variant === 'danger'" :size="18" />
              <CircleHelp v-else :size="18" />
            </span>
            <div class="nv-confirm-dialog__heading">
              <h2 id="nv-confirm-title">{{ title }}</h2>
              <p id="nv-confirm-message" class="nv-confirm-dialog__message">{{ message }}</p>
            </div>
          </header>
          <footer class="nv-confirm-dialog__footer">
            <NvButton variant="ghost" class="nv-confirm-dialog__button" @click="cancel">
              <X :size="14" aria-hidden="true" />
              {{ cancelLabel }}
            </NvButton>
            <NvButton
              :variant="variant === 'danger' ? 'danger' : 'primary'"
              class="nv-confirm-dialog__button nv-confirm-dialog__button--confirm"
              @click="submit"
            >
              <Trash2 v-if="variant === 'danger'" :size="14" aria-hidden="true" />
              <Check v-else :size="14" aria-hidden="true" />
              {{ confirmLabel }}
            </NvButton>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
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

.nv-confirm-dialog--danger {
  border-color: color-mix(in oklab, var(--status-danger, oklch(0.56 0.19 25)) 36%, var(--line-strong, transparent));
  box-shadow: var(--shadow-pop, var(--shadow-strong)), 0 18px 44px -28px var(--danger-glow, rgb(180 45 45 / 0.24));
}

.nv-confirm-dialog--danger::before {
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  content: '';
  background: linear-gradient(90deg, transparent, var(--status-danger, oklch(0.56 0.19 25)), transparent);
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

.nv-confirm-dialog--danger .nv-confirm-dialog__icon {
  border-color: var(--danger-line, color-mix(in oklab, var(--status-danger, oklch(0.56 0.19 25)) 28%, transparent));
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--status-danger-soft, transparent) 72%, var(--glass-3, transparent)), var(--status-danger-soft, transparent));
  color: var(--status-danger, oklch(0.56 0.19 25));
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
