<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, Columns3 } from 'lucide-vue-next'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import { findCardField, getBoardStatusProperty, getCardFieldDescriptors, getCardStatusValue } from './kanbanFields'

interface Props {
  board: KanbanBoard
  cards: KanbanCard[]
  searchQuery?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'open-card': [cardId: string] }>()
const { t, locale } = useI18n()

const selectedCardId = ref<string | null>(null)
const collapsedGroups = ref<Set<string>>(new Set())
const selectedFieldIds = ref<string[]>([])

const statusProp = computed(() => getBoardStatusProperty(props.board))

const availableFields = computed(() => getCardFieldDescriptors(props.cards))
const visibleColumns = computed(() =>
  availableFields.value.filter(field => selectedFieldIds.value.includes(field.id))
)

watch(availableFields, fields => {
  const nextIds = selectedFieldIds.value.filter(id => fields.some(field => field.id === id))
  if (nextIds.length === 0 && fields.length > 0) {
    selectedFieldIds.value = fields.slice(0, 4).map(field => field.id)
    return
  }
  if (nextIds.length !== selectedFieldIds.value.length) selectedFieldIds.value = nextIds
}, { immediate: true })

const filteredCards = computed(() => {
  const query = (props.searchQuery ?? '').toLowerCase().trim()
  if (!query) return props.cards
  return props.cards.filter(card => card.title.toLowerCase().includes(query))
})

const groups = computed(() => {
  const options = statusProp.value?.options ?? []
  if (!options.length) {
    return [{ id: '', name: t('kanban.groups.allCards'), dot: undefined, cards: filteredCards.value }]
  }

  return options.map(option => ({
    id: option.id,
    name: option.name,
    dot: option.color,
    cards: filteredCards.value.filter(card => getCardStatusValue(card, props.board) === option.id),
  })).filter(group => group.cards.length > 0)
})

const avgProgress = computed(() => {
  const numericValues = filteredCards.value.flatMap(card => {
    const progressField = card.fields.find(field =>
      field.type === 'number' && field.name.toLowerCase().includes('progress'),
    ) ?? card.fields.find(field => field.type === 'number')

    return typeof progressField?.value === 'number' ? [progressField.value] : []
  })

  if (!numericValues.length) return null
  return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
})

function toggleGroup(id: string) {
  if (collapsedGroups.value.has(id)) collapsedGroups.value.delete(id)
  else collapsedGroups.value.add(id)
}

function toggleVisibleField(fieldId: string) {
  if (selectedFieldIds.value.includes(fieldId)) {
    selectedFieldIds.value = selectedFieldIds.value.filter(id => id !== fieldId)
    return
  }
  selectedFieldIds.value = [...selectedFieldIds.value, fieldId]
}

function getFieldValue(card: KanbanCard, descriptorId: string): string {
  const field = findCardField(card, { id: descriptorId })
  if (!field) return '—'
  if (field.value === null || field.value === undefined || field.value === '') return '—'
  if (field.type === 'select' && typeof field.value === 'string') {
    return field.options?.find(option => option.id === field.value)?.name ?? field.value
  }
  if (field.type === 'multi_select' && Array.isArray(field.value)) {
    return field.value.map(optionId => field.options?.find(option => option.id === optionId)?.name ?? optionId).join(', ') || '—'
  }
  if (field.type === 'date' && typeof field.value === 'string') {
    const date = new Date(field.value)
    if (isNaN(date.getTime())) return field.value
    return date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
  }
  if (field.type === 'checkbox') return field.value ? '✓' : '—'
  return String(field.value)
}

function getFieldColor(card: KanbanCard, descriptorId: string): string | undefined {
  const field = findCardField(card, { id: descriptorId })
  if (!field) return undefined
  if (field.type === 'select' && typeof field.value === 'string') {
    return field.options?.find(option => option.id === field.value)?.color
  }
  if (field.type === 'date' && typeof field.value === 'string' && new Date(field.value) < new Date()) {
    return 'oklch(0.55 0.13 22)'
  }
  return undefined
}

function getStatusOption(card: KanbanCard) {
  const value = getCardStatusValue(card, props.board)
  return statusProp.value?.options?.find(option => option.id === value) ?? null
}
</script>

