<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AlertTriangle, CheckCircle2, Info, X } from '../icons'
import { useToast, type ToastVariant } from '../composables/useToast'

const { t } = useI18n()
const { toastState, dismissToast, pauseToast, resumeToast, runToastAction } = useToast()

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

function iconFor(variant: ToastVariant) {
  return icons[variant]
}

// Ghost controls on the inverted toast surface (docs/design/nevo-reference.html `.toast .btn`).
const ghostButton =
  'tw:flex-none tw:inline-flex tw:h-[26px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-nv-sm tw:border-0 tw:bg-transparent tw:text-inherit tw:transition-[background-color,opacity] tw:duration-[120ms] tw:hover:bg-[color-mix(in_oklab,var(--surface-canvas)_16%,transparent)] tw:active:scale-[0.97] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-current tw:motion-reduce:transition-none tw:motion-reduce:active:scale-100'
</script>

<template>
  <Teleport to="body">
    <!-- Bottom-centre keeps toasts clear of the window controls and pane headers; on phones it sits above the bottom navigation. -->
    <div
      class="nv-toast-host tw:fixed tw:left-1/2 tw:bottom-[calc(20px+var(--safe-area-bottom,0px))] tw:max-md:bottom-[calc(92px+var(--safe-area-bottom,0px))] tw:z-[9600] tw:flex tw:w-[min(440px,calc(100vw-32px))] tw:-translate-x-1/2 tw:flex-col tw:items-center tw:gap-2 tw:pointer-events-none"
      role="region"
      aria-live="polite"
      :aria-label="t('common.notifications')"
    >
      <TransitionGroup name="nv-toast">
        <article
          v-for="toast in toastState.items"
          :key="toast.id"
          class="nv-toast tw:pointer-events-auto tw:flex tw:max-w-full tw:items-center tw:gap-2.5 tw:rounded-nv-md tw:py-2.5 tw:pr-2 tw:pl-3.5 tw:bg-content-primary tw:text-surface-canvas tw:text-[13px] tw:shadow-(--shadow-overlay)"
          :class="`nv-toast--${toast.variant}`"
          role="status"
          @mouseenter="pauseToast(toast.id)"
          @mouseleave="resumeToast(toast.id)"
          @focusin="pauseToast(toast.id)"
          @focusout="resumeToast(toast.id)"
        >
          <span class="nv-toast__icon tw:flex-none tw:grid tw:place-items-center tw:text-inherit" :class="{ 'tw:self-start tw:pt-0.5': toast.title }" aria-hidden="true">
            <component :is="iconFor(toast.variant)" :size="16" />
          </span>
          <div class="nv-toast__body tw:min-w-0 tw:flex-1 tw:grid tw:gap-0.5 tw:leading-[1.4]">
            <div v-if="toast.title" class="nv-toast__title tw:font-[620]">{{ toast.title }}</div>
            <div class="nv-toast__message tw:[overflow-wrap:anywhere]" :class="{ 'tw:opacity-80': toast.title }">{{ toast.message }}</div>
          </div>
          <button
            v-if="toast.action"
            type="button"
            class="nv-toast__action tw:px-2.5 tw:text-[12px] tw:font-medium"
            :class="ghostButton"
            @click="runToastAction(toast.id)"
          >
            {{ toast.action.label }}
          </button>
          <button
            type="button"
            class="nv-toast__close tw:w-[26px] tw:p-0 tw:opacity-70 tw:hover:opacity-100"
            :class="ghostButton"
            :aria-label="t('common.close')"
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

.nv-toast-move {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.nv-toast-enter-from,
.nv-toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .nv-toast-enter-active,
  .nv-toast-leave-active {
    transition: opacity 120ms ease;
  }

  .nv-toast-move {
    transition: none;
  }

  .nv-toast-enter-from,
  .nv-toast-leave-to {
    transform: none;
  }
}
</style>
