<script setup lang="ts">
import { mobileWorkspaceViewClass, mobileViewHeaderClass, mobileViewEyebrowClass, mobileViewTitleClass, mobileIconButtonClass, mobileIconButtonStrongClass, mobileEmptyStateClass, mobileEmptyPanelClass, mobileEmptyMarkClass } from './mobileChromeClasses'
import { Columns3, EllipsisVertical, Plus, Trash2 } from '../../../ui/icons'
import { useI18n } from 'vue-i18n'
import NvMenuItem from '../../../ui/primitives/NvMenuItem.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { KanbanBoardMeta } from '../../../types/kanban'

defineProps<{
  workspaceName: string
  boards: KanbanBoardMeta[]
  enabled: boolean
}>()

const emit = defineEmits<{
  create: []
  open: [boardId: string]
  'board-action': [payload: { action: 'delete'; boardId: string; boardTitle: string; boardIcon: string }]
}>()

const { t, locale } = useI18n()

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(String(locale.value), { day: 'numeric', month: 'short' }).format(date)
}

function createBoard() {
  emit('create')
}

function openBoard(boardId: string) {
  emit('open', boardId)
}

function deleteBoard(board: KanbanBoardMeta) {
  emit('board-action', { action: 'delete', boardId: board.id, boardTitle: board.title, boardIcon: board.icon })
}
</script>

<template>
  <main class="mobile-workspace-view mobile-boards" :class="mobileWorkspaceViewClass">
    <header class="mobile-view-header" :class="mobileViewHeaderClass">
      <div>
        <p class="mobile-view-header__eyebrow" :class="mobileViewEyebrowClass">{{ workspaceName }}</p>
        <h1 :class="mobileViewTitleClass">{{ t('workspace.boards.title') }}</h1>
      </div>
      <button
        v-if="enabled"
        type="button"
        class="mobile-icon-button mobile-icon-button--strong" :class="[mobileIconButtonClass, mobileIconButtonStrongClass]"
        :aria-label="t('workspace.boards.new')"
        @click="createBoard"
      >
        <Plus :size="22" />
      </button>
    </header>

    <section v-if="enabled && boards.length" class="mobile-board-list tw:flex tw:flex-col tw:gap-2.5">
      <div
        v-for="board in boards"
        :key="board.id"
        class="mobile-board-card tw:flex tw:min-h-[82px] tw:items-center tw:rounded-[calc(17px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--surface-raised) tw:pr-1.5 tw:shadow-(--shadow-raised)"
      >
        <button
          type="button"
          class="mobile-board-card__open tw:grid tw:min-h-[82px] tw:min-w-0 tw:flex-1 tw:grid-cols-[46px_minmax(0,1fr)] tw:items-center tw:gap-3 tw:border-0 tw:bg-transparent tw:p-[13px] tw:pr-1 tw:text-left tw:text-content-primary"
          @click="openBoard(board.id)"
        >
          <span class="mobile-board-card__icon tw:grid tw:size-[46px] tw:place-items-center tw:rounded-[calc(14px*var(--radius-scale,1))] tw:bg-(--accent-soft) tw:text-accent">
            <NvNoteIcon :value="board.icon" :size="20" />
          </span>
          <span class="tw:flex tw:min-w-0 tw:flex-col tw:gap-[5px]">
            <strong class="tw:truncate tw:text-[15px]">{{ board.title }}</strong>
            <small class="tw:text-[11px] tw:text-content-muted">{{ t('workspace.mobile.boards.updated', { date: formatDate(board.updatedAt) }) }}</small>
          </span>
        </button>
        <NvPopupMenu placement="bottom-end" width="200px">
          <template #trigger>
            <button
              type="button"
              class="mobile-board-card__more tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent"
              :aria-label="t('kanban.common.moreActions')"
            >
              <EllipsisVertical :size="18" aria-hidden="true" />
            </button>
          </template>
          <NvMenuItem :icon="Trash2" :label="t('workspace.context.delete')" danger :action="() => deleteBoard(board)" />
        </NvPopupMenu>
      </div>
    </section>

    <section v-else class="mobile-empty-state mobile-empty-state--panel" :class="[mobileEmptyStateClass, mobileEmptyPanelClass]">
      <span class="mobile-empty-state__mark" :class="mobileEmptyMarkClass"><Columns3 :size="22" /></span>
      <strong class="tw:text-sm tw:text-content-secondary">{{ enabled ? t('workspace.boards.emptyTitle') : t('workspace.mobile.boards.unavailable') }}</strong>
      <p class="tw:m-0 tw:max-w-[280px] tw:text-xs tw:leading-normal">{{ enabled ? t('workspace.boards.emptySubtitle') : t('workspace.mobile.boards.unavailableDescription') }}</p>
      <button v-if="enabled" type="button" class="nv-btn nv-btn--primary tw:mt-1.5 tw:min-h-11" @click="createBoard">
        {{ t('workspace.boards.new') }}
      </button>
    </section>
  </main>
</template>
