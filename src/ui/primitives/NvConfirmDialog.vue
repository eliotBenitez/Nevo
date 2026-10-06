<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Check, CircleHelp, Trash2, X } from '@lucide/vue'
import NvButton from './NvButton.vue'
import NvModal from './NvModal.vue'
import { resolveConfirmDialog, useConfirmDialog } from '../composables/useConfirmDialog'

const { t } = useI18n()
const { confirmDialogState } = useConfirmDialog()

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

function cancel() {
  resolveConfirmDialog(false)
}

function submit() {
  resolveConfirmDialog(true)
}

// This dialog is mounted once, globally, outside any single owning view, and
// resolves a promise every caller awaits — so it keeps its own capture-phase
// window Escape listener (reaches it even if focus never lands inside) and
// its onBeforeUnmount cancel (an unmount while active must not hang a
// caller), instead of deferring to NvModal's per-panel Escape handling.
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
  <NvModal
    :open="active"
    size="sm"
    :dismissible="false"
    :close-on-backdrop="true"
    labelled-by="nv-confirm-title"
    described-by="nv-confirm-message"
    :panel-class="variant === 'danger' ? 'nv-confirm-dialog--danger' : undefined"
    @close="cancel"
  >
    <template #header>
      <span
        class="nv-confirm-dialog__icon tw:flex-none tw:grid tw:h-[34px] tw:w-[34px] tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid"
        :class="variant === 'danger'
          ? 'nv-confirm-dialog__icon--danger tw:border-[color:var(--danger-line,color-mix(in_oklab,var(--status-danger,oklch(0.56_0.19_25))_28%,transparent))] tw:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--status-danger-soft,transparent)_72%,var(--surface-overlay,transparent)),var(--status-danger-soft,transparent))] tw:text-[color:var(--status-danger,oklch(0.56_0.19_25))]'
          : 'tw:border-[color:var(--border-default,transparent)] tw:bg-[color-mix(in_oklab,var(--hover-strong,var(--hover))_80%,var(--surface-overlay,transparent))] tw:text-[color:var(--text-secondary,var(--text-secondary))]'"
        aria-hidden="true"
      >
        <AlertTriangle v-if="variant === 'danger'" :size="18" />
        <CircleHelp v-else :size="18" />
      </span>
      <div class="nv-confirm-dialog__heading tw:min-w-0 tw:grid tw:gap-[5px] tw:pt-0">
        <h2 id="nv-confirm-title" class="tw:m-0 tw:text-[color:var(--text-primary,var(--text-primary))] tw:text-[15.5px] tw:leading-[1.25] tw:font-[650] tw:tracking-normal">{{ title }}</h2>
        <p id="nv-confirm-message" class="nv-confirm-dialog__message tw:m-0 tw:text-[color:var(--text-secondary,var(--text-secondary))] tw:text-[13px] tw:leading-[1.45] tw:[overflow-wrap:anywhere]">{{ message }}</p>
      </div>
    </template>

    <template #footer>
      <footer class="nv-confirm-dialog__footer tw:flex tw:justify-end tw:gap-2 tw:max-[480px]:flex-col-reverse">
        <NvButton variant="ghost" class="nv-confirm-dialog__button" @click="cancel">
          <X :size="14" aria-hidden="true" />
          {{ cancelLabel }}
        </NvButton>
        <NvButton
          :variant="variant === 'danger' ? 'danger' : 'primary'"
          class="nv-confirm-dialog__button nv-confirm-dialog__button--confirm tw:min-w-[96px]"
          @click="submit"
        >
          <Trash2 v-if="variant === 'danger'" :size="14" aria-hidden="true" />
          <Check v-else :size="14" aria-hidden="true" />
          {{ confirmLabel }}
        </NvButton>
      </footer>
    </template>
  </NvModal>
</template>

<!-- The panel element lives inside NvModal's template and is teleported to <body>,
     so a scoped rule would not reach it. These two rules must stay unscoped. -->
<style>
.nv-confirm-dialog--danger {
  /* Clips the ::before bar to the panel's rounded corners, as the pre-NvModal panel did. */
  overflow: hidden;
  border-color: color-mix(in oklab, var(--status-danger) 36%, var(--border-strong));
}

.nv-confirm-dialog--danger::before {
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  content: '';
  background: linear-gradient(90deg, transparent, var(--status-danger), transparent);
}
</style>

<style scoped>
/* Shell (backdrop, panel box, position, radius, animation) is owned by NvModal
   (src/ui/primitives/NvModal.vue + src/styles/nv-modal.css). The panel-level danger
   accent comes back through NvModal's `panel-class` prop, minus the original
   `--danger-soft` box-shadow: outer glows are banned. */

.nv-confirm-dialog__footer :deep(.nv-btn) {
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

.nv-confirm-dialog__footer :deep(.nv-btn:hover:not(:disabled)) {
  transform: translateY(-1px);
}

.nv-confirm-dialog__footer :deep(.nv-btn:active:not(:disabled)) {
  transform: translateY(0) scale(0.98);
}

.nv-confirm-dialog__footer :deep(.nv-btn svg) {
  flex: 0 0 auto;
  stroke-width: 2;
}

@media (prefers-reduced-motion: reduce) {
  .nv-confirm-dialog__footer :deep(.nv-btn) {
    transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
  }

  .nv-confirm-dialog__footer :deep(.nv-btn:hover:not(:disabled)),
  .nv-confirm-dialog__footer :deep(.nv-btn:active:not(:disabled)) {
    transform: none;
  }
}

@media (max-width: 480px) {
  .nv-confirm-dialog__footer :deep(.nv-btn) {
    min-height: 44px;
    width: 100%;
    justify-content: center;
  }
}
</style>
