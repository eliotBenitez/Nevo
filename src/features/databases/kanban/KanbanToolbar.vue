<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { LayoutGrid, Table2, Calendar, Layers, Filter, ArrowUpDown, Search, Plus, Settings2, Eye, Rows3 } from 'lucide-vue-next'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import KanbanFilterPanel from './KanbanFilterPanel.vue'
import KanbanSortPanel from './KanbanSortPanel.vue'
import type { KanbanBoardCardViewSettings, KanbanCardDensity } from '../../../types/kanban'
import type { KanbanFilterField, KanbanFilterRule, KanbanSortRule } from './kanbanFilterSort'

export type KanbanViewMode = 'board' | 'table' | 'calendar'
export type KanbanGroupBy = 'status' | 'priority' | 'tag' | 'owner' | 'date'

interface Props {
  view: KanbanViewMode
  groupBy: KanbanGroupBy
  searchQuery: string
  filterFields?: KanbanFilterField[]
  filterRules?: KanbanFilterRule[]
  sortRules?: KanbanSortRule[]
  boardTitle?: string
  cardCount?: number
  boardSettings?: KanbanBoardCardViewSettings
  cardPropertyOptions?: { id: string; name: string }[]
}

const props = withDefaults(defineProps<Props>(), {
  boardSettings: () => ({ showCardPreview: true, cardDensity: 'comfortable' }),
  cardPropertyOptions: () => [],
  filterFields: () => [],
  filterRules: () => [],
  sortRules: () => [],
  boardTitle: undefined,
  cardCount: undefined,
})

const emit = defineEmits<{
  'update:view': [view: KanbanViewMode]
  'update:groupBy': [groupBy: KanbanGroupBy]
  'update:searchQuery': [q: string]
  'update:filterRules': [rules: KanbanFilterRule[]]
  'update:sortRules': [rules: KanbanSortRule[]]
  'new-card': []
  'add-column': []
  'update:boardSettings': [settings: KanbanBoardCardViewSettings]
}>()

const { t } = useI18n()

const filterMenuOpen = ref(false)
const sortMenuOpen = ref(false)
const filterCount = computed(() => props.filterRules.filter(rule => {
  if (rule.operator === 'is_empty' || rule.operator === 'is_not_empty') return true
  if (Array.isArray(rule.value)) return rule.value.length > 0
  return rule.value.trim() !== ''
}).length)
const sortCount = computed(() => props.sortRules.length)

const GROUP_IDS: KanbanGroupBy[] = ['status', 'priority', 'tag', 'owner', 'date']

const groupOptions = computed(() =>
  GROUP_IDS.map(id => ({ value: id, label: t(`kanban.groups.${id}`) }))
)

const displayMenuOpen = ref(false)

const visiblePropertyIds = computed(() => props.boardSettings.visiblePropertyIds ?? props.cardPropertyOptions.map(option => option.id))
const visiblePropertySet = computed(() => new Set(visiblePropertyIds.value))
const showCardPreview = computed(() => props.boardSettings.showCardPreview !== false)
const cardDensity = computed<KanbanCardDensity>(() => props.boardSettings.cardDensity === 'compact' ? 'compact' : 'comfortable')

function emitSettings(patch: KanbanBoardCardViewSettings) {
  emit('update:boardSettings', {
    ...props.boardSettings,
    ...patch,
  })
}

