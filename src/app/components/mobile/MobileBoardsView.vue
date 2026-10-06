<script setup lang="ts">
import { mobileWorkspaceViewClass, mobileViewHeaderClass, mobileViewEyebrowClass, mobileViewTitleClass, mobileIconButtonClass, mobileIconButtonStrongClass, mobileEmptyStateClass, mobileEmptyPanelClass, mobileEmptyMarkClass } from './mobileChromeClasses'
import { ChevronRight, Columns3, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { KanbanBoardMeta } from '../../../types/kanban'

defineProps<{
  workspaceName: string
  boards: KanbanBoardMeta[]
  enabled: boolean
}>()

const emit = defineEmits<{
  create: []
  open: [boardId: string]
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
      <button
        v-for="board in boards"
        :key="board.id"
        type="button"
        class="mobile-board-card tw:grid tw:min-h-[82px] tw:w-full tw:grid-cols-[46px_minmax(0,1fr)_20px] tw:items-center tw:gap-3 tw:rounded-[calc(17px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-(--surface-raised) tw:p-[13px] tw:text-left tw:text-content-primary tw:shadow-(--shadow-raised)"
        @click="openBoard(board.id)"
      >
        <span class="mobile-board-card__icon tw:grid tw:size-[46px] tw:place-items-center tw:rounded-[calc(14px*var(--radius-scale,1))] tw:bg-(--accent-soft) tw:text-accent">
          <NvNoteIcon :value="board.icon" :size="20" />
        </span>
        <span class="tw:flex tw:min-w-0 tw:flex-col tw:gap-[5px]">
          <strong class="tw:truncate tw:text-[15px]">{{ board.title }}</strong>
          <small class="tw:text-[11px] tw:text-content-muted">{{ t('workspace.mobile.boards.updated', { date: formatDate(board.updatedAt) }) }}</small>
        </span>
        <ChevronRight :size="18" class="tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
      </button>
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
