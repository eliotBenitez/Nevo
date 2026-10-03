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
    <div
      class="nv-toast-host tw:fixed tw:top-4 tw:right-4 tw:z-[9600] tw:flex tw:w-[min(360px,calc(100vw-32px))] tw:flex-col tw:gap-2.5 tw:pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      <TransitionGroup name="nv-toast">
        <article
          v-for="toast in toastState.items"
          :key="toast.id"
          class="nv-toast tw:pointer-events-auto tw:flex tw:items-start tw:gap-2.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-content-primary tw:py-3 tw:px-3.5 tw:text-surface-canvas tw:shadow-(--shadow-overlay)"
          :class="`nv-toast--${toast.variant}`"
          role="status"
        >
          <span class="nv-toast__icon tw:flex-none tw:grid tw:mt-px tw:place-items-center tw:text-inherit" aria-hidden="true">
            <component :is="iconFor(toast.variant)" :size="16" />
          </span>
          <div class="nv-toast__body tw:min-w-0 tw:flex-1 tw:grid tw:gap-0.5">
            <div v-if="toast.title" class="nv-toast__title tw:text-[13px] tw:font-[640] tw:tracking-normal">{{ toast.title }}</div>
            <div class="nv-toast__message tw:text-[12.5px] tw:leading-[1.45] tw:text-inherit tw:opacity-[0.82] tw:[overflow-wrap:anywhere]">{{ toast.message }}</div>
          </div>
          <button
            type="button"
            class="nv-toast__close tw:flex-none tw:grid tw:h-[22px] tw:w-[22px] tw:-mt-0.5 tw:-mr-0.5 tw:place-items-center tw:cursor-pointer tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-inherit tw:opacity-[0.72] tw:transition-[background-color,opacity] tw:duration-[140ms] tw:hover:bg-[color-mix(in_oklab,var(--surface-canvas)_18%,transparent)] tw:hover:opacity-100"
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
