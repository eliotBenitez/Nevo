<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, X } from '@lucide/vue'
import NvButton from './NvButton.vue'
import NvModal from './NvModal.vue'
import { resolvePasswordPrompt, usePasswordPrompt } from '../composables/usePasswordPrompt'

const { t } = useI18n()
const { passwordPromptState } = usePasswordPrompt()

const inputRef = ref<HTMLInputElement | null>(null)
const value = ref('')
const reveal = ref(false)

const active = computed(() => passwordPromptState.open)
const options = computed(() => passwordPromptState.options)
const required = computed(() => options.value?.required ?? true)
const canConfirm = computed(() => !required.value || value.value.length > 0)
const cancelLabel = computed(() => options.value?.cancelLabel ?? t('workspace.context.cancel'))
const confirmLabel = computed(() => options.value?.confirmLabel ?? t('workspace.context.confirm'))

// NvModal owns the focus trap and Escape; this only resets and refocuses the
// dialog's own input, which is specific to this dialog's content.
watch(active, async (open) => {
  if (open) {
    value.value = ''
    reveal.value = false
    await nextTick()
    await nextTick()
    inputRef.value?.focus()
  }
})

function cancel() {
  resolvePasswordPrompt(null)
}

function submit() {
  if (!canConfirm.value) return
  resolvePasswordPrompt(value.value)
}

// This resolves a promise, so an unmount while still active (app teardown,
// hot reload) must not leave the caller hanging forever.
onBeforeUnmount(() => {
  if (active.value) cancel()
})
</script>

<template>
  <NvModal
    :open="active"
    size="sm"
    :dismissible="false"
    labelled-by="nv-password-prompt-title"
    @close="cancel"
  >
    <template #header>
      <span class="nv-confirm-dialog__icon tw:flex-none tw:grid tw:h-[34px] tw:w-[34px] tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-[color:var(--border-default,transparent)] tw:bg-[color-mix(in_oklab,var(--hover-strong,var(--hover))_80%,var(--surface-overlay,transparent))] tw:text-[color:var(--text-secondary,var(--text-secondary))]" aria-hidden="true">
        <KeyRound :size="18" />
      </span>
      <div class="nv-confirm-dialog__heading tw:min-w-0 tw:grid tw:gap-[5px] tw:pt-0">
        <h2 id="nv-password-prompt-title" class="tw:m-0 tw:text-[color:var(--text-primary,var(--text-primary))] tw:text-[15.5px] tw:leading-[1.25] tw:font-[650] tw:tracking-normal">{{ options?.title }}</h2>
        <p v-if="options?.message" class="nv-confirm-dialog__message tw:m-0 tw:text-[color:var(--text-secondary,var(--text-secondary))] tw:text-[13px] tw:leading-[1.45] tw:[overflow-wrap:anywhere]">{{ options.message }}</p>
      </div>
    </template>

    <form class="nv-password-prompt__form tw:grid tw:gap-1.5" @submit.prevent="submit">
      <label class="nv-password-prompt__label tw:text-xs tw:font-semibold tw:text-[color:var(--text-secondary,var(--text-secondary))]" :for="'nv-password-prompt-input'">{{ options?.label }}</label>
      <div class="nv-password-prompt__field tw:relative tw:flex tw:items-center">
        <input
          id="nv-password-prompt-input"
          ref="inputRef"
          v-model="value"
          class="nv-password-prompt__input tw:h-[38px] tw:w-full tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:py-0 tw:pr-[38px] tw:pl-3 tw:text-[13px] tw:text-[color:var(--text-primary,var(--text-primary))] tw:outline-none tw:transition-[background-color,box-shadow] tw:duration-[140ms] tw:focus-visible:bg-(--surface-raised) tw:focus-visible:shadow-[0_0_0_2px_var(--input-ring)]"
          :type="reveal ? 'text' : 'password'"
          :placeholder="options?.placeholder"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        >
        <button
          type="button"
          class="nv-password-prompt__reveal tw:absolute tw:right-1.5 tw:grid tw:h-[26px] tw:w-[26px] tw:place-items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:hover:bg-(--hover) tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1"
          :aria-label="reveal ? t('workspaceTransfer.passwordPrompt.hide') : t('workspaceTransfer.passwordPrompt.show')"
          @click="reveal = !reveal"
        >
          <EyeOff v-if="reveal" :size="14" />
          <Eye v-else :size="14" />
        </button>
      </div>
      <p v-if="options?.errorMessage" class="nv-password-prompt__error tw:flex tw:items-center tw:gap-1.5 tw:m-0 tw:text-xs tw:text-[color:var(--status-danger,oklch(0.56_0.19_25))]">
        <AlertTriangle :size="12" aria-hidden="true" />
        {{ options.errorMessage }}
      </p>
    </form>

    <template #footer>
      <footer class="nv-confirm-dialog__footer tw:flex tw:justify-end tw:gap-2 tw:max-[480px]:flex-col-reverse">
        <NvButton variant="ghost" class="nv-confirm-dialog__button" @click="cancel">
          <X :size="14" aria-hidden="true" />
          {{ cancelLabel }}
        </NvButton>
        <NvButton
          variant="primary"
          class="nv-confirm-dialog__button nv-confirm-dialog__button--confirm tw:min-w-[96px]"
          :disabled="!canConfirm"
          @click="submit"
        >
          <Check :size="14" aria-hidden="true" />
          {{ confirmLabel }}
        </NvButton>
      </footer>
    </template>
  </NvModal>
</template>

<style scoped>
/* Shell (backdrop, panel box, position, radius, animation) is now owned by NvModal
   (src/ui/primitives/NvModal.vue + src/styles/nv-modal.css). Shares the remaining
   .nv-confirm-* content styling with NvConfirmDialog (./NvConfirmDialog.vue); only
   the form-specific rules below are unique to this dialog. */

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