<template>
  <div class="kb-table">
    <div class="kb-table__toolbar">
      <NvPopupMenu placement="bottom-end" width="240px">
        <template #trigger>
          <button type="button" class="kb-table__field-btn">
            <Columns3 :size="12" />
            {{ t('kanban.table.chooseFields') }}
          </button>
        </template>
        <div class="kb-table__field-content">
          <label v-for="field in availableFields" :key="field.id" class="kb-table__field-option">
            <input
              type="checkbox"
              :checked="selectedFieldIds.includes(field.id)"
              @change="toggleVisibleField(field.id)"
            />
            <span>{{ field.name }}</span>
            <span class="kb-table__field-type">{{ field.type }}</span>
          </label>
          <div v-if="!availableFields.length" class="kb-table__field-empty">
            {{ t('kanban.table.noFields') }}
          </div>
        </div>
      </NvPopupMenu>
    </div>

    <div class="kb-table__scroll">
      <table class="kb-table__el">
        <thead>
          <tr class="kb-table__head-row">
            <th class="kb-table__th kb-table__th--check" />
            <th class="kb-table__th kb-table__th--title">{{ t('kanban.table.title') }}</th>
            <th class="kb-table__th kb-table__th--status">{{ statusProp?.name ?? t('kanban.table.status') }}</th>
            <th v-for="col in visibleColumns" :key="col.id" class="kb-table__th">
              {{ col.name }}
            </th>
          </tr>
        </thead>

        <tbody>
          <template v-for="group in groups" :key="group.id">
            <tr class="kb-table__group-row" @click="toggleGroup(group.id)">
              <td :colspan="3 + visibleColumns.length" class="kb-table__group-cell">
                <div class="kb-table__group-inner">
                  <ChevronDown
                    :size="10"
                    class="kb-table__group-chevron"
                    :class="{ 'kb-table__group-chevron--collapsed': collapsedGroups.has(group.id) }"
                  />
                  <span v-if="group.dot" class="kb-table__group-dot" :style="{ background: group.dot }" />
                  <span class="kb-table__group-name">{{ group.name }}</span>
                  <span class="kb-table__group-count">{{ group.cards.length }}</span>
                </div>
              </td>
            </tr>

            <template v-if="!collapsedGroups.has(group.id)">
              <tr
                v-for="card in group.cards"
                :key="card.id"
                class="kb-table__row"
                :class="{ 'kb-table__row--selected': selectedCardId === card.id }"
                @click="selectedCardId = card.id; emit('open-card', card.id)"
              >
                <td class="kb-table__td kb-table__td--check">
                  <span class="kb-table__check-dot" />
                </td>
                <td class="kb-table__td kb-table__td--title">
                  <span v-if="card.icon" class="kb-table__icon">{{ card.icon }}</span>
                  {{ card.title || t('kanban.table.noTitle') }}
                  <span v-if="selectedCardId === card.id" class="kb-table__caret" />
                </td>
                <td class="kb-table__td kb-table__td--status">
                  <span
                    v-if="getStatusOption(card)"
                    class="kb-table__status"
                    :style="getStatusOption(card)?.color
                      ? { background: `${getStatusOption(card)?.color}28`, color: getStatusOption(card)?.color }
                      : {}"
                  >
                    <span
                      class="kb-table__status-dot"
                      :style="getStatusOption(card)?.color ? { background: getStatusOption(card)?.color } : {}"
                    />
                    {{ getStatusOption(card)?.name }}
                  </span>
                </td>
                <td
                  v-for="col in visibleColumns"
                  :key="col.id"
                  class="kb-table__td"
                  :style="getFieldColor(card, col.id) ? { color: getFieldColor(card, col.id) } : {}"
                >
                  {{ getFieldValue(card, col.id) }}
                </td>
              </tr>
            </template>
          </template>
        </tbody>

        <tfoot>
          <tr class="kb-table__sum-row">
            <td class="kb-table__td" />
            <td class="kb-table__td kb-table__td--sum">
              {{ t('kanban.table.items', { n: filteredCards.length, g: groups.length }) }}
            </td>
            <td v-for="_ in (1 + visibleColumns.length)" :key="_" class="kb-table__td">
              <span v-if="_ === 1 && avgProgress !== null" class="kb-table__sum-prog">
                {{ t('kanban.table.avgProgress', { n: avgProgress }) }}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.kb-table {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.kb-table__toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px 0;
}

