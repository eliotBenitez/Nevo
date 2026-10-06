<script setup lang="ts">
import { Columns3, Home, Menu, Search, StickyNote } from '@lucide/vue'
import { computed, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'

export type MobileWorkspaceTab = 'home' | 'notes' | 'search' | 'boards' | 'more'

defineProps<{
  active: Exclude<MobileWorkspaceTab, 'search'>
}>()

const emit = defineEmits<{
  navigate: [tab: MobileWorkspaceTab]
}>()

const { t } = useI18n()
// data-tour targets for MOBILE_TOUR_STEPS (src/features/onboarding/tour/tourSteps.ts) —
// 'home' and 'more' have no dedicated tour step.
const TOUR_TARGETS: Partial<Record<MobileWorkspaceTab, string>> = {
  notes: 'mobile-notes',
  search: 'mobile-search',
  boards: 'mobile-boards',
}
const items = computed(() => [
  { id: 'home' as const, label: t('workspace.mobile.navigation.home'), icon: markRaw(Home) },
  { id: 'notes' as const, label: t('workspace.mobile.navigation.notes'), icon: markRaw(StickyNote) },
  { id: 'search' as const, label: t('workspace.mobile.navigation.search'), icon: markRaw(Search) },
  { id: 'boards' as const, label: t('workspace.mobile.navigation.boards'), icon: markRaw(Columns3) },
  { id: 'more' as const, label: t('workspace.mobile.navigation.more'), icon: markRaw(Menu) },
])

function navigate(tab: MobileWorkspaceTab) {
  emit('navigate', tab)
}
</script>

<template>
  <nav class="mobile-bottom-nav tw:absolute tw:inset-x-0 tw:bottom-0 tw:z-[45] tw:flex tw:h-[calc(76px+max(var(--safe-area-bottom),0px))] tw:items-start tw:border-t-0 tw:bg-(--frame-bg) tw:pt-2 tw:pr-[max(8px,var(--safe-area-right))] tw:pb-[max(12px,var(--safe-area-bottom))] tw:pl-[max(8px,var(--safe-area-left))]" :aria-label="t('workspace.mobile.navigation.label')">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :data-tour="TOUR_TARGETS[item.id]"
      class="mobile-bottom-nav__item tw:flex tw:min-h-[52px] tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(11px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-0.5 tw:py-[3px] tw:[font-family:inherit] tw:text-[9px]"
      :class="item.id === active ? 'mobile-bottom-nav__item--active tw:text-[color-mix(in_oklab,var(--accent)_78%,var(--text-primary))]' : 'tw:text-content-muted'"
      :aria-current="item.id === active ? 'page' : undefined"
      @click="navigate(item.id)"
    >
      <component :is="item.icon" :size="20" class="tw:transition-transform tw:duration-[160ms]" :class="item.id === active ? 'tw:-translate-y-px' : ''" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
</template>
