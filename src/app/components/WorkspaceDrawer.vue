<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, X } from '@lucide/vue'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; back: [] }>()
const { t } = useI18n()

const panelRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(panelRef, toRef(props, 'open'))

watch(() => props.open, async (open, wasOpen) => {
  if (open) {
    await nextTick()
    if (!props.open) return
    activate()
    panelRef.value?.querySelector<HTMLElement>('.workspace-drawer-close')?.focus()
  } else if (wasOpen) {
    deactivate()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (props.open) deactivate()
})

function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="workspace-drawer-backdrop tw:fixed tw:inset-0 tw:z-[55] tw:flex tw:justify-start tw:bg-scrim"
      @click.self="emit('close')"
      @keydown.esc="onEscape"
    >
      <div
        ref="panelRef"
        class="workspace-drawer-panel tw:w-[min(92vw,340px)] tw:h-full tw:flex tw:flex-col tw:bg-(--frame-bg) tw:border-r-0 tw:shadow-(--shadow-overlay)"
        role="dialog"
        aria-modal="true"
        :aria-label="t('workspace.drawerLabel')"
      >
        <div class="workspace-drawer-bar tw:flex tw:items-center tw:justify-between tw:gap-2 tw:p-3 tw:border-b-0">
          <button type="button" class="workspace-drawer-back nv-btn tw:min-w-0 tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" @click="emit('back')"><ArrowLeft :size="12" /><span>{{ t('workspace.back') }}</span></button>
          <button type="button" class="nv-btn workspace-drawer-close tw:min-w-0 tw:shrink-0 tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" :aria-label="t('workspace.closeDrawer')" @click="emit('close')">
            <X :size="14" />
            <span class="tw:sr-only">{{ t('workspace.closeDrawer') }}</span>
          </button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
