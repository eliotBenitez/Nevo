<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [level: number]
}>()

const { t } = useI18n()
const headingLevels = [1, 2, 3, 4, 5, 6] as const
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      id="mobile-editor-heading-menu"
      class="mobile-editor-heading-menu tw:fixed tw:z-[43] tw:right-[calc(12px+max(var(--safe-area-right),0px))] tw:bottom-[calc(88px+max(var(--safe-area-bottom),0px)+var(--mobile-keyboard-inset,0px))] tw:left-[calc(12px+max(var(--safe-area-left),0px))] tw:grid tw:grid-cols-[repeat(6,44px)] tw:justify-between tw:gap-0 tw:p-2 tw:overflow-x-auto tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(18px*var(--radius-scale,1))] tw:bg-(--menu-bg) tw:shadow-[var(--shadow-overlay)] tw:scrollbar-none [&::-webkit-scrollbar]:tw:hidden"
      role="menu"
      @pointerdown.prevent
      @keydown.esc.stop="emit('close')"
    >
      <button
        v-for="level in headingLevels"
        :key="level"
        type="button"
        role="menuitem"
        class="tw:grid tw:min-w-11 tw:min-h-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(11px*var(--radius-scale,1))] tw:text-content-secondary tw:bg-transparent tw:font-inherit tw:text-[13px] tw:font-[720] tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1"
        :aria-label="t(`slashMenu.items.h${level}`)"
        :title="t(`slashMenu.items.h${level}`)"
        @click="emit('select', level)"
      >
        H{{ level }}
      </button>
    </div>
  </Teleport>
</template>
