<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Copy, RotateCcw } from 'lucide-vue-next'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'

interface Props {
  noteTitle: string
  noteIcon: string
  confirmation: { snapshotId: string; createdAt: string } | null
  confirmLabel: string
  canRestore: boolean
  canCopy: boolean
  restoring: boolean
  restoreError: string | null
  restoreWarning: string | null
  restoreSucceeded: boolean
  copying: boolean
  copyError: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  back: []
  copy: []
  'request-restore': []
  'cancel-restore': []
  'confirm-restore': []
}>()

const { t } = useI18n()
const cancelButton = ref<HTMLButtonElement | null>(null)

watch(() => props.confirmation, async confirmation => {
  if (confirmation) {
    await nextTick()
    cancelButton.value?.focus()
  }
})

function onConfirmationKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  if (props.restoring) return
  emit('cancel-restore')
}
</script>

<template>
  <header class="history-top-bar tw:flex tw:min-h-[78px] tw:shrink-0 tw:items-center tw:gap-[18px] tw:border-b-0 tw:bg-transparent tw:px-9 tw:py-3 tw:max-[719px]:min-h-16 tw:max-[719px]:flex-wrap tw:max-[719px]:gap-x-3 tw:max-[719px]:gap-y-2 tw:max-[719px]:px-3.5 tw:max-[719px]:pt-[calc(10px+max(var(--safe-area-top),0px))] tw:max-[719px]:pb-2.5">
    <button type="button" class="history-top-bar__back tw:inline-flex tw:h-10 tw:min-w-[200px] tw:shrink-0 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-none tw:border-0 tw:bg-transparent tw:pt-0 tw:pr-[22px] tw:pb-0 tw:pl-1 tw:font-nv-ui tw:text-[13px] tw:font-medium tw:text-content-muted tw:transition-colors tw:duration-[var(--dur-base)] tw:hover:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-[3px] tw:focus-visible:outline-accent tw:max-[719px]:min-w-0 tw:max-[480px]:pr-3" :aria-label="t('workspace.history.backToHistoryList')" @click="emit('back')">
      <ArrowLeft :size="14" aria-hidden="true" />
      <span class="tw:max-[480px]:hidden">{{ t('workspace.history.backToHistoryList') }}</span>
    </button>
    <div class="history-top-bar__identity tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-[9px]">
      <NvNoteIcon class="tw:max-[480px]:hidden" :value="noteIcon || '📄'" :size="17" />
      <strong class="tw:truncate tw:text-[15px] tw:font-[650] tw:text-content-primary" :title="noteTitle">{{ noteTitle || t('workspace.untitledNote') }}</strong>
      <span class="history-top-bar__subtitle tw:shrink-0 tw:text-[12.5px] tw:text-content-muted tw:max-[719px]:hidden">{{ t('workspace.history.subtitle') }}</span>
    </div>
    <div class="history-top-bar__actions tw:flex tw:shrink-0 tw:items-center tw:gap-2.5 tw:max-[719px]:w-full tw:max-[719px]:justify-end tw:max-[480px]:grid tw:max-[480px]:grid-cols-2">
      <span v-if="copyError" class="history-top-bar__error tw:max-w-80 tw:text-xs tw:leading-[1.35] tw:text-danger" role="alert">{{ copyError }}</span>
      <template v-if="confirmation">
        <div class="history-top-bar__confirmation tw:flex tw:items-center tw:gap-2.5 tw:max-[719px]:w-full tw:max-[719px]:justify-end tw:max-[480px]:col-span-2 tw:max-[480px]:grid tw:max-[480px]:grid-cols-2 tw:max-[480px]:gap-2" role="group" aria-labelledby="history-restore-confirmation" @keydown="onConfirmationKeydown">
          <span id="history-restore-confirmation" class="history-top-bar__confirm-text tw:max-w-[260px] tw:text-xs tw:leading-[1.35] tw:text-content-muted tw:max-[480px]:col-span-2">
            {{ t('workspace.history.restoreConfirmAt', { time: confirmLabel }) }}
          </span>
          <button ref="cancelButton" type="button" class="nv-btn tw:min-h-10 tw:rounded-nv-md tw:px-[17px] tw:text-[12.5px] tw:max-[719px]:min-h-11 tw:max-[719px]:flex-1 tw:max-[480px]:min-w-0 tw:max-[480px]:px-2" :disabled="restoring" @click="emit('cancel-restore')">
            {{ t('workspace.context.cancel') }}
          </button>
          <button type="button" class="nv-btn nv-btn--primary history-top-bar__confirm tw:min-h-10 tw:rounded-nv-md tw:px-[17px] tw:text-[12.5px] tw:max-[719px]:min-h-11 tw:max-[719px]:flex-1 tw:max-[480px]:min-w-0 tw:max-[480px]:px-2" :class="{ 'nv-btn--loading': restoring }" :disabled="!canRestore || restoring" @click="emit('confirm-restore')">
            <span v-if="restoring" class="nv-btn__spinner" aria-hidden="true" />
            <RotateCcw v-else :size="13" aria-hidden="true" />
            {{ t('workspace.context.confirm') }}
          </button>
        </div>
      </template>
      <template v-else>
        <button type="button" class="nv-btn history-top-bar__copy tw:min-h-10 tw:rounded-nv-md tw:border-transparent tw:bg-surface-subtle tw:px-[17px] tw:text-[12.5px] tw:max-[719px]:min-h-11 tw:max-[719px]:flex-1 tw:max-[480px]:min-w-0 tw:max-[480px]:px-2" :class="{ 'nv-btn--loading': copying }" :disabled="!canCopy || copying || restoring" @click="emit('copy')">
          <span v-if="copying" class="nv-btn__spinner" aria-hidden="true" />
          <Copy v-else :size="13" aria-hidden="true" />
          <span class="history-top-bar__action-label history-top-bar__action-label--long tw:max-[480px]:hidden">{{ copying ? t('workspace.history.copying') : t('workspace.history.copy') }}</span>
          <span class="history-top-bar__action-label history-top-bar__action-label--short tw:hidden tw:max-[480px]:inline">{{ copying ? t('workspace.history.copying') : t('workspace.history.copyShort') }}</span>
        </button>
        <button type="button" data-hint="historyRestore" class="nv-btn nv-btn--primary tw:min-h-10 tw:rounded-nv-md tw:border-content-primary tw:bg-content-primary tw:px-[17px] tw:text-[12.5px] tw:text-[var(--workspace-editor-surface)] tw:max-[719px]:min-h-11 tw:max-[719px]:flex-1 tw:max-[480px]:min-w-0 tw:max-[480px]:px-2" :disabled="!canRestore || restoring" @click="emit('request-restore')">
          <span v-if="restoring" class="nv-btn__spinner" aria-hidden="true" />
          <RotateCcw v-else :size="13" aria-hidden="true" />
          <span class="history-top-bar__action-label history-top-bar__action-label--long tw:max-[480px]:hidden">{{ t('workspace.history.restore') }}</span>
          <span class="history-top-bar__action-label history-top-bar__action-label--short tw:hidden tw:max-[480px]:inline">{{ t('workspace.history.restoreShort') }}</span>
        </button>
      </template>
      <span v-if="restoreError" class="history-top-bar__error tw:max-w-80 tw:text-xs tw:leading-[1.35] tw:text-danger" role="alert">{{ restoreError }}</span>
    </div>
    <div v-if="restoreWarning || restoreSucceeded" class="tw:sr-only" role="status" aria-live="polite">
      <span v-if="restoreSucceeded">{{ t('workspace.history.restoreSucceeded') }}</span>
      <span v-if="restoreWarning"> {{ restoreWarning }}</span>
    </div>
    <p v-if="restoreWarning" class="history-top-bar__warning tw:px-3 tw:py-1 tw:text-xs tw:text-content-secondary">{{ restoreWarning }}</p>
  </header>
</template>
