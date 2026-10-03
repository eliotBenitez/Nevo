<script setup lang="ts">
import type { NevoSlashItem } from '../../../types/editor-plugin'
import type { SlashMenuGroup } from '../../composables/editor/useSlashMenuGroups'
import { slashGridColumns } from '../../../utils/slashMenuLayout'
import SlashBlockPreview from './SlashBlockPreview.vue'

defineProps<{ groups: SlashMenuGroup[], activeIndex: number }>()

const emit = defineEmits<{
  select: [item: NevoSlashItem]
  itemMousedown: [event: MouseEvent]
}>()
</script>

<template>
  <div v-for="group in groups" :key="group.key" class="slash-menu__group slash-menu__group--tiles">
    <div v-if="group.label" class="slash-menu__category tw:px-3 tw:pt-1.5 tw:pb-1 tw:font-nv-ui tw:text-[10px] tw:leading-none tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ group.label }}</div>
    <div class="slash-menu__tiles tw:grid tw:grid-cols-[repeat(var(--slash-grid-columns),minmax(0,1fr))] tw:gap-1.5 tw:px-2.5 tw:pt-0.5 tw:pb-2.5" :style="{ '--slash-grid-columns': slashGridColumns('preview') }">
      <button
        v-for="entry in group.entries"
        :key="entry.item.id"
        type="button"
        class="slash-menu__item slash-menu__tile tw:flex tw:min-h-[88px] tw:w-full tw:min-w-0 tw:cursor-pointer tw:flex-col tw:items-stretch tw:justify-start tw:gap-[7px] tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:p-1.5 tw:text-center tw:font-nv-ui tw:text-[13px] tw:leading-[1.35] tw:text-content-secondary tw:transition-[background,color] tw:duration-140 tw:hover:bg-surface-subtle tw:max-[719px]:min-h-11"
        :class="entry.index === activeIndex ? 'is-active tw:bg-(--accent-soft)' : 'tw:bg-transparent'"
        :title="entry.meta"
        @mousedown="emit('itemMousedown', $event)"
        @click="emit('select', entry.item)"
      >
        <SlashBlockPreview :item-id="entry.item.id" :icon="entry.icon" />
        <span class="slash-menu__tile-title tw:overflow-hidden tw:px-0.5 tw:pb-0.5 tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:text-content-primary">{{ entry.title }}</span>
      </button>
    </div>
  </div>
</template>
