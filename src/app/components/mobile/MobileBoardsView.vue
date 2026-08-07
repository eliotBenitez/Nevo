<script setup lang="ts">
import { ChevronRight, Columns3, Plus } from 'lucide-vue-next'
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
  <main class="mobile-workspace-view mobile-boards">
    <header class="mobile-view-header">
      <div>
        <p class="mobile-view-header__eyebrow">{{ workspaceName }}</p>
        <h1>{{ t('workspace.boards.title') }}</h1>
      </div>
      <button
        v-if="enabled"
        type="button"
        class="mobile-icon-button mobile-icon-button--strong"
        :aria-label="t('workspace.boards.new')"
        @click="createBoard"
      >
        <Plus :size="22" />
      </button>
    </header>

    <section v-if="enabled && boards.length" class="mobile-board-list">
      <button
        v-for="board in boards"
        :key="board.id"
        type="button"
        class="mobile-board-card"
        @click="openBoard(board.id)"
      >
        <span class="mobile-board-card__icon">
          <NvNoteIcon :value="board.icon" :size="20" />
        </span>
        <span>
          <strong>{{ board.title }}</strong>
          <small>{{ t('workspace.mobile.boards.updated', { date: formatDate(board.updatedAt) }) }}</small>
        </span>
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
    </section>

    <section v-else class="mobile-empty-state mobile-empty-state--panel">
      <span class="mobile-empty-state__mark"><Columns3 :size="22" /></span>
      <strong>{{ enabled ? t('workspace.boards.emptyTitle') : t('workspace.mobile.boards.unavailable') }}</strong>
      <p>{{ enabled ? t('workspace.boards.emptySubtitle') : t('workspace.mobile.boards.unavailableDescription') }}</p>
      <button v-if="enabled" type="button" class="nv-btn nv-btn--primary" @click="createBoard">
        {{ t('workspace.boards.new') }}
      </button>
    </section>
  </main>
</template>
