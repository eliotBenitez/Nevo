<script setup lang="ts">
import { Kanban, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { KanbanBoardMeta } from '../../../types/kanban'

interface Props {
  boards?: KanbanBoardMeta[]
  activeBoardId?: string | null
}

defineProps<Props>()
const emit = defineEmits<{
  'create-board': []
  'open-board': [boardId: string]
  'board-contextmenu': [event: MouseEvent, board: KanbanBoardMeta]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="sidebar-boards tw:py-1 tw:border-t-0 tw:flex tw:flex-col tw:gap-px">
    <div class="sidebar-boards__header tw:flex tw:items-center tw:pt-0.5 tw:px-2.5 tw:pb-1">
      <span class="sidebar-boards__label tw:text-[10.5px] tw:font-semibold tw:text-content-muted tw:uppercase tw:tracking-[0.05em] tw:flex-1">{{ t('workspace.boards.title') }}</span>
      <button
        type="button"
        class="nv-btn sidebar-boards__add tw:w-6 tw:h-6 tw:p-0 tw:grid tw:place-items-center tw:text-content-muted tw:border-none tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-transparent tw:transition-[background-color,color] tw:duration-[140ms] tw:hover:text-content-primary tw:hover:bg-(--hover) tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
        :title="t('workspace.boards.new')"
        :aria-label="t('workspace.boards.new')"
        @click="emit('create-board')"
      >
        <Plus :size="12" />
      </button>
    </div>
    <button
      v-for="board in boards"
      :key="board.id"
      type="button"
      class="sidebar-board-item tw:w-full tw:h-[30px] tw:border-none tw:bg-transparent tw:text-content-secondary tw:rounded-[calc(8px*var(--radius-scale,1))] tw:cursor-pointer tw:flex tw:items-center tw:gap-[7px] tw:px-2.5 tw:text-[12.5px] tw:text-left tw:transition-[background-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      :class="{ 'sidebar-board-item--active': activeBoardId === board.id }"
      @click="emit('open-board', board.id)"
      @contextmenu.prevent="emit('board-contextmenu', $event, board)"
    >
      <span class="sidebar-board-item__icon tw:text-[13px] tw:leading-none tw:flex-none">{{ board.icon }}</span>
      <span class="sidebar-board-item__title tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ board.title }}</span>
    </button>
    <button
      v-if="!boards?.length"
      type="button"
      class="sidebar-board-empty tw:w-full tw:min-h-[56px] tw:border tw:border-dashed tw:border-(--border-default) tw:rounded-[calc(9px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--surface-raised)_74%,transparent)] tw:text-content-muted tw:cursor-pointer tw:grid tw:grid-cols-[26px_minmax(0,1fr)] tw:gap-2 tw:p-2 tw:px-2.5 tw:text-left tw:transition-[background-color,border-color,color] tw:duration-[140ms] tw:hover:border-[color-mix(in_oklab,var(--accent)_38%,var(--border-default))] tw:hover:bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] tw:hover:text-content-primary tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      @click="emit('create-board')"
    >
      <span class="sidebar-board-empty__icon tw:w-[26px] tw:h-[26px] tw:rounded-[calc(8px*var(--radius-scale,1))] tw:grid tw:place-items-center tw:text-accent tw:bg-(--accent-soft)"><Kanban :size="14" /></span>
      <span class="sidebar-board-empty__copy tw:min-w-0 tw:flex tw:flex-col tw:gap-0.5">
        <span class="sidebar-board-empty__title tw:text-content-secondary tw:text-xs tw:font-semibold">{{ t('workspace.boards.emptyTitle') }}</span>
        <span class="sidebar-board-empty__subtitle tw:text-content-muted tw:text-[11px] tw:leading-[1.35]">{{ t('workspace.boards.emptySubtitle') }}</span>
      </span>
      <span class="sidebar-board-empty__cta tw:col-start-2 tw:text-accent tw:text-[11px] tw:font-[650]">{{ t('workspace.boards.new') }}</span>
    </button>
  </div>
</template>
