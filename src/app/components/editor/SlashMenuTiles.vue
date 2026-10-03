<script setup lang="ts">
import type { NevoSlashItem } from '../../../types/editor-plugin'
import type { SlashMenuGroup } from '../../composables/editor/useSlashMenuGroups'
import { slashGridColumns } from '../../../utils/slashMenuLayout'

defineProps<{
  groups: SlashMenuGroup[]
  activeIndex: number
}>()

const emit = defineEmits<{
  select: [item: NevoSlashItem]
  itemMousedown: [event: MouseEvent]
}>()
</script>

<template>
  <div
    v-for="group in groups"
    :key="group.key"
    class="slash-menu__group slash-menu__group--tiles"
  >
    <div v-if="group.label" class="slash-menu__category tw:px-3 tw:pt-1.5 tw:pb-1 tw:font-nv-ui tw:text-[10px] tw:leading-none tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ group.label }}</div>
    <div class="slash-menu__tiles tw:grid tw:grid-cols-[repeat(var(--slash-grid-columns),minmax(0,1fr))] tw:gap-1.5 tw:px-2.5 tw:pt-0.5 tw:pb-2.5" :style="{ '--slash-grid-columns': slashGridColumns('grid') }">
      <button
        v-for="entry in group.entries"
        :key="entry.item.id"
        type="button"
        class="slash-menu__item slash-menu__tile tw:flex tw:aspect-square tw:min-h-0 tw:w-full tw:min-w-0 tw:cursor-pointer tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-1 tw:py-2 tw:text-center tw:font-nv-ui tw:text-[13px] tw:leading-[1.35] tw:text-content-secondary tw:transition-[transform,box-shadow,background] tw:duration-120 tw:hover:bg-[color-mix(in_oklab,var(--accent)_5%,var(--surface-raised))] tw:max-[719px]:min-h-11"
        :class="entry.index === activeIndex ? 'is-active tw:-translate-y-0.5 tw:border-transparent tw:bg-(--surface-raised) tw:shadow-[0_0_0_2px_var(--accent),0_6px_14px_-6px_color-mix(in_oklab,var(--accent)_45%,transparent)]' : 'tw:border-[color-mix(in_oklab,var(--text-primary)_7%,transparent)] tw:bg-(--surface-raised) tw:shadow-[0_1px_0_color-mix(in_oklab,var(--text-primary)_8%,transparent),0_1px_3px_color-mix(in_oklab,var(--text-primary)_6%,transparent)]'"
        :title="entry.meta"
        @mousedown="emit('itemMousedown', $event)"
        @click="emit('select', entry.item)"
      >
        <span class="slash-menu__icon slash-menu__tile-icon tw:inline-flex tw:h-auto tw:w-auto tw:flex-none tw:items-center tw:justify-center tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent" :class="entry.index === activeIndex ? 'tw:text-accent' : 'tw:text-content-secondary'">
          <component :is="entry.icon" :size="22" :stroke-width="1.6" aria-hidden="true" />
        </span>
        <span class="slash-menu__tile-title tw:line-clamp-2 tw:max-w-full tw:overflow-hidden tw:wrap-anywhere tw:text-[11.5px] tw:leading-[1.3] tw:font-medium tw:text-content-primary">{{ entry.title }}</span>
      </button>
    </div>
  </div>
</template>