.kb-table__field-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: calc(8px * var(--radius-scale, 1));
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-2, var(--text-secondary));
  cursor: pointer;
}

.kb-table__field-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 2px;
}

.kb-table__field-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2, var(--text-secondary));
}

.kb-table__field-type,
.kb-table__field-empty {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-4, var(--text-muted));
}

.kb-table__scroll {
  flex: 1;
  overflow: auto;
  padding: 14px 20px 24px;
}

.kb-table__el {
  width: 100%;
  border-collapse: collapse;
  background: var(--glass-2, var(--surface-1));
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: calc(12px * var(--radius-scale, 1));
  overflow: hidden;
}

.kb-table__head-row {
  background: var(--hover, var(--surface-2));
  border-bottom: 1px solid var(--line-2, var(--border-subtle));
}

.kb-table__th {
  padding: 9px 13px;
  text-align: left;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-4, var(--text-muted));
  white-space: nowrap;
}

.kb-table__th--check {
  width: 28px;
  padding: 0 12px;
}

.kb-table__th--title {
  min-width: 220px;
}

.kb-table__th--status {
  width: 120px;
}

.kb-table__group-row {
  cursor: pointer;
  user-select: none;
}

.kb-table__group-cell {
  padding: 0;
  border-top: 1px solid var(--line-2, var(--border-subtle));
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  background: var(--hover-strong, var(--surface-2));
}

.kb-table__group-inner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
}

.kb-table__group-chevron {
  color: var(--text-3, var(--text-secondary));
  transition: transform 0.15s;
}

.kb-table__group-chevron--collapsed {
  transform: rotate(-90deg);
}

.kb-table__group-dot,
.kb-table__check-dot,
.kb-table__status-dot {
  border-radius: 50%;
}

.kb-table__group-dot {
  width: 6px;
  height: 6px;
}

.kb-table__group-name {
  font-size: 11.5px;
  font-weight: 550;
  color: var(--text-2, var(--text-secondary));
}

.kb-table__group-count,
.kb-table__sum-prog {
  font-size: 10.5px;
  color: var(--text-4, var(--text-muted));
  font-family: var(--font-mono, monospace);
}

.kb-table__row {
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  cursor: pointer;
}

.kb-table__row:hover {
  background: var(--hover, var(--surface-1));
}

.kb-table__row--selected {
  background: var(--accent-soft, oklch(0.66 0.10 258 / 0.10));
  outline: 1px solid oklch(0.66 0.10 258 / 0.28);
  outline-offset: -1px;
}

.kb-table__td {
  padding: 10px 13px;
  font-size: 12.5px;
  color: var(--text-2, var(--text-secondary));
  vertical-align: middle;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kb-table__td--check {
  width: 28px;
  padding: 10px 12px;
}

.kb-table__check-dot {
  display: inline-block;
  width: 4px;
  height: 4px;
  background: var(--text-4, var(--text-muted));
}

.kb-table__td--title {
  font-size: 13px;
  font-weight: 450;
  color: var(--text-1, var(--text-primary));
  min-width: 220px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.kb-table__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 500;
  background: var(--hover-strong, var(--surface-2));
}

.kb-table__status-dot {
  width: 6px;
  height: 6px;
  background: currentColor;
}

.kb-table__caret {
  width: 1.5px;
  height: 14px;
  background: var(--accent);
  border-radius: calc(1px * var(--radius-scale, 1));
  animation: kb-blink 1s step-start infinite;
}

.kb-table__sum-row {
  background: var(--hover, var(--surface-1));
  border-top: 1px solid var(--line-2, var(--border-subtle));
}

.kb-table__td--sum {
  color: var(--text-4, var(--text-muted));
  font-size: 11px;
}

@keyframes kb-blink {
  50% {
    opacity: 0;
  }
}
</style>
