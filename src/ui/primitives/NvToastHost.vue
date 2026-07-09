<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-vue-next'
import { useToast, type ToastVariant } from '../composables/useToast'

const { toastState, dismissToast } = useToast()

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

function iconFor(variant: ToastVariant) {
  return icons[variant]
}
</script>

<template>
  <Teleport to="body">
    <div class="nv-toast-host" role="region" aria-live="polite" aria-label="Notifications">
      <TransitionGroup name="nv-toast">
        <article
          v-for="toast in toastState.items"
          :key="toast.id"
          class="nv-toast"
          :class="`nv-toast--${toast.variant}`"
          role="status"
        >
          <span class="nv-toast__icon" aria-hidden="true">
            <component :is="iconFor(toast.variant)" :size="16" />
          </span>
          <div class="nv-toast__body">
            <div v-if="toast.title" class="nv-toast__title">{{ toast.title }}</div>
            <div class="nv-toast__message">{{ toast.message }}</div>
          </div>
          <button
            type="button"
            class="nv-toast__close"
            aria-label="Dismiss"
            @click="dismissToast(toast.id)"
          >
            <X :size="14" />
          </button>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.nv-toast-host {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9600;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}

.nv-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 12px 12px 14px;
  border: 1px solid var(--line-2);
  border-left-width: 3px;
  border-radius: calc(9px * var(--radius-scale, 1));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 94%, white) 0%, var(--surface-2) 100%);
  color: var(--text-primary);
  box-shadow: var(--shadow-lg), 0 1px 0 rgb(255 255 255 / 0.06) inset;
}

.nv-toast--success {
  border-left-color: oklch(0.62 0.15 150);
}

.nv-toast--error {
  border-left-color: oklch(0.55 0.18 25);
}

.nv-toast--info {
  border-left-color: var(--accent);
}

.nv-toast__icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  margin-top: 1px;
}

.nv-toast--success .nv-toast__icon {
  color: oklch(0.62 0.15 150);
}

.nv-toast--error .nv-toast__icon {
  color: oklch(0.58 0.19 25);
}

.nv-toast--info .nv-toast__icon {
  color: var(--accent);
}

.nv-toast__body {
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  gap: 2px;
}

.nv-toast__title {
  font-size: 13px;
  font-weight: 640;
  letter-spacing: 0;
}

.nv-toast__message {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.nv-toast__close {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin: -2px -2px 0 0;
  border: none;
  border-radius: calc(5px * var(--radius-scale, 1));
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.nv-toast__close:hover {
  background: var(--hover-strong);
  color: var(--text-primary);
}

.nv-toast-enter-active,
.nv-toast-leave-active {
  transition: opacity 200ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.nv-toast-enter-from {
  opacity: 0;
  transform: translateX(16px) scale(0.98);
}

.nv-toast-leave-to {
  opacity: 0;
  transform: translateX(16px) scale(0.98);
}

.nv-toast-leave-active {
  position: absolute;
  right: 0;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .nv-toast-enter-active,
  .nv-toast-leave-active {
    transition: opacity 120ms ease;
  }

  .nv-toast-enter-from,
  .nv-toast-leave-to {
    transform: none;
  }
}
</style>
