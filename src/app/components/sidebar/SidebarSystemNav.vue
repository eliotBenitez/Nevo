<script setup lang="ts">
import { Archive, History, House, Network, Settings } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

interface Props {
  isHomeActive: boolean
  isGraphActive: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  'open-home': []
  'open-graph': []
  'open-history': []
  'open-trash': []
  'open-settings': []
  'graph-contextmenu': [event: MouseEvent]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="sidebar-system tw:py-2 tw:pb-2.5 tw:border-t-0 tw:border-b-0 tw:flex tw:flex-col tw:gap-0.5">
    <button
      type="button"
      class="sidebar-system__item tw:w-full tw:h-8 tw:border-none tw:bg-transparent tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:cursor-pointer tw:flex tw:items-center tw:gap-2.5 tw:px-2.5 tw:text-[12.5px] tw:text-left tw:transition-[background-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      :class="{ 'sidebar-system__item--active': isHomeActive }"
      @click="emit('open-home')"
    >
      <House :size="14" />
      <span>{{ t('workspace.system.home') }}</span>
    </button>
    <button
      type="button"
      data-tour="graph"
      class="sidebar-system__item tw:w-full tw:h-8 tw:border-none tw:bg-transparent tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:cursor-pointer tw:flex tw:items-center tw:gap-2.5 tw:px-2.5 tw:text-[12.5px] tw:text-left tw:transition-[background-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      :class="{ 'sidebar-system__item--active': isGraphActive }"
      @click="emit('open-graph')"
      @contextmenu="emit('graph-contextmenu', $event)"
    >
      <Network :size="14" />
      <span>{{ t('workspace.system.graph') }}</span>
    </button>
    <button
      type="button"
      class="sidebar-system__item tw:w-full tw:h-8 tw:border-none tw:bg-transparent tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:cursor-pointer tw:flex tw:items-center tw:gap-2.5 tw:px-2.5 tw:text-[12.5px] tw:text-left tw:transition-[background-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      @click="emit('open-history')"
    >
      <History :size="14" />
      <span>{{ t('workspace.system.history') }}</span>
    </button>
    <button
      type="button"
      class="sidebar-system__item tw:w-full tw:h-8 tw:border-none tw:bg-transparent tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:cursor-pointer tw:flex tw:items-center tw:gap-2.5 tw:px-2.5 tw:text-[12.5px] tw:text-left tw:transition-[background-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      @click="emit('open-trash')"
    >
      <Archive :size="14" />
      <span>{{ t('workspace.system.trash') }}</span>
    </button>
    <button
      type="button"
      class="sidebar-system__item tw:w-full tw:h-8 tw:border-none tw:bg-transparent tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:cursor-pointer tw:flex tw:items-center tw:gap-2.5 tw:px-2.5 tw:text-[12.5px] tw:text-left tw:transition-[background-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      @click="emit('open-settings')"
    >
      <Settings :size="14" />
      <span>{{ t('workspace.system.settings') }}</span>
    </button>
  </div>
</template>
