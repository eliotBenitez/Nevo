<script setup lang="ts">
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter,
} from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import NvMenuSeparator from '../../../ui/primitives/NvMenuSeparator.vue'
import type { NotebookAlignMode, NotebookDistributeAxis } from '../../../core/notebook/alignment'

const props = defineProps<{ unitCount: number; disabled?: boolean }>()
const emit = defineEmits<{ align: [mode: NotebookAlignMode]; distribute: [axis: NotebookDistributeAxis] }>()
const { t } = useI18n()
const open = ref(false)
const trigger = ref<InstanceType<typeof NvButton> | null>(null)
const canDistribute = computed(() => props.unitCount >= 3)
const aligns = computed(() => [
  { id: 'left' as const, icon: AlignStartVertical },
  { id: 'center' as const, icon: AlignCenterVertical },
  { id: 'right' as const, icon: AlignEndVertical },
  { id: 'top' as const, icon: AlignStartHorizontal },
  { id: 'middle' as const, icon: AlignCenterHorizontal },
  { id: 'bottom' as const, icon: AlignEndHorizontal },
].map(item => ({ ...item, label: t(`notebook.selection.align.${item.id}`) })))
const distributes = computed(() => [
  { id: 'horizontal' as const, icon: AlignHorizontalDistributeCenter, label: t('notebook.selection.align.distributeHorizontal') },
  { id: 'vertical' as const, icon: AlignVerticalDistributeCenter, label: t('notebook.selection.align.distributeVertical') },
])

function finish(): void {
  open.value = false
  nextTick(() => trigger.value?.$el.focus())
}
function pickAlign(mode: NotebookAlignMode): void {
  emit('align', mode)
  finish()
}
function pickDistribute(axis: NotebookDistributeAxis): void {
  if (!canDistribute.value) return
  emit('distribute', axis)
  finish()
}
</script>

<template>
  <NvPopupMenu v-model:open="open" placement="bottom" width="248px">
    <template #trigger>
      <NvButton
        ref="trigger" class="notebook-align-trigger" variant="ghost" size="sm" icon :disabled="disabled"
        :aria-label="t('notebook.selection.align.label')" :title="t('notebook.selection.align.label')"
        aria-haspopup="menu" :aria-expanded="open"
      >
        <AlignCenterHorizontal :size="16" aria-hidden="true" />
      </NvButton>
    </template>
    <NvButton
      v-for="item in aligns" :key="item.id" class="nv-menu-item notebook-align-option tw:h-auto tw:min-h-8 tw:w-full tw:justify-start tw:gap-2 tw:px-2 tw:py-1.5 tw:text-[12px] tw:coarse:min-h-11"
      variant="ghost" :aria-label="item.label" role="menuitem" @click.stop="pickAlign(item.id)"
    >
      <component :is="item.icon" :size="14" aria-hidden="true" />
      <span class="notebook-align-option__label tw:min-w-0 tw:flex-1 tw:whitespace-normal tw:text-left tw:leading-[1.3]">{{ item.label }}</span>
    </NvButton>
    <NvMenuSeparator />
    <NvButton
      v-for="item in distributes" :key="item.id" class="nv-menu-item notebook-align-option tw:h-auto tw:min-h-8 tw:w-full tw:justify-start tw:gap-2 tw:px-2 tw:py-1.5 tw:text-[12px] tw:coarse:min-h-11"
      variant="ghost" :aria-label="item.label" role="menuitem" :disabled="!canDistribute"
      :title="canDistribute ? undefined : t('notebook.selection.align.distributeHint')"
      @click.stop="pickDistribute(item.id)"
    >
      <component :is="item.icon" :size="14" aria-hidden="true" />
      <span class="notebook-align-option__label tw:min-w-0 tw:flex-1 tw:whitespace-normal tw:text-left tw:leading-[1.3]">{{ item.label }}</span>
    </NvButton>
  </NvPopupMenu>
</template>

<style scoped>
/* Long labels (e.g. "Распределить по горизонтали") must wrap rather than squeeze the icon. */
.notebook-align-option :deep(svg) { flex: none; }
</style>
