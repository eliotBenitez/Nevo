<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { LayoutGrid, Table2, Calendar, Layers, Filter, ArrowUpDown, Search, Plus, Settings2, Eye, Rows3 } from 'lucide-vue-next'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { KanbanBoardCardViewSettings, KanbanCardDensity } from '../../../types/kanban'

export type KanbanViewMode = 'board' | 'table' | 'calendar'
export type KanbanGroupBy = 'status' | 'priority' | 'tag' | 'owner' | 'date'

interface Props {
  view: KanbanViewMode
  groupBy: KanbanGroupBy
  filterCount: number
  searchQuery: string
  boardTitle?: string
  cardCount?: number
  boardSettings?: KanbanBoardCardViewSettings
  cardPropertyOptions?: { id: string; name: string }[]
}

const props = withDefaults(defineProps<Props>(), {
  boardSettings: () => ({ showCardPreview: true, cardDensity: 'comfortable' }),
  cardPropertyOptions: () => [],
})

const emit = defineEmits<{
  'update:view': [view: KanbanViewMode]
  'update:groupBy': [groupBy: KanbanGroupBy]
  'update:searchQuery': [q: string]
  'open-filters': []
  'new-card': []
  'add-column': []
  'update:boardSettings': [settings: KanbanBoardCardViewSettings]
}>()

const { t } = useI18n()

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
  <div class="kb-toolbar">
    <!-- View switcher -->
    <div class="kb-toolbar__view-switcher">
      <button
        v-for="vid in (['board', 'table', 'calendar'] as KanbanViewMode[])"
        :key="vid"
        type="button"
        class="kb-toolbar__view-btn"
        :class="{ 'kb-toolbar__view-btn--active': view === vid }"
        @click="emit('update:view', vid)"
      >
        <LayoutGrid v-if="vid === 'board'" :size="11" />
        <Table2 v-else-if="vid === 'table'" :size="11" />
        <Calendar v-else :size="11" />
        {{ vid === 'board' ? t('kanban.toolbar.viewBoard') : vid === 'table' ? t('kanban.toolbar.viewTable') : t('kanban.toolbar.viewCalendar') }}
      </button>
    </div>

    <div class="kb-toolbar__sep" />

    <!-- Group by -->
    <div class="kb-toolbar__group">
      <Layers :size="11" class="kb-toolbar__icon" />
      <NvSelect
        :model-value="groupBy"
        :options="groupOptions"
        :min-width="110"
        @update:model-value="emit('update:groupBy', $event as KanbanGroupBy)"
      />
    </div>

    <!-- Filter -->
    <button
      type="button"
      class="kb-toolbar__btn"
      :class="{ 'kb-toolbar__btn--active': filterCount > 0 }"
      @click="emit('open-filters')"
    >
      <Filter :size="11" />
      {{ filterCount > 0 ? t('kanban.toolbar.filters', { n: filterCount }) : t('kanban.toolbar.filter') }}
    </button>

    <!-- Sort (static for now) -->
    <button type="button" class="kb-toolbar__btn">
      <ArrowUpDown :size="11" />
      {{ t('kanban.toolbar.sort') }}
    </button>

    <NvPopupMenu v-model:open="displayMenuOpen" placement="bottom-start" width="250px">
      <template #trigger>
        <button type="button" class="kb-toolbar__btn" :class="{ 'kb-toolbar__btn--active': displayMenuOpen }">
          <Settings2 :size="11" />
          {{ t('kanban.toolbar.display') }}
        </button>
      </template>
      <div class="kb-toolbar__display-content">
        <div class="kb-toolbar__menu-section">
          <label class="kb-toolbar__toggle-row">
            <input
              type="checkbox"
              :checked="showCardPreview"
              @change="emitSettings({ showCardPreview: ($event.target as HTMLInputElement).checked })"
            />
            <Eye :size="12" />
            <span>{{ t('kanban.toolbar.showPreview') }}</span>
          </label>
        </div>

        <div class="kb-toolbar__menu-section">
          <div class="kb-toolbar__menu-label">
            <Rows3 :size="12" />
            {{ t('kanban.toolbar.cardDensity') }}
          </div>
          <div class="kb-toolbar__density">
            <button
              type="button"
              class="kb-toolbar__density-btn"
              :class="{ 'kb-toolbar__density-btn--active': cardDensity === 'comfortable' }"
              @click="setDensity('comfortable')"
            >
              {{ t('kanban.toolbar.densityComfortable') }}
            </button>
            <button
              type="button"
              class="kb-toolbar__density-btn"
              :class="{ 'kb-toolbar__density-btn--active': cardDensity === 'compact' }"
              @click="setDensity('compact')"
            >
              {{ t('kanban.toolbar.densityCompact') }}
            </button>
          </div>
        </div>

        <div class="kb-toolbar__menu-section">
          <div class="kb-toolbar__menu-label">{{ t('kanban.toolbar.displayProperties') }}</div>
          <label
            v-for="property in cardPropertyOptions"
            :key="property.id"
            class="kb-toolbar__toggle-row"
          >
            <input
              type="checkbox"
              :checked="visiblePropertySet.has(property.id)"
              @change="toggleProperty(property.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ property.name }}</span>
          </label>
          <div v-if="!cardPropertyOptions.length" class="kb-toolbar__empty-menu">
            {{ t('kanban.toolbar.noProperties') }}
          </div>
        </div>
      </div>
    </NvPopupMenu>

    <div class="kb-toolbar__spacer" />

    <!-- Search -->
    <div class="kb-toolbar__search">
      <Search :size="10" class="kb-toolbar__search-icon" />
      <input
        class="kb-toolbar__search-input"
        :value="searchQuery"
        :placeholder="t('kanban.toolbar.search')"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- New card -->
    <button
      type="button"
      class="kb-toolbar__btn kb-toolbar__btn--primary"
      @click="emit('new-card')"
    >
      <Plus :size="11" />
      {{ t('kanban.board.newCard') }}
    </button>

    <!-- Add column -->
    <button
      type="button"
      class="kb-toolbar__btn kb-toolbar__btn--icon"
      :title="t('kanban.view.addColumn')"
      :aria-label="t('kanban.view.addColumn')"
      @click="emit('add-column')"
    >
      <Plus :size="13" />
    </button>
  </div>
