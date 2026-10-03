<script setup lang="ts">
import type { NevoSandboxSidebarItem } from '../../../types/editor-plugin'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'

interface Props {
  items: NevoSandboxSidebarItem[]
  activeRoutePath: string
}

defineProps<Props>()
const emit = defineEmits<{
  'open-item': [item: NevoSandboxSidebarItem]
  'item-contextmenu': [event: MouseEvent, item: NevoSandboxSidebarItem]
}>()
</script>

<template>
  <div class="sidebar-plugin-items tw:grid tw:gap-0.5 tw:py-2 tw:px-2.5 tw:border-t-0">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="sidebar-system__item tw:w-full tw:h-8 tw:border-none tw:bg-transparent tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:cursor-pointer tw:flex tw:items-center tw:gap-2.5 tw:px-2.5 tw:text-[12.5px] tw:text-left tw:transition-[background-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      :class="{ 'sidebar-system__item--active': activeRoutePath === item.route }"
      @click="emit('open-item', item)"
      @contextmenu="emit('item-contextmenu', $event, item)"
    >
      <NvNoteIcon :value="item.icon ?? 'lucide:blocks'" :size="14" />
      <span>{{ item.title }}</span>
    </button>
  </div>
</template>
