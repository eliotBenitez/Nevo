<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Link } from 'lucide-vue-next'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import NvButton from '../../../ui/primitives/NvButton.vue'

interface Props {
  card: KanbanCard
  board: KanbanBoard
}

const props = defineProps<Props>()
const { t } = useI18n()
const kanbanStore = useKanbanStore()
const workspaceStore = useWorkspaceStore()

const showLinkPicker = ref(false)
const linkSearch = ref('')

// Mirror the editor's note picker: read the full set of selectable items from a
// reliable, self-contained source instead of depending on the board view having
// populated the kanban store. We load the board's cards directly from the backend
// (falling back to whatever the store already holds), so the picker and linked-
// card titles always resolve regardless of how the modal was opened.
const boardCards = ref<KanbanCard[]>([])

async function loadBoardCards() {
  const backend = workspaceStore.backend
  if (backend) {
    try {
      boardCards.value = await backend.kanbanListCards(props.board.id)
      return
    } catch {
      // fall through to the store snapshot below
    }
  }
  boardCards.value = kanbanStore.cards.get(props.board.id) ?? []
}

onMounted(loadBoardCards)
watch(() => props.board.id, loadBoardCards)
// Refresh when the picker opens so newly created cards become selectable.
watch(showLinkPicker, open => { if (open) void loadBoardCards() })

const linkedCards = computed(() =>
  (props.card.links ?? []).map(link => {
    const target = boardCards.value.find(card => card.id === link.cardId)
    return { ...link, title: target?.title ?? t('kanban.card.unknownCard'), found: !!target }
  })
)

const linkableCards = computed(() => {
  const query = linkSearch.value.trim().toLowerCase()
  const linkedIds = new Set((props.card.links ?? []).map(link => link.cardId))
  return boardCards.value
    .filter(card =>
      card.id !== props.card.id
      && !linkedIds.has(card.id)
      && (card.title ?? '').toLowerCase().includes(query))
    .slice(0, 8)
})

async function pickLink(targetId: string) {
  showLinkPicker.value = false
  linkSearch.value = ''
  await kanbanStore.linkCards(props.board.id, props.card.id, targetId, 'related')
}
</script>

<template>
  <section class="km-section tw:mt-5 tw:min-w-0">
    <div class="km-section-label tw:m-0 tw:mb-2.5 tw:text-[11px] tw:font-bold tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">
      {{ t('kanban.card.linked') }}
      <span class="km-section-count tw:ml-1.5">{{ linkedCards.length }}</span>
    </div>
    <div class="km-links tw:flex tw:min-w-0 tw:flex-col tw:gap-2">
      <div v-for="link in linkedCards" :key="link.cardId" class="km-link-row tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-secondary">
        <span class="km-link-kind tw:shrink-0 tw:text-[var(--text-muted,var(--text-secondary))]">
          {{ link.kind === 'blocked-by'
            ? `↘ ${t('kanban.card.blocked')}`
            : link.kind === 'blocks'
              ? `↗ ${t('kanban.card.blocks')}`
              : `↔ ${t('kanban.card.related')}` }}
        </span>
        <span class="km-link-title" :class="{ 'km-link-title--missing tw:text-[var(--text-muted,var(--text-muted))]': !link.found }">
          {{ link.title }}
        </span>
      </div>
      <div v-if="!linkedCards.length" class="km-links-empty tw:text-[var(--text-muted,var(--text-muted))]">
        {{ t('kanban.card.linkedEmpty') }}
      </div>
      <NvButton class="km-add-link-btn tw:self-start" variant="ghost" @click="showLinkPicker = !showLinkPicker">
        <Link :size="10" /> {{ t('kanban.card.linkCard') }}
      </NvButton>
      <div v-if="showLinkPicker" class="km-link-picker tw:flex tw:flex-col tw:gap-2">
        <input
          v-model="linkSearch"
          class="km-link-search tw:box-border tw:w-full tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:outline-none tw:h-[34px] tw:px-2.5 tw:text-[13px]"
          :placeholder="t('kanban.card.searchCards')"
          autofocus
        />
        <div class="km-link-results tw:flex tw:flex-col tw:gap-1.5">
          <button
            v-for="linkCard in linkableCards"
            :key="linkCard.id"
            type="button"
            class="km-link-result tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2.5 tw:py-2 tw:text-left tw:text-content-secondary"
            @click="pickLink(linkCard.id)"
          >
            {{ linkCard.title || t('kanban.card.untitled') }}
          </button>
          <div v-if="!linkableCards.length" class="km-link-empty tw:text-[var(--text-muted,var(--text-muted))]">{{ t('kanban.card.noCardsFound') }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
