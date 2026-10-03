<script setup lang="ts">
import type { NevoSlashItem } from '../../../types/editor-plugin'
import type { SlashMenuGroup } from '../../composables/editor/useSlashMenuGroups'

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
  <div v-for="group in groups" :key="group.key" class="slash-menu__group">
    <div v-if="group.label" class="slash-menu__category tw:px-3 tw:pt-1.5 tw:pb-1 tw:font-nv-ui tw:text-[10px] tw:leading-none tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ group.label }}</div>
    <button
      v-for="entry in group.entries"
      :key="entry.item.id"
      type="button"
      class="slash-menu__item tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2 tw:rounded-none tw:border-0 tw:px-3 tw:py-[7px] tw:text-left tw:font-nv-ui tw:text-[13px] tw:leading-[1.35] tw:text-content-secondary tw:transition-[background,color] tw:duration-140 tw:hover:bg-(--accent-soft) tw:max-[719px]:min-h-11 tw:max-[719px]:px-3.5 tw:max-[719px]:py-2"
      :class="entry.index === activeIndex ? 'is-active tw:bg-(--accent-soft)' : 'tw:bg-transparent'"
      @mousedown="emit('itemMousedown', $event)"
      @click="emit('select', entry.item)"
    >
      <span class="slash-menu__content tw:inline-flex tw:min-w-0 tw:items-center tw:gap-2.5">
        <span class="slash-menu__icon tw:inline-flex tw:size-7 tw:flex-[0_0_28px] tw:items-center tw:justify-center tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover-strong) tw:text-content-secondary">
          <component :is="entry.icon" :size="13" aria-hidden="true" />
        </span>
        <span class="slash-menu__title tw:min-w-0 tw:text-[13.2px] tw:leading-[1.35] tw:font-medium tw:text-content-primary">{{ entry.title }}</span>
      </span>
      <span class="slash-menu__id tw:font-nv-mono tw:text-[10px] tw:leading-none tw:whitespace-nowrap tw:text-content-muted">{{ entry.meta }}</span>
    </button>
  </div>
</template>