</template>

<style scoped>
.kb-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  flex-shrink: 0;
  min-height: 44px;
}

/* View switcher pill */
.kb-toolbar__view-switcher {
  display: flex;
  padding: 2px;
  background: var(--hover-strong, var(--surface-2));
  border-radius: 7px;
  border: 1px solid var(--line-1, var(--border-subtle));
  gap: 1px;
}

.kb-toolbar__view-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 5px;
  border: none;
  background: transparent;
  font-size: 11.5px;
  font-weight: 450;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
  transition: background 0.1s, color 0.1s, box-shadow 0.1s;
  white-space: nowrap;
}

.kb-toolbar__view-btn--active {
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  font-weight: 550;
  box-shadow: 0 1px 4px oklch(0 0 0 / 0.10);
}

/* Separator */
.kb-toolbar__sep {
  width: 1px;
  height: 16px;
  background: var(--line-2, var(--border-subtle));
  flex-shrink: 0;
}

/* Group by */
.kb-toolbar__group {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3, var(--text-secondary));
}

.kb-toolbar__icon { flex-shrink: 0; }

.kb-toolbar__select {
  background: none;
  border: none;
  outline: none;
  font-size: 11.5px;
  color: var(--text-2, var(--text-secondary));
  cursor: pointer;
  padding: 0;
  appearance: none;
}

/* Generic toolbar button */
.kb-toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 9px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: none;
  font-size: 11.5px;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  white-space: nowrap;
}

.kb-toolbar__btn:hover {
  background: var(--hover, var(--surface-1));
  color: var(--text-1, var(--text-primary));
}

.kb-toolbar__btn--active {
  background: var(--accent-soft, oklch(0.66 0.10 258 / 0.12));
  color: var(--accent);
  border-color: oklch(0.66 0.10 258 / 0.20);
}

.kb-toolbar__btn--primary {
  background: var(--accent);
  color: white;
  border-color: transparent;
  font-weight: 550;
}

.kb-toolbar__btn--primary:hover {
  background: oklch(from var(--accent) calc(l - 0.05) c h);
  color: white;
}

.kb-toolbar__btn--icon {
  width: 28px;
  padding: 0;
  justify-content: center;
}

.kb-toolbar__display-content {
  display: flex;
  flex-direction: column;
}

.kb-toolbar__menu-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px;
}

.kb-toolbar__menu-section + .kb-toolbar__menu-section {
  border-top: 1px solid var(--line-1, var(--border-subtle));
}

.kb-toolbar__menu-label,
.kb-toolbar__toggle-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  font-size: 11.5px;
  color: var(--text-2, var(--text-secondary));
}

.kb-toolbar__menu-label {
  color: var(--text-4, var(--text-muted));
  font-weight: 600;
}

.kb-toolbar__toggle-row {
  cursor: pointer;
}

.kb-toolbar__toggle-row input {
  width: 13px;
  height: 13px;
  accent-color: var(--accent);
}

.kb-toolbar__density {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 2px;
  border-radius: 7px;
  background: var(--hover, var(--surface-1));
  border: 1px solid var(--line-1, var(--border-subtle));
}

.kb-toolbar__density-btn {
  height: 24px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-3, var(--text-secondary));
  font-size: 11px;
  cursor: pointer;
}

.kb-toolbar__density-btn--active {
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  box-shadow: 0 1px 4px oklch(0 0 0 / 0.10);
}

.kb-toolbar__empty-menu {
  padding: 4px 0;
  color: var(--text-4, var(--text-muted));
  font-size: 11.5px;
}

/* Spacer */
.kb-toolbar__spacer { flex: 1; }

/* Search */
.kb-toolbar__search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  background: var(--hover, var(--surface-1));
  border: 1px solid var(--line-1, var(--border-subtle));
  border-radius: 6px;
  width: 180px;
  transition: border-color 0.15s, width 0.2s;
}

.kb-toolbar__search:focus-within {
  border-color: var(--accent);
  width: 220px;
}

.kb-toolbar__search-icon {
  color: var(--text-4, var(--text-muted));
  flex-shrink: 0;
}

.kb-toolbar__search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 11.5px;
  color: var(--text-1, var(--text-primary));
  min-width: 0;
}

.kb-toolbar__search-input::placeholder {
  color: var(--text-4, var(--text-muted));
}
</style>