function toggleProperty(id: string, checked: boolean) {
  const next = new Set(visiblePropertyIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  emitSettings({
    visiblePropertyIds: props.cardPropertyOptions
      .map(option => option.id)
      .filter(optionId => next.has(optionId)),
    propertyOrder: props.boardSettings.propertyOrder ?? props.cardPropertyOptions.map(option => option.id),
  })
}

function setDensity(density: KanbanCardDensity) {
  emitSettings({ cardDensity: density })
}
</script>

<template>
  <div class="kb-toolbar tw:box-border tw:flex tw:min-h-11 tw:w-full tw:max-w-full tw:min-w-0 tw:shrink-0 tw:items-center tw:gap-1.5 tw:px-5 tw:py-[9px]">
    <!-- View switcher -->
    <div data-hint="kanbanViews" class="kb-toolbar__view-switcher tw:flex tw:gap-px tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:p-0.5">
      <button
        v-for="vid in (['board', 'table', 'calendar'] as KanbanViewMode[])"
        :key="vid"
        type="button"
        class="kb-toolbar__view-btn tw:inline-flex tw:items-center tw:gap-1 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-none tw:px-2.5 tw:py-[3px] tw:text-[11.5px] tw:whitespace-nowrap tw:transition-[background-color,color,box-shadow] tw:duration-100 tw:cursor-pointer"
        :class="view === vid
          ? 'kb-toolbar__view-btn--active tw:bg-surface-raised tw:text-content-primary tw:font-[550] tw:shadow-(--shadow-raised)'
          : 'tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))] tw:font-[450]'"
        @click="emit('update:view', vid)"
      >
        <LayoutGrid v-if="vid === 'board'" :size="11" />
        <Table2 v-else-if="vid === 'table'" :size="11" />
        <Calendar v-else :size="11" />
        {{ vid === 'board' ? t('kanban.toolbar.viewBoard') : vid === 'table' ? t('kanban.toolbar.viewTable') : t('kanban.toolbar.viewCalendar') }}
      </button>
    </div>

    <div class="kb-toolbar__sep tw:h-4 tw:w-px tw:shrink-0 tw:bg-transparent" />

    <!-- Group by -->
    <div class="kb-toolbar__group tw:flex tw:items-center tw:gap-[5px] tw:text-[var(--text-muted,var(--text-secondary))]">
      <Layers :size="11" class="kb-toolbar__icon tw:shrink-0" />
      <NvSelect
        :model-value="groupBy"
        :options="groupOptions"
        :min-width="110"
        @update:model-value="emit('update:groupBy', $event as KanbanGroupBy)"
      />
    </div>

    <!-- Filter -->
    <NvPopupMenu v-model:open="filterMenuOpen" placement="bottom-start" width="auto">
      <template #trigger>
        <button
          type="button"
          class="kb-toolbar__btn tw:inline-flex tw:h-[26px] tw:items-center tw:gap-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-2.5 tw:text-[11.5px] tw:whitespace-nowrap tw:transition-[background-color,color,border-color] tw:duration-100 tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-content-primary"
          :class="(filterCount > 0 || filterMenuOpen)
            ? 'kb-toolbar__btn--active tw:bg-[var(--accent-soft,rgb(161_98_7/0.12))] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_28%,transparent)]'
            : 'tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))] tw:border-transparent'"
        >
          <Filter :size="11" />
          {{ filterCount > 0 ? t('kanban.toolbar.filters', { n: filterCount }) : t('kanban.toolbar.filter') }}
        </button>
      </template>
      <KanbanFilterPanel
        :fields="filterFields"
        :model-value="filterRules"
        @update:model-value="emit('update:filterRules', $event)"
      />
    </NvPopupMenu>

    <!-- Sort -->
    <NvPopupMenu v-model:open="sortMenuOpen" placement="bottom-start" width="360px">
      <template #trigger>
        <button
          type="button"
          class="kb-toolbar__btn tw:inline-flex tw:h-[26px] tw:items-center tw:gap-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-2.5 tw:text-[11.5px] tw:whitespace-nowrap tw:transition-[background-color,color,border-color] tw:duration-100 tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-content-primary"
          :class="(sortCount > 0 || sortMenuOpen)
            ? 'kb-toolbar__btn--active tw:bg-[var(--accent-soft,rgb(161_98_7/0.12))] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_28%,transparent)]'
            : 'tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))] tw:border-transparent'"
        >
          <ArrowUpDown :size="11" />
          {{ sortCount > 0 ? t('kanban.toolbar.sorts', { n: sortCount }) : t('kanban.toolbar.sort') }}
        </button>
      </template>
      <KanbanSortPanel
        :fields="filterFields"
        :model-value="sortRules"
        @update:model-value="emit('update:sortRules', $event)"
      />
    </NvPopupMenu>

    <NvPopupMenu v-model:open="displayMenuOpen" placement="bottom-start" width="250px">
      <template #trigger>
        <button
          type="button"
          class="kb-toolbar__btn kb-toolbar__display-trigger tw:inline-flex tw:h-[26px] tw:items-center tw:gap-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-2.5 tw:text-[11.5px] tw:whitespace-nowrap tw:transition-[background-color,color,border-color] tw:duration-100 tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-content-primary"
          :class="displayMenuOpen
            ? 'kb-toolbar__btn--active tw:bg-[var(--accent-soft,rgb(161_98_7/0.12))] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_28%,transparent)]'
            : 'tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))] tw:border-transparent'"
        >
          <Settings2 :size="11" />
          {{ t('kanban.toolbar.display') }}
        </button>
      </template>
      <div class="kb-toolbar__display-content tw:flex tw:flex-col">
        <div class="kb-toolbar__menu-section tw:flex tw:flex-col tw:gap-1.5 tw:p-[7px]">
          <label class="kb-toolbar__toggle-row tw:flex tw:min-h-6 tw:items-center tw:gap-[7px] tw:text-[11.5px] tw:text-content-secondary tw:cursor-pointer">
            <input
              type="checkbox"
              class="tw:size-[13px] tw:accent-accent"
              :checked="showCardPreview"
              @change="emitSettings({ showCardPreview: ($event.target as HTMLInputElement).checked })"
            />
            <Eye :size="12" />
            <span>{{ t('kanban.toolbar.showPreview') }}</span>
          </label>
        </div>

        <div class="kb-toolbar__menu-section tw:flex tw:flex-col tw:gap-1.5 tw:p-[7px]">
          <div class="kb-toolbar__menu-label tw:flex tw:min-h-6 tw:items-center tw:gap-[7px] tw:text-[11.5px] tw:font-semibold tw:text-content-muted">
            <Rows3 :size="12" />
            {{ t('kanban.toolbar.cardDensity') }}
          </div>
          <div class="kb-toolbar__density tw:grid tw:grid-cols-2 tw:gap-1 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-[var(--hover,var(--surface-raised))] tw:p-0.5">
            <button
              type="button"
              class="kb-toolbar__density-btn tw:h-6 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-none tw:text-[11px] tw:cursor-pointer"
              :class="cardDensity === 'comfortable'
                ? 'kb-toolbar__density-btn--active tw:bg-surface-raised tw:text-content-primary tw:shadow-(--shadow-raised)'
                : 'tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))]'"
              @click="setDensity('comfortable')"
            >
              {{ t('kanban.toolbar.densityComfortable') }}
            </button>
            <button
              type="button"
              class="kb-toolbar__density-btn tw:h-6 tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-none tw:text-[11px] tw:cursor-pointer"
              :class="cardDensity === 'compact'
                ? 'kb-toolbar__density-btn--active tw:bg-surface-raised tw:text-content-primary tw:shadow-(--shadow-raised)'
                : 'tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))]'"
              @click="setDensity('compact')"
            >
              {{ t('kanban.toolbar.densityCompact') }}
            </button>
          </div>
        </div>

        <div class="kb-toolbar__menu-section tw:flex tw:flex-col tw:gap-1.5 tw:p-[7px]">
          <div class="kb-toolbar__menu-label tw:flex tw:min-h-6 tw:items-center tw:gap-[7px] tw:text-[11.5px] tw:font-semibold tw:text-content-muted">{{ t('kanban.toolbar.displayProperties') }}</div>
          <label
            v-for="property in cardPropertyOptions"
            :key="property.id"
            class="kb-toolbar__toggle-row tw:flex tw:min-h-6 tw:items-center tw:gap-[7px] tw:text-[11.5px] tw:text-content-secondary tw:cursor-pointer"
          >
            <input
              type="checkbox"
              class="tw:size-[13px] tw:accent-accent"
              :checked="visiblePropertySet.has(property.id)"
              @change="toggleProperty(property.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ property.name }}</span>
          </label>
          <div v-if="!cardPropertyOptions.length" class="kb-toolbar__empty-menu tw:py-1 tw:text-[11.5px] tw:text-content-muted">
            {{ t('kanban.toolbar.noProperties') }}
          </div>
        </div>
      </div>
    </NvPopupMenu>

    <div class="kb-toolbar__spacer tw:flex-1" />

    <!-- Search -->
    <div class="kb-toolbar__search tw:flex tw:h-[26px] tw:w-[180px] tw:items-center tw:gap-1.5 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:transition-[border-color,width] tw:duration-200 tw:focus-within:border-accent tw:focus-within:w-[220px] tw:max-[760px]:h-11 tw:max-[760px]:w-[156px] tw:max-[760px]:box-border tw:max-[760px]:focus-within:w-[196px]">
      <Search :size="10" class="kb-toolbar__search-icon tw:shrink-0 tw:text-content-muted" />
      <input
        class="kb-toolbar__search-input tw:min-w-0 tw:flex-1 tw:border-none tw:bg-transparent tw:text-[11.5px] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
        :value="searchQuery"
        :placeholder="t('kanban.toolbar.search')"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- New card -->
    <button
      type="button"
      class="kb-toolbar__btn kb-toolbar__btn--primary tw:inline-flex tw:h-[26px] tw:items-center tw:gap-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-accent tw:px-2.5 tw:text-[11.5px] tw:font-[550] tw:text-white tw:whitespace-nowrap tw:transition-colors tw:duration-100 tw:cursor-pointer tw:hover:bg-[oklch(from_var(--accent)_calc(l_-_0.05)_c_h)]"
      @click="emit('new-card')"
    >
      <Plus :size="11" />
      {{ t('kanban.board.newCard') }}
    </button>

    <!-- Add column -->
    <button
      type="button"
      class="kb-toolbar__btn kb-toolbar__btn--icon tw:inline-flex tw:h-[26px] tw:w-7 tw:items-center tw:justify-center tw:gap-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:text-[11.5px] tw:text-[var(--text-muted,var(--text-secondary))] tw:whitespace-nowrap tw:transition-[background-color,color,border-color] tw:duration-100 tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-content-primary tw:max-[760px]:w-11"
      :title="t('kanban.view.addColumn')"
      :aria-label="t('kanban.view.addColumn')"
      @click="emit('add-column')"
    >
      <Plus :size="13" />
    </button>
  </div>
</template>

<style scoped>
/* Restyles many toolbar children at once for the horizontal-scroll mobile
   layout (universal child selector, touch-target min-heights across three
   unrelated button classes, and a `:deep()` reach into NvSelect's internal
   trigger) — kept as one coherent block rather than touching ~8 elements
   individually. */
@media (max-width: 760px) {
  .kb-toolbar {
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding:
      8px
      calc(12px + max(var(--safe-area-right), 0px))
      8px
      calc(12px + max(var(--safe-area-left), 0px));
  }

  .kb-toolbar::-webkit-scrollbar {
    display: none;
  }

  .kb-toolbar > * {
    flex: 0 0 auto;
  }

  .kb-toolbar__spacer {
    display: none;
  }

  .kb-toolbar__view-btn,
  .kb-toolbar__btn,
  .kb-toolbar__group :deep(.nv-select__trigger) {
    min-height: 44px;
  }
}
</style>
